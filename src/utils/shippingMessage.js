/**
 * shippingMessage.js — Build WhatsApp messages for shipping notifications to clients
 *
 * Used in ShippingList to send status updates to clients via WhatsApp.
 */

/**
 * Format phone number for WhatsApp API.
 * - Removes non-numeric characters
 * - Adds 55 (Brazil) country code if missing
 * @param {string} phone
 * @returns {string} Formatted phone number (digits only)
 */
export function formatPhoneForWhatsApp(phone) {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  // Already has country code (55) + DDD + number (12-13 digits)
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  // Add Brazil country code
  return '55' + digits;
}

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
  lines.push(`Informamos que seu pedido da *Orne Decor* está com status: *${statusLabel}*.`);

  if (shipping.codigoRastreio) {
    lines.push('');
    lines.push(`📦 Código de rastreio: ${shipping.codigoRastreio}`);
    if (shipping.transportadora) {
      lines.push(`Transportadora: ${shipping.transportadora}`);
    }
    if (shipping.linkRastreio) {
      lines.push(`Link de rastreio: ${shipping.linkRastreio}`);
    }
  }

  if (shipping.nfNumero) {
    lines.push('');
    lines.push(`NF: ${shipping.nfNumero}`);
  }

  lines.push('');
  lines.push('Caso tenha dúvidas, estamos à disposição!');
  lines.push('*Orne Decor* 🌿');

  return lines.join('\n');
}

/**
 * Open WhatsApp with message to a specific phone number.
 * @param {string} phone - Phone number (will be formatted)
 * @param {string} message - Message text
 */
export function openWhatsAppForClient(phone, message) {
  const formattedPhone = formatPhoneForWhatsApp(phone);
  const encoded = encodeURIComponent(message);
  if (formattedPhone) {
    window.open(`https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encoded}`, '_blank');
  } else {
    window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
  }
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
