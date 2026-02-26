/**
 * tinyService.js — Tiny ERP API integration service
 *
 * Real implementations extracted from TinyERPPage (L10468-10776).
 * Provides Edge Function wrappers and auth header helpers.
 */
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseClient } from '@/config/supabase';

const FUNC_BASE = `${SUPABASE_URL}/functions/v1`;

/**
 * Get auth headers for Supabase Edge Function calls.
 * @returns {Promise<Object>} Headers object with Authorization, Content-Type, apikey
 */
export async function getAuthHeaders() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) throw new Error('Sessao expirada. Faca login novamente.');
  return {
    'Authorization': `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY,
  };
}

/**
 * Call a Tiny edge function with full auth headers (apikey + bearer).
 *
 * @param {string} functionName - e.g. 'tiny-auth', 'tiny-sync-nfe'
 * @param {Object} body - Request body
 * @returns {Promise<Object>} Response JSON
 */
export async function callTinyFunction(functionName, body) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${FUNC_BASE}/${functionName}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Erro ${res.status}`);
  }
  return await res.json();
}

/**
 * Overload: Call a Tiny edge function with a pre-obtained access token.
 * Used by TinyNFeImport which passes the token explicitly.
 *
 * @param {string} functionName - e.g. 'tiny-sync-nfe'
 * @param {Object} body - Request body
 * @param {string} accessToken - Supabase auth access token
 * @returns {Promise<Object>} Response JSON
 */
export async function callTinyFunctionWithToken(functionName, body, accessToken) {
  const resp = await fetch(`${FUNC_BASE}/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`${functionName} failed (${resp.status}): ${text}`);
  }

  return resp.json();
}

/**
 * Normalize error messages from Tiny API calls into user-friendly Portuguese.
 *
 * @param {string} msg - Raw error message
 * @returns {string} User-friendly message
 */
export function normalizeTinyError(msg) {
  if (!msg) return 'Erro desconhecido';
  if (msg.match(/401|nao autorizado/i) || msg.match(/token.*expir/i) || msg.match(/reconecte/i)) {
    return 'Sessao Tiny expirada. Va na aba Conexao e clique "Autorizar via OAuth2" para reconectar.';
  }
  if (msg.match(/429/i)) {
    return 'Limite de requisicoes atingido. Aguarde alguns minutos e tente novamente.';
  }
  if (msg.match(/5\d{2}/i)) {
    return 'Erro no servidor Tiny. Tente novamente em alguns minutos.';
  }
  if (msg.match(/failed to fetch|network|rede/i)) {
    return 'Erro de conexao. Verifique sua internet e tente novamente.';
  }
  return msg;
}
