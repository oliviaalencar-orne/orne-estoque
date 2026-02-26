/**
 * fifo.js — FIFO stock-per-NF calculation
 *
 * Consolidated from 3 duplicate copies:
 *   - ExitForm (L5777-5846)
 *   - ShippingManager (L6174-6243)
 *   - TinyNFeImport (inline)
 *
 * Single source of truth for NF-based stock deduction.
 */

/**
 * Normalize NF key: null, '', 'Sem NF', 'SEM_NF' → 'SEM_NF'
 */
export const normalizeNfKey = (nf) => {
  if (!nf || nf === 'Sem NF' || nf === 'SEM_NF') return 'SEM_NF';
  return nf;
};

/**
 * Calculate available stock per NF for a given product SKU.
 *
 * Returns an array of { nf, entradas, saidas, quantidade, data, localEntrada }
 * filtered to only NFs with quantidade > 0.
 *
 * Old exits (without nfOrigem) are distributed via FIFO (oldest first).
 *
 * @param {string} produtoSku - Product SKU
 * @param {Array} entries - All entry records
 * @param {Array} exits - All exit records
 * @returns {Array} NFs with available stock
 */
export const getEstoquePorNF = (produtoSku, entries, exits) => {
  if (!produtoSku || !entries || !exits) return [];

  // Get all entries for this product, sorted by date
  const entradasProduto = entries
    .filter((e) => e.sku === produtoSku)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  // Get all exits for this product
  const saidasProduto = exits.filter((e) => e.sku === produtoSku);

  // Separate exits WITH real NF vs WITHOUT NF (includes 'Sem NF', null, empty)
  const saidasComNF = saidasProduto.filter(
    (s) => s.nfOrigem && s.nfOrigem !== 'Sem NF' && s.nfOrigem !== 'SEM_NF'
  );
  const saidasSemNF = saidasProduto.filter(
    (s) => !s.nfOrigem || s.nfOrigem === 'Sem NF' || s.nfOrigem === 'SEM_NF'
  );

  // Group entries by normalized NF
  const porNF = {};
  entradasProduto.forEach((e) => {
    const nfKey = normalizeNfKey(e.nf);
    if (!porNF[nfKey]) {
      porNF[nfKey] = {
        nf: e.nf || 'Sem NF',
        entradas: 0,
        saidas: 0,
        data: e.date,
        localEntrada: e.localEntrada || '-',
      };
    }
    porNF[nfKey].entradas += e.quantity || 0;
  });

  // Subtract exits WITH real NF from each specific NF
  saidasComNF.forEach((s) => {
    const nfKey = normalizeNfKey(s.nfOrigem);
    if (porNF[nfKey]) {
      porNF[nfKey].saidas += s.quantity || 0;
    }
  });

  // Distribute exits WITHOUT NF via FIFO (oldest first)
  let saidasRestantes = saidasSemNF.reduce(
    (sum, s) => sum + (s.quantity || 0),
    0
  );
  const nfKeys = Object.keys(porNF).sort(
    (a, b) => new Date(porNF[a].data) - new Date(porNF[b].data)
  );

  for (const nfKey of nfKeys) {
    if (saidasRestantes <= 0) break;
    const disponivel = porNF[nfKey].entradas - porNF[nfKey].saidas;
    const descontar = Math.min(disponivel, saidasRestantes);
    porNF[nfKey].saidas += descontar;
    saidasRestantes -= descontar;
  }

  // Calculate available quantity and filter NFs with stock > 0
  return Object.values(porNF)
    .map((item) => ({
      ...item,
      quantidade: item.entradas - item.saidas,
    }))
    .filter((item) => item.quantidade > 0);
};
