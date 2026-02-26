/**
 * tinyService.js — Tiny ERP API integration service
 *
 * Stub for Phase 2. Actual API calls are currently inline in:
 *   - TinyERPPage (L10468+) — FUNC_BASE calls to edge functions
 *   - TinyNFeImport (L9404) — fetch to tiny-sync-nfe
 *
 * These will be extracted here in Phase 5 (component extraction).
 */
import { SUPABASE_URL } from '@/config/supabase';

const FUNC_BASE = `${SUPABASE_URL}/functions/v1`;

/**
 * Call a Tiny edge function.
 *
 * @param {string} functionName - e.g. 'tiny-auth', 'tiny-sync-nfe'
 * @param {Object} body - Request body
 * @param {string} accessToken - Supabase auth access token
 * @returns {Promise<Object>} Response JSON
 */
export async function callTinyFunction(functionName, body, accessToken) {
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
