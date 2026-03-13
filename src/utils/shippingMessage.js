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
  const isEntregue = shipping.status === 'ENTREGUE';

  lines.push(`Olá ${shipping.cliente || 'Cliente'}! 👋`);
  lines.push('');

  if (isEntregue) {
    lines.push('Informamos que seu pedido da *ORNE — decor studio* foi *Entregue*!');
  } else {
    lines.push(`Informamos que seu pedido da *ORNE — decor studio* está com status: *${statusLabel}*.`);
  }

  if (shipping.nfNumero) {
    lines.push('');
    lines.push(`NF: ${shipping.nfNumero}`);
  }

  if (isEntregue) {
    // Delivery info lines — only if fields are filled
    if (shipping.recebedorNome) {
      lines.push(`Recebido por: ${shipping.recebedorNome}`);
    }
    if (shipping.dataEntrega) {
      try {
        const d = new Date(shipping.dataEntrega);
        const formatted = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
          + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        lines.push(`Data da entrega: ${formatted}`);
      } catch (_) {}
    }
    if (shipping.comprovanteObs) {
      lines.push(`Observação: ${shipping.comprovanteObs}`);
    }
  } else {
    if (shipping.transportadora) {
      lines.push('');
      lines.push(`Transportadora: ${shipping.transportadora}`);
    }
    if (shipping.linkRastreio) {
      if (!shipping.transportadora) lines.push('');
      lines.push(`Link de rastreio: ${shipping.linkRastreio}`);
    }
  }

  lines.push('');
  lines.push('Caso tenha dúvidas, estamos à disposição!');
  lines.push('ornedecor.com');

  return lines.join('\n');
}

/**
 * Build a client notification message for a devolução (return).
 * @param {Object} shipping - The shipping object (camelCase) with tipo='devolucao'
 * @param {Object} statusLabels - Status label map { STATUS_KEY: { label } }
 * @returns {string} Formatted message
 */
export function buildClientDevolucaoMessage(shipping, statusLabels) {
  const DEVOLUCAO_LABELS = {
    DESPACHADO: 'Devolvendo',
    EM_TRANSITO: 'Em Trânsito',
    SAIU_ENTREGA: 'Em Rota de Entrega',
    TENTATIVA_ENTREGA: 'Tentativa de Entrega',
    ENTREGUE: 'Recebido no HUB',
  };
  const statusLabel = DEVOLUCAO_LABELS[shipping.status] || statusLabels[shipping.status]?.label || shipping.status;
  const lines = [];

  lines.push(`Olá ${shipping.cliente || 'Cliente'}! 👋`);
  lines.push('');
  lines.push(`Informamos que sua devolução para a *ORNE — decor studio* está com status: *${statusLabel}*.`);

  if (shipping.transportadora) {
    lines.push('');
    lines.push(`Transportadora: ${shipping.transportadora}`);
  }
  if (shipping.linkRastreio) {
    if (!shipping.transportadora) lines.push('');
    lines.push(`Link de rastreio: ${shipping.linkRastreio}`);
  }
  if (shipping.nfNumero) {
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
