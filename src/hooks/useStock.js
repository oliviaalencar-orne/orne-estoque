/**
 * useStock.js — Stock calculation via useMemo
 *
 * Extracted from index-legacy.html App component L2527-2548
 */
import { useMemo } from 'react';

/**
 * Computes current stock from products, entries, and exits.
 *
 * @param {Array} products - Product list
 * @param {Array} entries - Entry records
 * @param {Array} exits - Exit records
 * @param {Object|null} precomputedStockMap - Optional { sku: quantity } map from RPC (for equipe)
 * @param {Array} separations - Separation records (used for "em separação" indicator only)
 * @returns {Object} { stockMap, currentStock }
 *   - stockMap: { entryMap, exitMap } — SKU → total qty
 *   - currentStock: products enriched with currentQuantity, status and inSeparationQty
 *
 * Frente 5 — Alerta "em separação" no estoque (Caminho A: visual apenas)
 * -----------------------------------------------------------------------
 * (a) Caminho A: este hook agora também devolve `inSeparationQty` por SKU,
 *     mas NÃO altera `currentQuantity`. A movimentação real de estoque
 *     continua sendo registrada exclusivamente via INSERT em `exits` no
 *     momento do despacho (ver SeparationManager.jsx + ShippingManager.jsx).
 *     Este campo é puramente um indicador visual auxiliar exibido em
 *     StockView.jsx — preserva a invariante de que estoque disponível =
 *     SUM(entries) − SUM(exits) por SKU em todos os 4 caminhos
 *     (useStock, get_stock_summary, get_products_with_stock,
 *     safe_create_exit).
 *
 * (b) Filtro de status defensivo: o schema permite 4 valores
 *     ('pendente', 'separado', 'embalado', 'despachado') mas hoje em prod
 *     apenas `pendente` e `despachado` são usados. Filtramos os 3
 *     primeiros para que, se a UX vier a popular `separado`/`embalado` no
 *     futuro, o alerta continue correto sem precisar mudar este filtro.
 *
 * (c) Filtro `baixarEstoque=true`: produtos no JSONB de uma separation
 *     com `baixarEstoque=false` não geram exit ao virar shipping (não
 *     consomem estoque). Excluí-los aqui evita falso-positivo no alerta
 *     ("aparece em separação mas nunca vai sair do estoque").
 *
 * Dívida conhecida: `useSeparations` carrega via useSupabaseCollection com
 * limite silencioso de 1000 do PostgREST. Hoje há 2 separations pendentes
 * em prod (folga total) e 1.353 separations totais. Se o volume crescer
 * acima de 1.000 separations carregadas, este alerta pode ficar
 * incompleto. Mitigação futura: paginar via `fetchAllRows` ou extender
 * `get_stock_summary` para incluir `qty_em_separacao` no servidor (índice
 * GIN em separations.produtos seria necessário). Não é urgente para a
 * Frente 5 — fica como dívida documentada para PR futura se o volume
 * de separações pendentes exceder ~500.
 */
export function useStock(products, entries, exits, precomputedStockMap = null, separations = []) {
  const stockMap = useMemo(() => {
    if (precomputedStockMap) {
      // Equipe mode: stock pre-calculated server-side via RPC
      return { entryMap: {}, exitMap: {}, precomputed: precomputedStockMap };
    }
    // Admin mode: compute from entries/exits
    const entryMap = {};
    const exitMap = {};
    entries.forEach((e) => {
      if (!entryMap[e.sku]) entryMap[e.sku] = 0;
      entryMap[e.sku] += parseInt(e.quantity) || 0;
    });
    exits.forEach((e) => {
      if (!exitMap[e.sku]) exitMap[e.sku] = 0;
      exitMap[e.sku] += parseInt(e.quantity) || 0;
    });
    return { entryMap, exitMap, precomputed: null };
  }, [entries, exits, precomputedStockMap]);

  // inSeparationMap[sku] = total de unidades em separação ativa para este SKU.
  // Também guardamos `nfs[sku]` como mapa { nfNumero: qtd } para alimentar o
  // tooltip da UI sem precisar refazer a varredura. Ver bloco de comentário
  // do hook acima para detalhes dos filtros (a)(b)(c).
  const inSeparationData = useMemo(() => {
    const qtyMap = {};
    const nfsMap = {}; // { sku: { nfNumero: quantidade } }
    const ACTIVE_STATUSES = new Set(['pendente', 'separado', 'embalado']);
    (separations || []).forEach((sep) => {
      if (!ACTIVE_STATUSES.has(sep.status)) return;
      const produtos = Array.isArray(sep.produtos) ? sep.produtos : [];
      produtos.forEach((prod) => {
        if (!prod || prod.baixarEstoque !== true) return;
        const sku = prod.produtoEstoque?.sku || prod.sku;
        if (!sku) return;
        const qtd = parseInt(prod.quantidade) || 0;
        if (qtd <= 0) return;
        qtyMap[sku] = (qtyMap[sku] || 0) + qtd;
        const nfKey = sep.nfNumero || 'sem-NF';
        if (!nfsMap[sku]) nfsMap[sku] = {};
        nfsMap[sku][nfKey] = (nfsMap[sku][nfKey] || 0) + qtd;
      });
    });
    return { qtyMap, nfsMap };
  }, [separations]);

  const currentStock = useMemo(() => {
    const { entryMap, exitMap, precomputed } = stockMap;
    const { qtyMap: inSepQtyMap, nfsMap: inSepNfsMap } = inSeparationData;
    return products.map((p) => {
      const qty = precomputed
        ? (precomputed[p.sku] || 0)
        : (entryMap[p.sku] || 0) - (exitMap[p.sku] || 0);
      const inSeparationQty = inSepQtyMap[p.sku] || 0;
      const inSeparationNfs = inSepNfsMap[p.sku] || null;
      return {
        ...p,
        currentQuantity: qty,
        status: qty === 0 ? 'empty' : 'ok',
        inSeparationQty,
        inSeparationNfs, // { nfNumero: quantidade } | null — alimenta tooltip em StockView
      };
    });
  }, [products, stockMap, inSeparationData]);

  return { stockMap, currentStock };
}
