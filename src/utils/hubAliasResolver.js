/**
 * hubAliasResolver.js — resolução de nome de HUB para forma canônica.
 *
 * Sub-frente 3.0b. Centraliza a lógica de:
 *  - Se nome já é canônico (existe em `hubs.name`) → passa direto.
 *  - Se nome é um alias conhecido (`hub_aliases.name_alias`) → normaliza
 *    para `name_canonical` e flag `wasNormalized=true` para o caller exibir
 *    feedback informativo (Decisão H — toast).
 *  - Caso contrário → `canonical=null`, caller bloqueia com erro.
 *
 * Função pura — não toca em supabase, fácil de testar.
 *
 * @param {string} hubName — nome bruto recebido do form / import.
 * @param {{name: string}[]} hubs — lista canônica vinda de useHubs.
 * @param {{name_alias: string, name_canonical: string}[]} aliases — vinda de useHubAliases.
 * @returns {{canonical: string|null, wasNormalized: boolean, originalName?: string}}
 */
export function resolveHubAlias(hubName, hubs, aliases) {
  const trimmed = (hubName || '').trim();
  if (!trimmed) return { canonical: null, wasNormalized: false };

  const hubNames = new Set((hubs || []).map(h => h.name));
  if (hubNames.has(trimmed)) {
    return { canonical: trimmed, wasNormalized: false };
  }

  const alias = (aliases || []).find(a => a.name_alias === trimmed);
  if (alias && hubNames.has(alias.name_canonical)) {
    return {
      canonical: alias.name_canonical,
      wasNormalized: true,
      originalName: trimmed,
    };
  }

  return { canonical: null, wasNormalized: false };
}
