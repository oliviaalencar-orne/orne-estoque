/**
 * shippingMessage.js — Build WhatsApp messages for shipping notifications to clients
 *
 * Used in ShippingList to copy status updates for clients via WhatsApp.
 */

/**
 * Build a client notification message for a shipping.
 * @param {Object} shipping - The shipping object (camelCase)
 * @param {Object} statusLabels - Status label map { STATUS_KEY: { label } }
 * @returns {string} Formatted message
 */
export function buildClientShippingMessage(shipping, statusLabels) {
  const statusLabel = statusLabels[shipping.status]?.label || shipping.status;
  const lines = [];

  lines.push(`Olá ${shipping.cliente || 'Cliente'}! 👋`);
  lines.push('');
  lines.push(`Informamos que seu pedido da *ORNE — decor studio* está com status: *${statusLabel}*.`);

  if (shipping.transportadora) {
    lines.push('');
    lines.push(`Transportadora: ${shipping.transportadora}`);
  }
  if (shipping.linkRastreio) {
    if (!shipping.transportadora) lines.push('');
    lines.push(`Link de rastreio: ${shipping.linkRastreio}`);
  }

  if (shipping.nfNumero) {
    lines.push('');
    lines.push(`NF: ${shipping.nfNumero}`);
  }

  lines.push('');
  lines.push('Caso tenha dúvidas, estamos à disposição!');
  lines.push('ornedecor.com');

  return lines.join('\n');
}

/**
 * Copy text to clipboard.
 * @param {string} text
 * @returns {Promise<boolean>}
 */
export async function copyMessageToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    return true;
  }
}
