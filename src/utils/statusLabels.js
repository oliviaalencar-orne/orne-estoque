/**
 * statusLabels.js — Status labels/colors for devoluções
 *
 * Despachos use statusList from ShippingManager.
 * Devoluções override labels to reflect return flow.
 */

const DEVOLUCAO_LABELS = {
  DESPACHADO: 'Devolvendo',
  AGUARDANDO_COLETA: 'Aguardando Coleta',
  EM_TRANSITO: 'Em Trânsito',
  SAIU_ENTREGA: 'Em Rota de Entrega',
  TENTATIVA_ENTREGA: 'Tentativa de Entrega',
  ENTREGUE: 'Recebido no HUB',
  // Entrega 1 — Taxonomia de Devolução
  DEVOLVIDO: 'Devolvido',
  ETIQUETA_CANCELADA: 'Etiqueta cancelada',
  EXTRAVIADO: 'Extraviado',
};

const DEVOLUCAO_COLORS = {
  DESPACHADO: '#d97706',
  AGUARDANDO_COLETA: '#f59e0b',
  EM_TRANSITO: '#3b82f6',
  SAIU_ENTREGA: '#7c3aed',
  TENTATIVA_ENTREGA: '#ea580c',
  ENTREGUE: '#10b981',
  // Terminais da Entrega 1
  DEVOLVIDO: '#893030',        // vermelho escuro Orne
  ETIQUETA_CANCELADA: '#6b7280', // cinza (administrativo, neutro)
  EXTRAVIADO: '#7f1d1d',       // vermelho muito escuro (crítico)
};

export function getStatusLabel(status, tipo) {
  if (tipo === 'devolucao') {
    return DEVOLUCAO_LABELS[status] || status;
  }
  return null;
}

export function getStatusColor(status, tipo) {
  if (tipo === 'devolucao') {
    return DEVOLUCAO_COLORS[status] || '#6b7280';
  }
  return null;
}
