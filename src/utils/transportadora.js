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
