/**
 * tiny-sync-selective — Sincronização seletiva de produtos do Tiny ERP
 *
 * Atualiza apenas os SKUs informados, via array. Ideal para correções
 * pontuais sem precisar rodar o sync completo (~10.854 produtos).
 *
 * Input (POST):
 *   { "skus": ["ORNE001", "ORNE002", ...] }   // máx. 50
 *
 * Output (200):
 *   {
 *     total: 10,
 *     updated: 8,
 *     not_found: 1,
 *     errors: 1,
 *     duration_ms: 4230,
 *     details: [ { sku, status, message }, ... ]
 *   }
 *
 * Status codes:
 *   400 — input inválido ou > 50 SKUs
 *   401 — usuário não autenticado
 *   403 — usuário não é admin
 *   409 — sync de produtos completo em andamento (lock ocupado)
 *   500 — erro inesperado
 *
 * Reuso: segue os mesmos padrões de tiny-sync-product-single e
 * tiny-sync-products (token refresh, safeTinyFetch com backoff 429/503,
 * sibling strategy para variations).
 *
 * Lock: compartilha sync_log com tiny-sync-products — se houver um
 * registro type='products' status='running', bloqueia com 409.
 *
 * NÃO CRIA produtos novos. Apenas UPDATE de produtos existentes.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const TINY_API_BASE = "https://api.tiny.com.br/public-api/v3";
const TINY_TOKEN_URL = "https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token";

const MAX_SKUS_PER_CALL = 50;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

// =============================================================
// Token management — espelha tiny-sync-product-single v7
// =============================================================

async function safeGetAccessToken(supabase: any): Promise<string> {
  const { data: config, error } = await supabase
    .from("tiny_config_shared")
    .select("*")
    .eq("id", "default")
    .single();

  if (error || !config) throw new Error("Configuração Tiny não encontrada. Um admin precisa conectar o Tiny ERP.");
  if (!config.access_token) throw new Error("Token de acesso não configurado. Um admin precisa autorizar o Tiny ERP.");

  const expiresAt = config.token_expires_at ? new Date(config.token_expires_at) : null;
  if (expiresAt && expiresAt.getTime() - Date.now() > 60_000) {
    return config.access_token;
  }

  const updatedAt = config.updated_at ? new Date(config.updated_at).getTime() : 0;
  const secondsSinceUpdate = (Date.now() - updatedAt) / 1000;
  if (secondsSinceUpdate < 30) {
    console.log(`Token expirado mas updated_at recente (${secondsSinceUpdate.toFixed(0)}s). Aguardando 2s...`);
    await new Promise((r) => setTimeout(r, 2000));
    const { data: freshConfig } = await supabase
      .from("tiny_config_shared")
      .select("access_token, token_expires_at")
      .eq("id", "default")
      .single();
    if (freshConfig?.access_token) {
      const freshExpires = freshConfig.token_expires_at ? new Date(freshConfig.token_expires_at) : null;
      if (freshExpires && freshExpires.getTime() - Date.now() > 60_000) {
        return freshConfig.access_token;
      }
    }
  }
  return await safeRefreshToken(supabase, config.updated_at);
}

async function safeRefreshToken(supabase: any, originalUpdatedAt: string): Promise<string> {
  const { data: config, error } = await supabase
    .from("tiny_config_shared")
    .select("*")
    .eq("id", "default")
    .single();
  if (error || !config) throw new Error("Configuração Tiny não encontrada.");

  if (config.updated_at !== originalUpdatedAt) {
    const expiresAt = config.token_expires_at ? new Date(config.token_expires_at) : null;
    if (config.access_token && expiresAt && expiresAt.getTime() - Date.now() > 60_000) {
      console.log("Outro processo refreshou o token. Reutilizando.");
      return config.access_token;
    }
  }

  if (!config.refresh_token) {
    throw new Error("Token expirado e sem refresh_token. Um admin precisa reconectar o Tiny ERP.");
  }

  console.log("Executando refresh de token...");
  const resp = await fetch(TINY_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: config.refresh_token,
      client_id: config.client_id,
      client_secret: config.client_secret,
    }),
  });

  if (!resp.ok) {
    const errBody = await resp.text().catch(() => "");
    console.error(`Refresh falhou: ${resp.status} ${errBody}`);
    const { data: recheck } = await supabase
      .from("tiny_config_shared")
      .select("access_token, token_expires_at, updated_at")
      .eq("id", "default")
      .single();
    if (recheck && recheck.updated_at !== config.updated_at) {
      const recheckExpires = recheck.token_expires_at ? new Date(recheck.token_expires_at) : null;
      if (recheck.access_token && recheckExpires && recheckExpires.getTime() - Date.now() > 60_000) {
        console.log("Refresh falhou mas outro processo salvou tokens válidos.");
        return recheck.access_token;
      }
    }
    await supabase
      .from("tiny_config_shared")
      .update({ access_token: null, refresh_token: null, token_expires_at: null, updated_at: new Date().toISOString() })
      .eq("id", "default");
    throw new Error("Sessão Tiny expirada. Um admin precisa reconectar o Tiny ERP.");
  }

  const tokens = await resp.json();
  if (!tokens.access_token) throw new Error("Resposta de refresh inválida.");

  const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();
  await supabase
    .from("tiny_config_shared")
    .update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || config.refresh_token,
      token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", "default");

  console.log("Token renovado, expira em:", expiresAt);
  return tokens.access_token;
}

async function safeTinyFetch(
  supabase: any,
  url: string,
  token: string,
  maxRetries = 3,
): Promise<{ data: any; newToken: string | null }> {
  let currentToken = token;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${currentToken}` },
    });

    // 401: refresh + retry uma vez
    if (resp.status === 401 && attempt === 0) {
      console.log(`401 em ${url}. Refresh...`);
      await new Promise((r) => setTimeout(r, 2000));
      const { data: freshConfig } = await supabase
        .from("tiny_config_shared")
        .select("access_token, token_expires_at, updated_at")
        .eq("id", "default")
        .single();
      if (freshConfig?.access_token && freshConfig.access_token !== currentToken) {
        currentToken = freshConfig.access_token;
      } else {
        const originalUpdatedAt = freshConfig?.updated_at || "";
        currentToken = await safeRefreshToken(supabase, originalUpdatedAt);
      }
      const retryResp = await fetch(url, {
        headers: { Authorization: `Bearer ${currentToken}` },
      });
      if (!retryResp.ok) {
        const errBody = await retryResp.text();
        throw new Error(`Tiny API ${retryResp.status} após retry: ${errBody}`);
      }
      return { data: await retryResp.json(), newToken: currentToken };
    }

    // 429/503: backoff exponencial
    if ((resp.status === 429 || resp.status === 503) && attempt < maxRetries) {
      const backoffMs = Math.min(2000 * Math.pow(2, attempt), 15000);
      console.log(`${resp.status} em ${url}. Backoff ${backoffMs}ms (tentativa ${attempt + 1}/${maxRetries})`);
      await new Promise((r) => setTimeout(r, backoffMs));
      continue;
    }

    if (!resp.ok) {
      if (resp.status === 429) throw new Error(`429 Rate limit em ${url}`);
      const errBody = await resp.text();
      throw new Error(`Tiny API ${resp.status}: ${errBody}`);
    }

    return { data: await resp.json(), newToken: currentToken !== token ? currentToken : null };
  }
  throw new Error(`Tiny API: max retries em ${url}`);
}

function extractPrice(tp: any): number {
  const precos = tp.precos || tp;
  const raw =
    precos.preco ??
    precos.precoPromocional ??
    precos.precoCusto ??
    tp.preco ??
    tp.precoVenda ??
    tp.valor ??
    0;
  const num = typeof raw === "string" ? parseFloat(raw) : raw || 0;
  return isNaN(num) ? 0 : num;
}

// =============================================================
// Busca de produto no Tiny por SKU (reaproveita estratégia de
// tiny-sync-product-single, incluindo sibling strategy para variations)
// =============================================================

async function fetchTinyProductBySku(
  supabase: any,
  sku: string,
  initialToken: string,
): Promise<{ produto: any; newToken: string }> {
  let token = initialToken;
  const skuLower = sku.toLowerCase();
  const hasHyphen = sku.includes("-");
  const baseCode = hasHyphen ? sku.split("-")[0].trim() : null;
  let produto: any = null;

  // Strategy 0: se o produto local já tem tiny_id, busca direta por ID.
  // Mais confiável que /produtos?pesquisa=... para SKUs que não são
  // indexados como "codigo" no Tiny (ex: EANs, códigos legados).
  try {
    const { data: localProduct } = await supabase
      .from("products")
      .select("tiny_id")
      .eq("sku", sku)
      .not("tiny_id", "is", null)
      .maybeSingle();
    if (localProduct?.tiny_id) {
      const directResult = await safeTinyFetch(
        supabase,
        `${TINY_API_BASE}/produtos/${localProduct.tiny_id}`,
        token,
      );
      if (directResult.newToken) token = directResult.newToken;
      if (directResult.data?.id) {
        produto = directResult.data;
      }
    }
  } catch (directErr: any) {
    console.warn(`[${sku}] Direct fetch por tiny_id falhou:`, directErr.message);
  }

  // Strategy 1: para SKUs de variação, achar irmão no DB com tiny_id
  if (!produto && baseCode) {
    const { data: siblings } = await supabase
      .from("products")
      .select("tiny_id, sku")
      .like("sku", `${baseCode}-%`)
      .not("tiny_id", "is", null)
      .limit(1);

    if (siblings && siblings.length > 0) {
      const siblingTinyId = siblings[0].tiny_id;
      try {
        const siblingResult = await safeTinyFetch(supabase, `${TINY_API_BASE}/produtos/${siblingTinyId}`, token);
        if (siblingResult.newToken) token = siblingResult.newToken;
        const siblingData = siblingResult.data;
        const parentId = siblingData?.produtoPai?.id;

        if (parentId) {
          const parentResult = await safeTinyFetch(supabase, `${TINY_API_BASE}/produtos/${parentId}`, token);
          if (parentResult.newToken) token = parentResult.newToken;
          const variacoes = parentResult.data?.variacoes || [];
          const matchedVar = variacoes.find(
            (v: any) =>
              (v.sku || "").toLowerCase() === skuLower ||
              (v.codigo || "").toLowerCase() === skuLower,
          );
          if (matchedVar) {
            const varDetailResult = await safeTinyFetch(
              supabase,
              `${TINY_API_BASE}/produtos/${matchedVar.id}`,
              token,
            );
            if (varDetailResult.newToken) token = varDetailResult.newToken;
            produto = varDetailResult.data;
          }
        } else if (siblingData?.tipoVariacao === "P" && siblingData?.variacoes?.length) {
          const matchedVar = siblingData.variacoes.find(
            (v: any) => (v.sku || "").toLowerCase() === skuLower,
          );
          if (matchedVar) {
            const varDetailResult = await safeTinyFetch(
              supabase,
              `${TINY_API_BASE}/produtos/${matchedVar.id}`,
              token,
            );
            if (varDetailResult.newToken) token = varDetailResult.newToken;
            produto = varDetailResult.data;
          }
        }
      } catch (sibErr: any) {
        console.warn(`[${sku}] Sibling strategy falhou:`, sibErr.message);
      }
    }
  }

  // Strategy 2: busca direta na API Tiny
  if (!produto) {
    const searchTerm = baseCode || sku;
    const searchResult = await safeTinyFetch(
      supabase,
      `${TINY_API_BASE}/produtos?pesquisa=${encodeURIComponent(searchTerm)}&criterio=codigo`,
      token,
    );
    if (searchResult.newToken) token = searchResult.newToken;
    const itens = searchResult.data?.itens || [];

    produto = itens.find(
      (p: any) =>
        (p.sku || "").toLowerCase() === skuLower ||
        (p.codigo || "").toLowerCase() === skuLower,
    );

    // Se não achou direto e é variação, checar variations dentro dos pais
    if (!produto && hasHyphen && itens.length > 0) {
      const parents = itens.filter((p: any) => p.tipoVariacao === "P");
      const toCheck = parents.length > 0 ? parents.slice(0, 3) : itens.slice(0, 3);
      for (const item of toCheck) {
        if (!item.id) continue;
        try {
          const detailResult = await safeTinyFetch(supabase, `${TINY_API_BASE}/produtos/${item.id}`, token);
          if (detailResult.newToken) token = detailResult.newToken;
          const detail = detailResult.data;
          if ((detail.sku || "").toLowerCase() === skuLower) {
            produto = detail;
            break;
          }
          const matchedVar = (detail.variacoes || []).find(
            (v: any) =>
              (v.sku || "").toLowerCase() === skuLower ||
              (v.codigo || "").toLowerCase() === skuLower,
          );
          if (matchedVar) {
            const varDetailResult = await safeTinyFetch(
              supabase,
              `${TINY_API_BASE}/produtos/${matchedVar.id}`,
              token,
            );
            if (varDetailResult.newToken) token = varDetailResult.newToken;
            produto = varDetailResult.data;
            break;
          }
        } catch (detailErr: any) {
          console.warn(`[${sku}] Detail fetch falhou para ${item.id}:`, detailErr.message);
        }
      }
    }

    // Detalhe completo se achou na busca mas sem precos
    if (produto?.id && !produto.precos && !produto.descricaoComplementar) {
      try {
        const detailResult = await safeTinyFetch(supabase, `${TINY_API_BASE}/produtos/${produto.id}`, token);
        if (detailResult.newToken) token = detailResult.newToken;
        produto = { ...produto, ...detailResult.data };
      } catch (_e: any) {
        /* noop */
      }
    }
  }

  return { produto, newToken: token };
}

// =============================================================
// Admin check + lock helpers
// =============================================================

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
    const err = new Error("Acesso negado: apenas admin pode executar sync seletivo");
    (err as any).statusCode = 403;
    throw err;
  }
}

/**
 * Verifica se há sync completo (type='products') em andamento.
 * Retorna true se BLOQUEADO (há um full sync rodando).
 * Stale locks (> 10 min) são tratados como erro e ignorados.
 */
async function isFullSyncRunning(supabase: any): Promise<boolean> {
  const { data: running } = await supabase
    .from("sync_log")
    .select("id, started_at")
    .eq("type", "products")
    .eq("status", "running")
    .order("started_at", { ascending: false })
    .limit(1);

  if (!running || running.length === 0) return false;

  const startedAt = new Date(running[0].started_at).getTime();
  const elapsedMin = (Date.now() - startedAt) / 60000;
  if (elapsedMin > 10) {
    // Stale — libera (mesmo comportamento de acquireSyncLock em tiny-sync-products)
    console.log(`Stale sync completo (${elapsedMin.toFixed(0)}min). Liberando.`);
    await supabase
      .from("sync_log")
      .update({
        status: "error",
        message: "Timeout — fechado automaticamente (>10min)",
        finished_at: new Date().toISOString(),
      })
      .eq("id", running[0].id);
    return false;
  }
  return true;
}

async function createSelectiveLogEntry(
  supabase: any,
  userId: string,
  skuCount: number,
): Promise<string | null> {
  const { data: logEntry } = await supabase
    .from("sync_log")
    .insert({
      type: "products_selective",
      status: "running",
      message: `Sync seletivo iniciado (${skuCount} SKUs)`,
      user_id: userId,
      items_synced: 0,
      items_total: skuCount,
    })
    .select()
    .single();
  return logEntry?.id || null;
}

// =============================================================
// Main handler
// =============================================================

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();
  let logId: string | null = null;
  let supabaseAdmin: any = null;

  try {
    // ── Auth ───────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonErr("Não autenticado", 401);

    supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const userId = await getUserIdFromJwt(authHeader);
    try {
      await assertIsAdmin(supabaseAdmin, userId);
    } catch (err: any) {
      return jsonErr(err.message || "Acesso negado", err.statusCode || 403);
    }

    // ── Input validation ──────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const rawSkus: unknown = body.skus;
    if (!Array.isArray(rawSkus) || rawSkus.length === 0) {
      return jsonErr("Campo 'skus' deve ser um array não vazio de strings", 400);
    }

    // Trim, filtra vazios, deduplica
    const skus: string[] = [];
    const seen = new Set<string>();
    for (const raw of rawSkus) {
      if (typeof raw !== "string") continue;
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      skus.push(trimmed);
    }
    if (skus.length === 0) {
      return jsonErr("Nenhum SKU válido após deduplicação", 400);
    }
    if (skus.length > MAX_SKUS_PER_CALL) {
      return jsonErr(`Máximo ${MAX_SKUS_PER_CALL} SKUs por chamada. Recebido: ${skus.length}`, 400);
    }

    // ── Lock check ────────────────────────────────────────
    if (await isFullSyncRunning(supabaseAdmin)) {
      return jsonErr("Sync completo em andamento. Aguarde a conclusão.", 409);
    }

    // ── Criar log entry (trackeable em Histórico) ─────────
    logId = await createSelectiveLogEntry(supabaseAdmin, userId, skus.length);

    console.log(`[selective] Iniciando sync de ${skus.length} SKUs — user ${userId} — log ${logId}`);

    // ── Token inicial ─────────────────────────────────────
    let token = await safeGetAccessToken(supabaseAdmin);

    // ── Processamento sequencial por SKU ──────────────────
    type Detail = { sku: string; status: "updated" | "not_found" | "error"; message: string };
    const details: Detail[] = [];
    let updated = 0;
    let notFound = 0;
    let errors = 0;

    for (const sku of skus) {
      try {
        const { produto, newToken } = await fetchTinyProductBySku(supabaseAdmin, sku, token);
        token = newToken;

        if (!produto) {
          notFound++;
          details.push({ sku, status: "not_found", message: "SKU não existe no Tiny" });
          console.log(`[selective] ${sku}: not_found`);
          continue;
        }

        // Monta update payload (paridade com tiny-sync-product-single)
        const price = extractPrice(produto);
        const updatePayload: Record<string, any> = {
          name: produto.descricao || produto.nome || "",
          sku: produto.sku || produto.codigo || sku,
          ean: produto.gtin || "",
          category: produto.categoria?.descricao || produto.categoria?.nome || "",
          unit_price: price,
          tiny_id: String(produto.id),
          observations: produto.observacoes || "",
          imagem_url:
            produto.imagemURL ||
            produto.imagem ||
            produto.urlImagem ||
            produto.anexos?.[0]?.url ||
            "",
        };

        // UPDATE apenas — não cria produtos novos (por spec)
        const resolvedSku = updatePayload.sku || sku;
        const { data: existing, error: findErr } = await supabaseAdmin
          .from("products")
          .select("id")
          .eq("sku", resolvedSku)
          .maybeSingle();

        if (findErr) throw new Error(`DB select: ${findErr.message}`);
        if (!existing) {
          // Fallback: quando o Tiny devolve SKU ligeiramente diferente
          // (ex: canonicaliza codigo), ainda tentamos achar pelo SKU
          // original que o usuário digitou.
          if (resolvedSku !== sku) {
            const { data: byOrig } = await supabaseAdmin
              .from("products")
              .select("id")
              .eq("sku", sku)
              .maybeSingle();
            if (byOrig) {
              const { error: updErr } = await supabaseAdmin
                .from("products")
                .update(updatePayload)
                .eq("id", byOrig.id);
              if (updErr) throw new Error(`DB update: ${updErr.message}`);
              updated++;
              details.push({ sku, status: "updated", message: "Atualizado com sucesso" });
              console.log(`[selective] ${sku}: updated (via orig sku)`);
              continue;
            }
          }
          notFound++;
          details.push({
            sku,
            status: "not_found",
            message: "Produto existe no Tiny mas não está cadastrado no sistema",
          });
          console.log(`[selective] ${sku}: tiny_ok_db_missing`);
          continue;
        }

        const { error: updErr } = await supabaseAdmin
          .from("products")
          .update(updatePayload)
          .eq("id", existing.id);
        if (updErr) throw new Error(`DB update: ${updErr.message}`);

        updated++;
        details.push({ sku, status: "updated", message: "Atualizado com sucesso" });
        console.log(`[selective] ${sku}: updated`);
      } catch (err: any) {
        errors++;
        const msg = err?.message || "Erro desconhecido";
        details.push({ sku, status: "error", message: msg });
        console.error(`[selective] ${sku}: error —`, msg);
        if (err?.stack) console.error(err.stack);
      }
    }

    const durationMs = Date.now() - startTime;

    // ── Fecha log entry ───────────────────────────────────
    if (logId) {
      await supabaseAdmin
        .from("sync_log")
        .update({
          status: errors === skus.length ? "error" : "success",
          items_synced: updated,
          items_total: skus.length,
          message: `Seletivo concluído: ${updated} atualizados, ${notFound} não encontrados, ${errors} erros (${durationMs}ms)`,
          finished_at: new Date().toISOString(),
        })
        .eq("id", logId);
    }

    console.log(
      `[selective] FIM — ${updated} atualizados, ${notFound} não encontrados, ${errors} erros — ${durationMs}ms`,
    );

    return jsonOk({
      total: skus.length,
      updated,
      not_found: notFound,
      errors,
      duration_ms: durationMs,
      details,
    });
  } catch (err: any) {
    console.error("[selective] Erro fatal:", err);
    if (err?.stack) console.error(err.stack);
    if (logId && supabaseAdmin) {
      await supabaseAdmin
        .from("sync_log")
        .update({
          status: "error",
          message: `Erro: ${err.message}`,
          finished_at: new Date().toISOString(),
        })
        .eq("id", logId);
    }
    return jsonErr(err.message || "Erro interno", err?.statusCode || 500);
  }
});
