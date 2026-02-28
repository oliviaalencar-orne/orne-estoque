/**
 * mappers.js — snake_case → camelCase mappers for Supabase rows
 *
 * Extracted from index-legacy.html L1793-1825
 */

export const mapProductFromDB = (row) => ({
  id: row.id,
  name: row.name,
  sku: row.sku,
  ean: row.ean || '',
  category: row.category || '',
  minStock: row.min_stock || 3,
  observations: row.observations || '',
  nfOrigem: row.nf_origem || '',
  unitPrice: parseFloat(row.unit_price) || 0,
  tinyId: row.tiny_id || '',
  local: row.local || '',
  createdAt: row.created_at,
});

export const mapEntryFromDB = (row) => ({
  id: row.id,
  type: row.type,
  sku: row.sku,
  quantity: row.quantity,
  supplier: row.supplier || '',
  nf: row.nf || '',
  localEntrada: row.local_entrada || '',
  date: row.date,
  userId: row.user_id || '',
});

export const mapExitFromDB = (row) => ({
  id: row.id,
  type: row.type,
  sku: row.sku,
  quantity: row.quantity,
  client: row.client || '',
  nf: row.nf || '',
  nfOrigem: row.nf_origem || null,
  date: row.date,
  userId: row.user_id || '',
});

export const mapShippingFromDB = (row) => ({
  id: row.id,
  nfNumero: row.nf_numero || '',
  cliente: row.cliente || '',
  destino: row.destino || '',
  localOrigem: row.local_origem || '',
  transportadora: row.transportadora || '',
  codigoRastreio: row.codigo_rastreio || '',
  linkRastreio: row.link_rastreio || '',
  melhorEnvioId: row.melhor_envio_id || '',
  produtos: row.produtos || [],
  observacoes: row.observacoes || '',
  status: row.status || 'PENDENTE',
  date: row.date,
  userId: row.user_id || '',
  ultimaAtualizacaoRastreio: row.ultima_atualizacao_rastreio || '',
  rastreioInfo: row.rastreio_info || null,
});

export const mapSeparationFromDB = (row) => ({
  id: row.id,
  nfNumero: row.nf_numero || '',
  cliente: row.cliente || '',
  destino: row.destino || '',
  observacoes: row.observacoes || '',
  status: row.status || 'pendente',
  produtos: row.produtos || [],
  shippingId: row.shipping_id || '',
  date: row.date,
  updatedAt: row.updated_at,
  userId: row.user_id || '',
});
