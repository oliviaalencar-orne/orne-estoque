/**
 * delivery-upload — Public endpoint for delivery drivers to upload proof photos
 *
 * GET  ?token=XXX  → Validate token, return minimal delivery info
 * POST { token, foto } → Upload photo, link to shipping
 *
 * Uses service_role key (no user auth required — drivers don't have accounts).
 * Security: UUID tokens, 48h expiry, max 5 uploads per token.
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
 * Validate a delivery token. Returns token data + shipping info if valid.
 */
async function validateToken(supabase: ReturnType<typeof createClient>, token: string) {
  const { data: tokenData, error } = await supabase
    .from("delivery_tokens")
    .select("*, shippings(nf_numero, cliente, destino)")
    .eq("token", token)
    .single();

  if (error || !tokenData) return { valid: false, error: "TOKEN_INVALIDO" };

  // Check expiry
  if (new Date(tokenData.expires_at) < new Date()) {
    await supabase.from("delivery_tokens").update({ status: "expirado" }).eq("id", tokenData.id);
    return { valid: false, error: "TOKEN_EXPIRADO" };
  }

  if (tokenData.status === "expirado") return { valid: false, error: "TOKEN_EXPIRADO" };
  if (tokenData.status === "usado") return { valid: false, error: "LIMITE_UPLOADS" };

  if (tokenData.uploads_count >= tokenData.max_uploads) {
    await supabase.from("delivery_tokens").update({ status: "usado" }).eq("id", tokenData.id);
    return { valid: false, error: "LIMITE_UPLOADS" };
  }

  return { valid: true, tokenData };
}

Deno.serve(async (req) => {
  // CORS preflight
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
    return jsonOk({
      valid: true,
      nf_numero: td.shippings?.nf_numero || "",
      cliente: td.shippings?.cliente || "",
      endereco: td.shippings?.destino || "",
      uploads_restantes: td.max_uploads - td.uploads_count,
      expira_em: td.expires_at,
    });
  }

  // ─── POST: Receive photo and save ───
  if (req.method === "POST") {
    let body: { token?: string; foto?: string };
    try {
      body = await req.json();
    } catch {
      return jsonErr("CORPO_INVALIDO", 400);
    }

    const { token, foto } = body;
    if (!token || !foto) return jsonErr("TOKEN_E_FOTO_OBRIGATORIOS", 400);

    // Validate token
    const result = await validateToken(supabase, token);
    if (!result.valid) return jsonErr(result.error!, result.error === "TOKEN_INVALIDO" ? 404 : 410);

    const td = result.tokenData!;

    // Validate image format
    if (!foto.startsWith("data:image/")) {
      return jsonErr("FORMATO_INVALIDO", 400);
    }

    const matches = foto.match(/^data:image\/(jpeg|jpg|png|webp|heic);base64,(.+)$/);
    if (!matches) return jsonErr("FORMATO_INVALIDO", 400);

    const ext = matches[1] === "jpg" ? "jpeg" : matches[1];
    const mimeType = `image/${ext}`;
    const base64Data = matches[2];

    // Decode base64
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Check size (max 10MB)
    if (bytes.length > 10 * 1024 * 1024) {
      return jsonErr("ARQUIVO_MUITO_GRANDE", 413);
    }

    // Upload to storage
    const fileName = `${td.shipping_id}/${Date.now()}_entregador.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("comprovantes-externos")
      .upload(fileName, bytes, { contentType: mimeType, upsert: false });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return jsonErr("ERRO_UPLOAD", 500);
    }

    // Append photo to shipping's comprovante_fotos
    const { data: shipping } = await supabase
      .from("shippings")
      .select("comprovante_fotos")
      .eq("id", td.shipping_id)
      .single();

    const fotosAtuais: string[] = shipping?.comprovante_fotos || [];
    const novasFotos = [...fotosAtuais, `externos:${fileName}`];

    const { error: updateError } = await supabase
      .from("shippings")
      .update({ comprovante_fotos: novasFotos })
      .eq("id", td.shipping_id);

    if (updateError) {
      console.error("Update shipping error:", updateError);
      return jsonErr("ERRO_SALVAR", 500);
    }

    // Increment upload counter
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

  return jsonErr("METODO_NAO_PERMITIDO", 405);
});
