/**
 * separationMessage.js — Build WhatsApp/clipboard messages for separation requests
 *
 * Generates formatted text for consolidated (per-HUB) or individual separation exports.
 */

/**
 * Format current date as DD/MM/AAAA às HH:mm
 */
function formatDateBR() {
  const d = new Date();
  const date = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
  return `${date} às ${time}`;
}

/**
 * Build a message for one or more separations.
 * @param {Object} options
 * @param {string} options.hubName - Name of the HUB
 * @param {Array} options.separations - Array of separation objects (status: pendente)
 * @returns {string} Formatted message text
 */
export function buildSeparationMessage({ hubName, separations }) {
  const lines = [];

  lines.push('*ORNE™ — Solicitação de Separação*');
  lines.push(`Data: ${formatDateBR()}`);
  lines.push(`HUB: ${hubName}`);
  lines.push('Solicitação: Separação das NFs abaixo');
  lines.push('');

  const obsGerais = [];

  separations.forEach((sep, idx) => {
    if (idx > 0) lines.push('');

    lines.push(`*NF ${sep.nfNumero || '-'}* — ${sep.cliente || '-'}`);

    (sep.produtos || []).forEach(p => {
      const nome = p.produtoEstoque?.name || p.nome || '-';
      const qtd = p.quantidade || 1;
      lines.push(`• ${nome} — Qtd: ${qtd}`);
      if (p.observacao) {
        lines.push(`  ↳ Obs: ${p.observacao}`);
      }
    });

    if (sep.observacoes) {
      obsGerais.push({ nf: sep.nfNumero || '-', obs: sep.observacoes });
    }
  });

  if (obsGerais.length > 0) {
    lines.push('');
    lines.push('*Observações:*');
    obsGerais.forEach(o => {
      lines.push(`• NF ${o.nf}: ${o.obs}`);
    });
  }

  const totalNFs = separations.length;
  const totalProdutos = separations.reduce((sum, s) => sum + (s.produtos || []).length, 0);
  lines.push('');
  lines.push(`Total: ${totalNFs} nota(s) fiscal(is) | ${totalProdutos} produto(s)`);

  return lines.join('\n');
}

/**
 * Open WhatsApp with the message (no fixed number — user chooses recipient).
 * @param {string} message - The text message
 */
export function openWhatsAppWithMessage(message) {
  const encoded = encodeURIComponent(message);
  window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
}

/**
 * Copy text to clipboard and return a promise.
 * @param {string} text - Text to copy
 * @returns {Promise<boolean>}
 */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers
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
