/**
 * statusLabels.js — Status labels/colors for devoluções
 *
 * Despachos use statusList from ShippingManager.
 * Devoluções override labels to reflect return flow.
 */

const DEVOLUCAO_LABELS = {
  DESPACHADO: 'Devolvendo',
  EM_TRANSITO: 'Em Trânsito',
  SAIU_ENTREGA: 'Em Rota de Entrega',
  TENTATIVA_ENTREGA: 'Tentativa de Entrega',
  ENTREGUE: 'Recebido no HUB',
};

const DEVOLUCAO_COLORS = {
  DESPACHADO: '#d97706',
  EM_TRANSITO: '#3b82f6',
  SAIU_ENTREGA: '#7c3aed',
  TENTATIVA_ENTREGA: '#ea580c',
  ENTREGUE: '#10b981',
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
