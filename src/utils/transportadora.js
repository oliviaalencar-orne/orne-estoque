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

