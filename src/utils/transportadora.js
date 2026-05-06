/**
 * transportadora.js — Detect real carrier from tracking code
 *
 * "Melhor Envio" is a shipping platform, not a carrier.
 * This helper resolves the actual carrier when possible.
 */

/**
 * Get the real carrier name for a shipping.
 * @param {Object} shipping - Shipping object (camelCase)
 * @returns {string} Real carrier name
 */
export function getTransportadoraReal(shipping) {
  // If already has a real carrier name, use it
  if (shipping.transportadora && shipping.transportadora !== 'Melhor Envio') {
    return shipping.transportadora;
  }

  // Detect from tracking code
  const code = (shipping.codigoRastreio || '').trim().toUpperCase();
  if (!code) return shipping.transportadora || '';

  if (code.startsWith('LGI')) return 'Loggi';
  if (code.startsWith('JD') || code.startsWith('JAD')) return 'Jadlog';
  if (/^[A-Z]{2}\d{9,10}[A-Z]{2}$/.test(code)) return 'Correios';

  return shipping.transportadora || 'Melhor Envio';
}

/**
 * Normaliza string removendo acentos e lowercase.
 */
function normalizar(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Classifica o tipo de transporte de uma separação/despacho.
 * @param {Object} sep - Separation/Shipping object
 * @returns {'local'|'loggi'|'correios'|'outras'|'sem_transporte'}
 */
export function classificarTransporte(sep) {
  if (!sep) return 'sem_transporte';
  if (sep.entregaLocal === true) return 'local';
  const t = normalizar(sep.transportadora);
  if (!t) return 'sem_transporte';
  if (t.includes('entrega local') || t.includes('transporte local') || t === 'local') return 'local';
  if (t.includes('loggi')) return 'loggi';
  if (t.includes('correio')) return 'correios';
  return 'outras';
}

export const TIPO_TRANSPORTE_LABELS = {
  local: 'Local',
  loggi: 'Loggi',
  correios: 'Correios',
  outras: 'Outras',
  sem_transporte: 'Sem transporte',
};

/**
 * Frente 2 — Filtro de Tipo de Transporte na aba Despachos.
 *
 * Granularidade ESTENDIDA em relação a `classificarTransporte`: o filtro precisa
 * distinguir Melhor Envio / Total Express / Jadlog / Outro (que `classificarTransporte`
 * agrupa em 'outras'). Função separada para preservar consumidores existentes
 * (chips de Loggi suspeitos / Correios travados em ShippingList, getTransportadoraReal,
 * matchesConfidenceFilter etc.) — qualquer mudança em `classificarTransporte` quebraria
 * a UI desses filtros.
 *
 * Categorias retornadas (7 + sem_transporte):
 *   loggi | correios | local | melhor_envio | total_express | jadlog | outro | sem_transporte
 *
 * @param {Object} sep - Separation/Shipping object (camelCase)
 * @returns {string} categoria
 */
export function classificarTipoTransporteFiltro(sep) {
  if (!sep) return 'sem_transporte';
  if (sep.entregaLocal === true) return 'local';
  const t = normalizar(sep.transportadora);
  if (!t) return 'sem_transporte';
  if (t.includes('entrega local') || t.includes('transporte local') || t === 'local') return 'local';
  if (t.includes('loggi')) return 'loggi';
  if (t.includes('correio')) return 'correios';
  if (t.includes('melhor envio')) return 'melhor_envio';
  if (t.includes('total express')) return 'total_express';
  if (t.includes('jadlog')) return 'jadlog';
  // Inclui o valor literal 'Outro' que o cliente usa explicitamente no banco,
  // além de qualquer string não reconhecida pelos casos acima.
  return 'outro';
}

/**
 * Labels do filtro de Tipo de Transporte (Frente 2).
 * `sem_transporte` intencionalmente fora — não vira opção do dropdown.
 * Quando o filtro tem alguma categoria selecionada, shippings com transportadora
 * vazia/null são excluídos (filtro estrito, análogo ao filtro de HUB).
 */
export const TIPO_TRANSPORTE_FILTRO_LABELS = {
  loggi: 'Loggi',
  correios: 'Correios',
  melhor_envio: 'Melhor Envio',
  total_express: 'Total Express',
  jadlog: 'Jadlog',
  local: 'Entrega Local',
  outro: 'Outro',
};

