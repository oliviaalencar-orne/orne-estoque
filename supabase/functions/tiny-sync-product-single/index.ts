/**
 * tiny-sync-product-single — Fetch a single product from Tiny API v3 by SKU or tiny_id
 *
 * Input:  { sku?: string, tiny_id?: string }
 * Output: { success: true, product: { name, sku, ean, category, unit_price, tiny_id, imagem_url }, estoque?: number }
 *       | { success: false, error: string }
 *
 * Reuses the same safeGetAccessToken / safeTinyFetch patterns as tiny-sync-products.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TINY_API_BASE = 'https://api.tiny.com.br/public-api/v3';
const TINY_TOKEN_URL = 'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// --- Token management (mirrors tiny-sync-products) ---

async function getStoredTokens(supabase: ReturnType<typeof createClient>) {
  const { data, error } = await supabase
    .from('tiny_config')
    .select('access_token, refresh_token, client_id, client_secret, updated_at')
    .single();
  if (error || !data) throw new Error('Tiny nao configurado. Conecte na aba Configuracao.');
  return data;
}

async function refreshAccessToken(supabase: ReturnType<typeof createClient>, config: any): Promise<string> {
  const res = await fetch(TINY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: config.refresh_token,
      client_id: config.client_id,
      client_secret: config.client_secret,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Falha ao renovar token Tiny (${res.status}): ${text}`);
  }

  const tokens = await res.json();
  await supabase.from('tiny_config').update({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || config.refresh_token,
    updated_at: new Date().toISOString(),
  }).eq('client_id', config.client_id);

  return tokens.access_token;
}

async function safeGetAccessToken(supabase: ReturnType<typeof createClient>): Promise<string> {
  const config = await getStoredTokens(supabase);
  if (!config.access_token) {
    return await refreshAccessToken(supabase, config);
  }
  return config.access_token;
}

async function safeTinyFetch(
  supabase: ReturnType<typeof createClient>,
  path: string,
  accessToken: string,
  retries = 1,
): Promise<any> {
  const url = `${TINY_API_BASE}${path}`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });

  if (res.status === 401 && retries > 0) {
    // Token expired — refresh and retry
    const config = await getStoredTokens(supabase);
    const newToken = await refreshAccessToken(supabase, config);
    return safeTinyFetch(supabase, path, newToken, retries - 1);
  }

  if (res.status === 429) {
    throw new Error('Rate limit Tiny atingido (429). Aguarde alguns minutos.');
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Tiny API ${res.status}: ${text}`);
  }

  return res.json();
}

// --- Main handler ---

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { sku, tiny_id } = await req.json();
    if (!sku && !tiny_id) {
      return json({ success: false, error: 'SKU ou tiny_id obrigatorio' }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const accessToken = await safeGetAccessToken(supabase);

    let produto: any = null;

    if (tiny_id) {
      // Direct fetch by ID
      const resp = await safeTinyFetch(supabase, `/produtos/${tiny_id}`, accessToken);
      produto = resp;
    } else {
      // Search by SKU
      const searchResp = await safeTinyFetch(
        supabase,
        `/produtos?pesquisa=${encodeURIComponent(sku!)}&criterio=codigo`,
        accessToken,
      );
      const itens = searchResp?.itens || searchResp?.data?.itens || [];
      // Find exact SKU match
      produto = itens.find((p: any) => p.codigo === sku || p.sku === sku);
      if (!produto && itens.length > 0) {
        // Fallback: first result that contains the SKU
        produto = itens.find((p: any) =>
          (p.codigo || '').toLowerCase() === (sku || '').toLowerCase() ||
          (p.sku || '').toLowerCase() === (sku || '').toLowerCase()
        );
      }

      if (produto?.id) {
        // Fetch full detail
        const detail = await safeTinyFetch(supabase, `/produtos/${produto.id}`, accessToken);
        produto = { ...produto, ...detail };
      }
    }

    if (!produto) {
      return json({ success: false, error: `Produto nao encontrado no Tiny: ${sku || tiny_id}` }, 404);
    }

    // Extract product data
    const dadosAtualizados: Record<string, any> = {
      name: produto.nome || produto.descricao || '',
      sku: produto.codigo || produto.sku || sku || '',
      ean: produto.gtin || produto.ean || '',
      category: produto.categoria?.descricao || produto.categoria?.nome || '',
      unit_price: parseFloat(produto.precos?.preco || produto.preco || produto.preco_venda || 0),
      tiny_id: String(produto.id),
      observations: produto.observacoes || '',
      imagem_url: produto.anexos?.[0]?.url || produto.url_imagem || produto.imagem?.url || null,
    };

    // Try fetching stock
    let estoque: number | null = null;
    try {
      const estoqueResp = await safeTinyFetch(supabase, `/produtos/${produto.id}/estoques`, accessToken);
      // API v3 returns array of warehouse stocks
      const estoques = estoqueResp?.itens || estoqueResp?.data?.itens || [];
      if (estoques.length > 0) {
        // Sum all warehouses or take the first (main)
        estoque = estoques.reduce((sum: number, e: any) => sum + (parseFloat(e.saldo || e.quantidade || 0)), 0);
      } else if (estoqueResp?.saldo !== undefined) {
        estoque = parseFloat(estoqueResp.saldo);
      }
    } catch (_e) {
      // Stock fetch is optional — don't fail the whole request
      console.warn('Could not fetch stock for product', produto.id, _e);
    }

    return json({
      success: true,
      product: dadosAtualizados,
      estoque,
    });
  } catch (e: any) {
    console.error('tiny-sync-product-single error:', e);
    return json({ success: false, error: e.message || 'Erro desconhecido' }, 500);
  }
});
