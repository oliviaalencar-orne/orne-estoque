/**
 * environment.js — Detecção de ambiente runtime (Frente §16.2)
 *
 * Estratégia fail-safe via whitelist de prod: URLs desconhecidas
 * caem em 'staging' (mais seguro — exibe badge) em vez de 'production'.
 *
 * Spec: contexto-sistema-orne-estoque-v6.3-maio-2026.md §16.2,
 * motivado pelo incidente §15.11 (Vercel env-vars Preview/Production
 * não-isolados, 30/04→13/05/2026).
 *
 * Usado por src/components/ui/EnvironmentBadge.jsx para renderizar
 * faixa visual quando ambiente != production.
 */

// Whitelist explícita de URLs de produção. Mantém-se manualmente.
// Hoje só existe 1 projeto Supabase prod (`ppslljqxsdsdmwfiayok`,
// "estoque-orne", criado 2026-02-09). Confirmado via Supabase MCP
// list_projects no pré-flight da Frente §16.2 (2026-05-19).
const PROD_SUPABASE_URLS = [
  'https://ppslljqxsdsdmwfiayok.supabase.co',
];

/**
 * Retorna o ambiente atual em runtime.
 *
 * @returns {'production' | 'staging' | 'development'}
 */
export function getEnvironment() {
  // Vite substitui import.meta.env.DEV em tempo de build:
  // - `vite dev`   → true
  // - `vite build` → false (inclui preview deploys do Vercel)
  if (import.meta.env.DEV) return 'development';

  const url = import.meta.env.VITE_SUPABASE_URL;
  if (PROD_SUPABASE_URLS.includes(url)) return 'production';

  // Fail-safe: URL ausente, desconhecida, ou apontando para staging
  // → 'staging' (exibe badge). Preferimos falso-positivo (badge
  // aparece em ambiente que poderia ser prod) a falso-negativo
  // (badge não aparece em staging real). Heurística #33 do contexto v6.3.
  return 'staging';
}

/**
 * Atalho booleano: true quando o app NÃO está rodando contra prod.
 *
 * @returns {boolean}
 */
export function isNonProduction() {
  return getEnvironment() !== 'production';
}
