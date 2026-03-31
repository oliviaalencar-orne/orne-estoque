/**
 * tiny-sync-product-single — Fetch a single product from Tiny API v3 by SKU or tiny_id
 *
 * Input:  { sku?: string, tiny_id?: string }
 * Output: { success: true, product: { name, sku, ean, category, unit_price, tiny_id, imagem_url }, estoque?: number }
 *       | { success: false, error: string }
 *
 * Uses same token management as tiny-sync-products v16 (tiny_config_shared, safeGetAccessToken, safeTinyFetch).
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const TINY_API_BASE = "https://api.tiny.com.br/public-api/v3";
const TINY_TOKEN_URL = "https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonOk(data: any) {
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

// =============================================================
// Token management — copied from tiny-sync-products v16
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
    console.log(`Token expired but updated_at is recent (${secondsSinceUpdate.toFixed(0)}s ago). Waiting 2s...`);
    await new Promise(r => setTimeout(r, 2000));

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
      console.log("Another process already refreshed the token. Using it.");
      return config.access_token;
    }
  }

  if (!config.refresh_token) {
    throw new Error("Token expirado e sem refresh_token. Um admin precisa reconectar o Tiny ERP.");
  }

  console.log("Executing token refresh...");
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
    console.error(`Token refresh failed: ${resp.status} ${errBody}`);

    const { data: recheck } = await supabase
      .from("tiny_config_shared")
      .select("access_token, token_expires_at, updated_at")
      .eq("id", "default")
      .single();

    if (recheck && recheck.updated_at !== config.updated_at) {
      const recheckExpires = recheck.token_expires_at ? new Date(recheck.token_expires_at) : null;
      if (recheck.access_token && recheckExpires && recheckExpires.getTime() - Date.now() > 60_000) {
        console.log("Refresh failed but another process saved valid tokens. Using them.");
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

  console.log("Token renovado com sucesso, expira em:", expiresAt);
  return tokens.access_token;
}

// safeTinyFetch with 429/503 retry + exponential backoff
async function safeTinyFetch(supabase: any, url: string, token: string, maxRetries = 3): Promise<{ data: any; newToken: string | null }> {
  let currentToken = token;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const resp = await fetch(url, {
      headers: { "Authorization": `Bearer ${currentToken}` },
    });

    // 401: token expired — refresh and retry once
    if (resp.status === 401 && attempt === 0) {
      console.log(`401 on ${url}. Refreshing token...`);
      await new Promise(r => setTimeout(r, 2000));

      const { data: freshConfig } = await supabase
        .from("tiny_config_shared")
        .select("access_token, token_expires_at, updated_at")
        .eq("id", "default")
        .single();

      if (freshConfig?.access_token && freshConfig.access_token !== currentToken) {
        currentToken = freshConfig.access_token;
      } else {
        const originalUpdatedAt = freshConfig?.updated_at || '';
        currentToken = await safeRefreshToken(supabase, originalUpdatedAt);
      }

      const retryResp = await fetch(url, {
        headers: { "Authorization": `Bearer ${currentToken}` },
      });

      if (!retryResp.ok) {
        const errBody = await retryResp.text();
        throw new Error(`Tiny API erro ${retryResp.status} após retry: ${errBody}`);
      }

      return { data: await retryResp.json(), newToken: currentToken };
    }

    // 429/503: rate limit or service unavailable — exponential backoff
    if ((resp.status === 429 || resp.status === 503) && attempt < maxRetries) {
      const backoffMs = Math.min(2000 * Math.pow(2, attempt), 15000);
      console.log(`${resp.status} on ${url}. Backoff ${backoffMs}ms (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise(r => setTimeout(r, backoffMs));
      continue;
    }

    if (!resp.ok) {
      if (resp.status === 429) throw new Error(`429 Rate limit on ${url}`);
      const errBody = await resp.text();
      throw new Error(`Tiny API erro ${resp.status}: ${errBody}`);
    }

    return { data: await resp.json(), newToken: currentToken !== token ? currentToken : null };
  }

  throw new Error(`Tiny API: max retries exceeded for ${url}`);
}

// =============================================================
// Price extraction — same logic as tiny-sync-products
// =============================================================

function extractPrice(tp: any): number {
  const precos = tp.precos || tp;
  const raw = precos.preco ?? precos.precoPromocional ?? precos.precoCusto
    ?? tp.preco ?? tp.precoVenda ?? tp.valor ?? 0;
  const num = typeof raw === 'string' ? parseFloat(raw) : (raw || 0);
  return isNaN(num) ? 0 : num;
}

// =============================================================
// Main handler
// =============================================================

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { sku, tiny_id } = await req.json();
    if (!sku && !tiny_id) {
      return jsonErr("SKU ou tiny_id obrigatório", 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    let token = await safeGetAccessToken(supabase);

    let produto: any = null;

    if (tiny_id) {
      // Direct fetch by ID
      const result = await safeTinyFetch(supabase, `${TINY_API_BASE}/produtos/${tiny_id}`, token);
      if (result.newToken) token = result.newToken;
      produto = result.data;
    } else {
      // Search by SKU
      const searchResult = await safeTinyFetch(
        supabase,
        `${TINY_API_BASE}/produtos?pesquisa=${encodeURIComponent(sku!)}&criterio=codigo`,
        token,
      );
      if (searchResult.newToken) token = searchResult.newToken;

      const itens = searchResult.data?.itens || [];
      // Find exact SKU match (case-insensitive)
      produto = itens.find((p: any) =>
        (p.sku || "").toLowerCase() === (sku || "").toLowerCase()
      );

      if (!produto && itens.length > 0) {
        // Fallback: match by codigo field
        produto = itens.find((p: any) =>
          (p.codigo || "").toLowerCase() === (sku || "").toLowerCase()
        );
      }

      // If found in list, fetch full detail
      if (produto?.id) {
        try {
          const detailResult = await safeTinyFetch(supabase, `${TINY_API_BASE}/produtos/${produto.id}`, token);
          if (detailResult.newToken) token = detailResult.newToken;
          produto = { ...produto, ...detailResult.data };
        } catch (detailErr: any) {
          // If detail fetch fails, continue with list data
          console.warn("Could not fetch product detail:", detailErr.message);
        }
      }
    }

    if (!produto) {
      return jsonErr(`Produto não encontrado no Tiny: ${sku || tiny_id}`, 404);
    }

    // Extract product data using same field mapping as tiny-sync-products
    const price = extractPrice(produto);
    const dadosAtualizados: Record<string, any> = {
      name: produto.descricao || produto.nome || "",
      sku: produto.sku || produto.codigo || sku || "",
      ean: produto.gtin || "",
      category: produto.categoria?.descricao || produto.categoria?.nome || "",
      unit_price: price,
      tiny_id: String(produto.id),
      observations: produto.observacoes || "",
      imagem_url: produto.imagemURL || produto.imagem || produto.urlImagem
        || produto.anexos?.[0]?.url || "",
    };

    // Try fetching stock (optional — don't fail if unavailable)
    let estoque: number | null = null;
    try {
      const estoqueResult = await safeTinyFetch(supabase, `${TINY_API_BASE}/produtos/${produto.id}/estoques`, token);
      const estoqueData = estoqueResult.data;
      const estoques = estoqueData?.itens || [];
      if (estoques.length > 0) {
        estoque = estoques.reduce((sum: number, e: any) => sum + (parseFloat(e.saldo || e.quantidade || 0)), 0);
      } else if (estoqueData?.saldo !== undefined) {
        estoque = parseFloat(estoqueData.saldo);
      }
    } catch (_e: any) {
      console.warn("Could not fetch stock for product", produto.id, _e.message);
    }

    return jsonOk({
      success: true,
      product: dadosAtualizados,
      estoque,
    });
  } catch (e: any) {
    console.error("tiny-sync-product-single error:", e);
    return jsonErr(e.message || "Erro desconhecido", 500);
  }
});
