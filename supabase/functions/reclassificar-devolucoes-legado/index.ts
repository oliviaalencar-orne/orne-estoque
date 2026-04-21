/**
 * reclassificar-devolucoes-legado — Uso único: varre shippings com
 * status='DEVOLVIDO' e reclassifica para ETIQUETA_CANCELADA quando
 * houver evidência clara no `rastreio_info.statusOriginal`.
 *
 * Escopo enxuto (Entrega 1 da Taxonomia de Devolução):
 *  - Único tipo reclassificado: ETIQUETA_CANCELADA
 *  - Único sinal considerado: rastreio_info->>'statusOriginal' ∈ {canceled, expired}
 *  - EXTRAVIADO, RECUSADO, ENTREGA_FALHOU, FALHA_NA_COLETA ficam para
 *    reclassificação manual (admin na UI) ou para entregas futuras.
 *
 * Admin-only via JWT + user_profiles.role='admin'+status='approved'.
 *
 * Input (POST body):
 *   { dryRun?: boolean, limit?: number }
 *     - dryRun: true (default) lista candidatos sem escrever
 *     - limit: cap de registros processados por chamada (default 500)
 *
 * Output (200):
 *   {
 *     dry_run, total_devolvidos, reclassificados, legado_mantido,
 *     por_tipo: { ETIQUETA_CANCELADA: n },
 *     sample_candidates: [{id, nf_numero, statusOriginal}],
 *     duration_ms
 *   }
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 2000;

function jsonOk(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function jsonErr(msg: string, status = 400) {
  return new Response(JSON.stringify({ success: false, error: msg }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getUserIdFromJwt(authHeader: string): Promise<string> {
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) throw new Error("Usuário não autenticado");
  return user.id;
}

async function assertIsAdmin(supabase: any, userId: string): Promise<void> {
  const { data: profile, error } = await supabase
    .from("user_profiles")
    .select("role, status")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(`Erro ao verificar perfil: ${error.message}`);
  if (!profile || profile.role !== "admin" || profile.status !== "approved") {
    const err = new Error("Acesso negado: apenas admin pode rodar reclassificação de devoluções");
    (err as any).statusCode = 403;
    throw err;
  }
}

/**
 * Regra única de match. Retorna objeto com o novo status e o motivo,
 * ou null se o registro não deve ser reclassificado automaticamente.
 */
function match(shipping: any): { novoStatus: string; motivo: string } | null {
  const so = shipping?.rastreio_info?.statusOriginal;
  if (typeof so === "string") {
    const lower = so.toLowerCase();
    // Também captura variações "ME:canceled|correios-sro:DEVOLVIDO"
    if (lower.includes("canceled") || lower.includes("expired")) {
      return {
        novoStatus: "ETIQUETA_CANCELADA",
        motivo: `rastreio_info.statusOriginal='${so}'`,
      };
    }
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonErr("Não autenticado", 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const userId = await getUserIdFromJwt(authHeader);
    try {
      await assertIsAdmin(supabase, userId);
    } catch (err: any) {
      return jsonErr(err.message, err.statusCode || 403);
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun !== false; // default TRUE (seguro)
    const limit = Math.min(Math.max(1, Number(body.limit) || DEFAULT_LIMIT), MAX_LIMIT);

    console.log(`[reclassificar] iniciando — dryRun=${dryRun} limit=${limit} user=${userId}`);

    const { data: devolvidos, error: listErr } = await supabase
      .from("shippings")
      .select("id, nf_numero, status, rastreio_info, tipo, date")
      .eq("status", "DEVOLVIDO")
      .order("date", { ascending: false })
      .limit(limit);

    if (listErr) {
      console.error("[reclassificar] erro ao listar:", listErr);
      return jsonErr(`DB list: ${listErr.message}`, 500);
    }

    const total = devolvidos?.length || 0;
    const candidatos: Array<{ row: any; novoStatus: string; motivo: string }> = [];
    for (const row of devolvidos || []) {
      const m = match(row);
      if (m) candidatos.push({ row, novoStatus: m.novoStatus, motivo: m.motivo });
    }

    const porTipo: Record<string, number> = {};
    for (const c of candidatos) porTipo[c.novoStatus] = (porTipo[c.novoStatus] || 0) + 1;

    const sample = candidatos.slice(0, 20).map((c) => ({
      id: c.row.id,
      nf_numero: c.row.nf_numero,
      tipo: c.row.tipo,
      statusOriginal: c.row.rastreio_info?.statusOriginal || null,
      novoStatus: c.novoStatus,
      motivo: c.motivo,
    }));

    if (dryRun) {
      return jsonOk({
        dry_run: true,
        total_devolvidos: total,
        reclassificados: 0,
        candidatos: candidatos.length,
        legado_mantido: total - candidatos.length,
        por_tipo: porTipo,
        sample_candidates: sample,
        duration_ms: Date.now() - startTime,
      });
    }

    // EXECUÇÃO REAL — UPDATE por registro com auditoria JSONB
    let reclassificados = 0;
    let errors = 0;
    const errorSample: string[] = [];
    const nowIso = new Date().toISOString();

    for (const c of candidatos) {
      try {
        const auditoria = {
          data: nowIso,
          de: "DEVOLVIDO",
          para: c.novoStatus,
          motivo_match: c.motivo,
          script: "reclassificar-devolucoes-legado",
          por_usuario_id: userId,
        };
        const { error: upErr } = await supabase
          .from("shippings")
          .update({
            status: c.novoStatus,
            reclassificacao_automatica: auditoria,
          })
          .eq("id", c.row.id)
          .eq("status", "DEVOLVIDO"); // guard contra race
        if (upErr) {
          errors++;
          if (errorSample.length < 5) errorSample.push(`${c.row.id}: ${upErr.message}`);
          continue;
        }
        reclassificados++;
      } catch (err: any) {
        errors++;
        if (errorSample.length < 5) errorSample.push(`${c.row.id}: ${err.message}`);
      }
    }

    const durationMs = Date.now() - startTime;
    console.log(
      `[reclassificar] FIM — ${reclassificados} reclassificados, ${errors} erros — ${durationMs}ms`,
    );

    return jsonOk({
      dry_run: false,
      total_devolvidos: total,
      reclassificados,
      candidatos: candidatos.length,
      legado_mantido: total - candidatos.length,
      por_tipo: porTipo,
      sample_candidates: sample,
      errors,
      error_sample: errorSample,
      duration_ms: durationMs,
    });
  } catch (err: any) {
    console.error("[reclassificar] erro fatal:", err);
    return jsonErr(err.message || "Erro interno", err.statusCode || 500);
  }
});
