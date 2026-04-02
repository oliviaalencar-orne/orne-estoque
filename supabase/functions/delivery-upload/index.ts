/**
 * delivery-upload — Public endpoint for delivery drivers to upload proof photos
 *
 * Supports both single-NF tokens (legacy) and multi-NF tokens (new).
 *
 * GET  ?token=XXX  → Validate token, return delivery info (single or multi)
 * POST { token, foto, shipping_id? } → Upload photo, link to shipping, auto-update status
 *
 * Uses service_role key (no user auth required — drivers don't have accounts).
 * Security: UUID tokens, 48h expiry, max 5 photos per delivery.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function jsonOk(data: Record<string, unknown>) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonErr(msg: string, status = 400) {
  return new Response(JSON.stringify({ success: false, error: msg }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Validate a delivery token (basic checks: exists, not expired, not usado).
 */
async function validateToken(supabase: ReturnType<typeof createClient>, token: string) {
  const { data: tokenData, error } = await supabase
    .from("delivery_tokens")
    .select("*")
    .eq("token", token)
    .single();

  if (error || !tokenData) return { valid: false, error: "TOKEN_INVALIDO" };

  if (new Date(tokenData.expires_at) < new Date()) {
    await supabase.from("delivery_tokens").update({ status: "expirado" }).eq("id", tokenData.id);
    return { valid: false, error: "TOKEN_EXPIRADO" };
  }

  if (tokenData.status === "expirado") return { valid: false, error: "TOKEN_EXPIRADO" };
  if (tokenData.status === "usado") return { valid: false, error: "TOKEN_USADO" };

  return { valid: true, tokenData };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // ─── GET: Validate token and return delivery info ───
  if (req.method === "GET") {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    if (!token) return jsonErr("TOKEN_OBRIGATORIO", 400);

    const result = await validateToken(supabase, token);
    if (!result.valid) return jsonErr(result.error!, result.error === "TOKEN_INVALIDO" ? 404 : 410);

    const td = result.tokenData!;

    // ── Multi-NF token (no shipping_id → uses junction table) ──
    if (!td.shipping_id) {
      const { data: dtsRows } = await supabase
        .from("delivery_token_shippings")
        .select("id, shipping_id, status, fotos, comprovado_at")
        .eq("token_id", td.id);

      if (!dtsRows || dtsRows.length === 0) {
        return jsonErr("TOKEN_SEM_ENTREGAS", 404);
      }

      // Fetch shipping details for each
      const shippingIds = dtsRows.map((r: any) => r.shipping_id);
      const { data: shippingsData } = await supabase
        .from("shippings")
        .select("id, nf_numero, cliente, destino")
        .in("id", shippingIds);

      const shippingsMap: Record<string, any> = {};
      (shippingsData || []).forEach((s: any) => { shippingsMap[s.id] = s; });

      const entregas = dtsRows.map((r: any) => {
        const s = shippingsMap[r.shipping_id] || {};
        return {
          id: r.id,
          shipping_id: r.shipping_id,
          nf_numero: s.nf_numero || "",
          cliente: s.cliente || "",
          endereco: s.destino || "",
          status: r.status,
          fotos_count: (r.fotos || []).length,
          comprovado_at: r.comprovado_at,
        };
      });

      const comprovados = entregas.filter((e: any) => e.status === "comprovado").length;

      return jsonOk({
        valid: true,
        multi: true,
        entregador_nome: td.entregador_nome || "",
        entregas,
        total: entregas.length,
        comprovados,
        pendentes: entregas.length - comprovados,
        expira_em: td.expires_at,
      });
    }

    // ── Legacy single-NF token ──
    const { data: ship } = await supabase
      .from("shippings")
      .select("nf_numero, cliente, destino")
      .eq("id", td.shipping_id)
      .single();

    return jsonOk({
      valid: true,
      multi: false,
      nf_numero: ship?.nf_numero || "",
      cliente: ship?.cliente || "",
      endereco: ship?.destino || "",
      uploads_restantes: td.max_uploads - td.uploads_count,
      expira_em: td.expires_at,
    });
  }

  // ─── POST: Receive photo and save ───
  if (req.method === "POST") {
    let body: { token?: string; foto?: string; shipping_id?: string };
    try {
      body = await req.json();
    } catch {
      return jsonErr("CORPO_INVALIDO", 400);
    }

    const { token, foto, shipping_id: bodyShippingId } = body;
    if (!token || !foto) return jsonErr("TOKEN_E_FOTO_OBRIGATORIOS", 400);

    const result = await validateToken(supabase, token);
    if (!result.valid) return jsonErr(result.error!, result.error === "TOKEN_INVALIDO" ? 404 : 410);

    const td = result.tokenData!;

    // Validate image
    if (!foto.startsWith("data:image/")) return jsonErr("FORMATO_INVALIDO", 400);
    const matches = foto.match(/^data:image\/(jpeg|jpg|png|webp|heic);base64,(.+)$/);
    if (!matches) return jsonErr("FORMATO_INVALIDO", 400);

    const ext = matches[1] === "jpg" ? "jpeg" : matches[1];
    const mimeType = `image/${ext}`;
    const base64Data = matches[2];
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    if (bytes.length > 10 * 1024 * 1024) return jsonErr("ARQUIVO_MUITO_GRANDE", 413);

    // ── Determine target shipping ID ──
    let targetShippingId: string;
    let isMulti = false;
    let dtsId: string | null = null;

    if (!td.shipping_id) {
      // Multi-NF token
      isMulti = true;
      if (!bodyShippingId) return jsonErr("SHIPPING_ID_OBRIGATORIO", 400);

      // Validate shipping belongs to this token
      const { data: dtsRow } = await supabase
        .from("delivery_token_shippings")
        .select("id, status, fotos")
        .eq("token_id", td.id)
        .eq("shipping_id", bodyShippingId)
        .single();

      if (!dtsRow) return jsonErr("SHIPPING_NAO_PERTENCE_TOKEN", 403);

      const fotosCount = (dtsRow.fotos || []).length;
      if (fotosCount >= 5) return jsonErr("LIMITE_FOTOS_ENTREGA", 429);

      targetShippingId = bodyShippingId;
      dtsId = dtsRow.id;
    } else {
      // Legacy single-NF token
      targetShippingId = td.shipping_id;
      if (td.uploads_count >= td.max_uploads) return jsonErr("LIMITE_UPLOADS", 429);
    }

    // ── Upload to storage ──
    const fileName = `${targetShippingId}/${Date.now()}_entregador.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("comprovantes-externos")
      .upload(fileName, bytes, { contentType: mimeType, upsert: false });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return jsonErr("ERRO_UPLOAD", 500);
    }

    // ── Update shipping: append photo + auto-change status ──
    const { data: shipping } = await supabase
      .from("shippings")
      .select("comprovante_fotos, status")
      .eq("id", targetShippingId)
      .single();

    const fotosAtuais: string[] = shipping?.comprovante_fotos || [];
    const novasFotos = [...fotosAtuais, `externos:${fileName}`];

    const shippingUpdate: Record<string, unknown> = {
      comprovante_fotos: novasFotos,
    };

    // Auto-change status DESPACHADO/SAIU_ENTREGA → ENTREGUE
    const statusAutoChange = ["DESPACHADO", "SAIU_ENTREGA"];
    if (shipping && statusAutoChange.includes(shipping.status)) {
      shippingUpdate.status = "ENTREGUE";
      shippingUpdate.data_entrega = new Date().toISOString();
      shippingUpdate.recebedor_nome = `Comprovante via entregador: ${td.entregador_nome || ""}`;
    }

    const { error: updateError } = await supabase
      .from("shippings")
      .update(shippingUpdate)
      .eq("id", targetShippingId);

    if (updateError) {
      console.error("Update shipping error:", updateError);
      return jsonErr("ERRO_SALVAR", 500);
    }

    // ── Update token tracking ──
    if (isMulti && dtsId) {
      // Multi-NF: update junction table
      const { data: dtsRow } = await supabase
        .from("delivery_token_shippings")
        .select("fotos")
        .eq("id", dtsId)
        .single();

      const dtsPhotos = dtsRow?.fotos || [];
      const newDtsPhotos = [...dtsPhotos, `externos:${fileName}`];

      await supabase
        .from("delivery_token_shippings")
        .update({
          fotos: newDtsPhotos,
          status: "comprovado",
          comprovado_at: new Date().toISOString(),
        })
        .eq("id", dtsId);

      // Check if ALL deliveries for this token are now comprovado
      const { data: allDts } = await supabase
        .from("delivery_token_shippings")
        .select("status")
        .eq("token_id", td.id);

      const allComprovado = (allDts || []).every((r: any) => r.status === "comprovado");
      if (allComprovado) {
        await supabase.from("delivery_tokens").update({ status: "usado", used_at: new Date().toISOString() }).eq("id", td.id);
      }

      const comprovados = (allDts || []).filter((r: any) => r.status === "comprovado").length;

      return jsonOk({
        success: true,
        comprovados,
        total: (allDts || []).length,
        pendentes: (allDts || []).length - comprovados,
      });
    } else {
      // Legacy: update token counters
      const newCount = td.uploads_count + 1;
      const updates: Record<string, unknown> = {
        uploads_count: newCount,
        used_at: new Date().toISOString(),
      };
      if (newCount >= td.max_uploads) {
        updates.status = "usado";
      }
      await supabase.from("delivery_tokens").update(updates).eq("id", td.id);

      return jsonOk({
        success: true,
        uploads_restantes: td.max_uploads - newCount,
      });
    }
  }

  return jsonErr("METODO_NAO_PERMITIDO", 405);
});
