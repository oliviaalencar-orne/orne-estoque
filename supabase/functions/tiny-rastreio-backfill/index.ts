/**
 * tiny-rastreio-backfill — Uso único: repoltra despachos existentes
 * para popular rastreio_info.dataUltimoEvento.
 *
 * Roda sob demanda (admin only). Itera sobre shippings com:
 *   - status intermediário (não ENTREGUE/DEVOLVIDO/AGUARDANDO_COLETA)
 *   - melhor_envio_id presente (não começa com ORD-)
 *   - rastreio_info->>dataUltimoEvento é NULL ou string vazia
 *
 * Delega cada lote para a Edge Function `rastrear-envio` (já faz o
 * fetch ME + Correios/melhorrastreio e persiste). Rate-limit de 500ms
 * entre lotes para não estourar a API ME.
 *
 * Input (POST body): opcional, aceita { limit: number, dryRun: boolean }
 *   - limit: máximo de registros a processar (default: 50, max: 200)
 *   - dryRun: se true, só lista candidatos sem chamar rastrear-envio
 *
 * Output (200):
 *   {
 *     total_candidates, processed, batches, duration_ms,
 *     sample_candidates: [{id, nf_numero, status, melhor_envio_id}],
 *     summary: { ... }
 *   }
 *
 * Admin-only via JWT + user_profiles.role='admin'.
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

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const BATCH_SIZE = 5;
const DELAY_BETWEEN_BATCHES_MS = 500;

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
  const {
    data: { user },
    error,
  } = await userClient.auth.getUser();
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
    const err = new Error("Acesso negado: apenas admin pode rodar backfill de rastreio");
    (err as any).statusCode = 403;
    throw err;
  }
}

/**
 * Invoca a EF rastrear-envio com os orderIds. Reusa a lógica de
 * fetch + persist sem duplicar código.
 */
async function invokeRastrearEnvio(orderIds: string[]): Promise<any> {
  const url = `${SUPABASE_URL}/functions/v1/rastrear-envio`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ orderIds }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`rastrear-envio retornou ${res.status}: ${body.slice(0, 200)}`);
  }
  return await res.json();
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
    const limit = Math.min(Math.max(1, Number(body.limit) || DEFAULT_LIMIT), MAX_LIMIT);
    const dryRun = !!body.dryRun;

    console.log(`[backfill] iniciando (limit=${limit}, dryRun=${dryRun}) — user ${userId}`);

    // Candidatos:
    //  - tipo = despacho (ou null)
    //  - status não-terminal e não AGUARDANDO_COLETA (problema interno)
    //  - melhor_envio_id presente e não ORD-*
    //  - rastreio_info->>dataUltimoEvento null OU string vazia
    const intermediateStatuses = ["DESPACHADO", "EM_TRANSITO", "SAIU_ENTREGA", "TENTATIVA_ENTREGA"];
    const { data: candidates, error: listErr } = await supabase
      .from("shippings")
      .select("id, nf_numero, status, melhor_envio_id, date, rastreio_info")
      .in("status", intermediateStatuses)
      .or("tipo.is.null,tipo.eq.despacho")
      .not("melhor_envio_id", "is", null)
      .not("melhor_envio_id", "like", "ORD-%")
      .order("date", { ascending: false })
      .limit(limit);

    if (listErr) {
      console.error("[backfill] erro ao listar candidatos:", listErr);
      return jsonErr(`DB list: ${listErr.message}`, 500);
    }

    // Filtra pós-query: só queremos os que não têm dataUltimoEvento
    const needsBackfill = (candidates || []).filter((c: any) => {
      const d = c.rastreio_info?.dataUltimoEvento;
      return d === null || d === undefined || d === "";
    });

    console.log(`[backfill] ${candidates?.length || 0} em status intermediário, ${needsBackfill.length} precisam de backfill`);

    if (dryRun) {
      return jsonOk({
        dry_run: true,
        total_candidates: needsBackfill.length,
        sample_candidates: needsBackfill.slice(0, 10).map((c: any) => ({
          id: c.id,
          nf_numero: c.nf_numero,
          status: c.status,
          melhor_envio_id: c.melhor_envio_id,
        })),
      });
    }

    if (needsBackfill.length === 0) {
      return jsonOk({
        total_candidates: 0,
        processed: 0,
        batches: 0,
        duration_ms: Date.now() - startTime,
        message: "Nada a fazer — nenhum despacho precisa de backfill",
      });
    }

    // Processa em lotes de BATCH_SIZE com rate limit
    let processed = 0;
    let updatedDate = 0;
    let errors = 0;
    const errorSample: string[] = [];
    const processedIds: string[] = []; // shipping.id dos registros processados (p/ query de verificação)
    const batches = Math.ceil(needsBackfill.length / BATCH_SIZE);

    for (let i = 0; i < needsBackfill.length; i += BATCH_SIZE) {
      const slice = needsBackfill.slice(i, i + BATCH_SIZE);
      const orderIds = slice.map((c: any) => c.melhor_envio_id);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;

      try {
        console.log(`[backfill] batch ${batchNum}/${batches} — ${orderIds.length} IDs`);
        const resp = await invokeRastrearEnvio(orderIds);
        processed += orderIds.length;
        slice.forEach((c: any) => processedIds.push(c.id));

        // Após o retorno, verifica se dataUltimoEvento foi populada no DB
        // (a EF persiste internamente, então só checamos)
        const { data: afterCheck } = await supabase
          .from("shippings")
          .select("id, rastreio_info")
          .in("id", slice.map((c: any) => c.id));

        (afterCheck || []).forEach((row: any) => {
          const d = row.rastreio_info?.dataUltimoEvento;
          if (d && d !== "") updatedDate++;
        });
      } catch (err: any) {
        errors += orderIds.length;
        if (errorSample.length < 5) errorSample.push(`batch ${batchNum}: ${err.message}`);
        console.error(`[backfill] batch ${batchNum} falhou:`, err.message);
      }

      // Rate limit entre lotes
      if (i + BATCH_SIZE < needsBackfill.length) {
        await new Promise((r) => setTimeout(r, DELAY_BETWEEN_BATCHES_MS));
      }
    }

    const durationMs = Date.now() - startTime;
    console.log(
      `[backfill] FIM — ${processed} processados, ${updatedDate} com dataUltimoEvento populada, ${errors} erros — ${durationMs}ms`,
    );

    return jsonOk({
      total_candidates: needsBackfill.length,
      processed,
      processed_ids: processedIds,
      updated_with_date: updatedDate,
      errors,
      error_sample: errorSample,
      batches,
      duration_ms: durationMs,
    });
  } catch (err: any) {
    console.error("[backfill] erro fatal:", err);
    return jsonErr(err.message || "Erro interno", err.statusCode || 500);
  }
});
