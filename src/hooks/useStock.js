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
 * @returns {Object} { stockMap, currentStock }
 *   - stockMap: { entryMap, exitMap } — SKU → total qty
 *   - currentStock: products enriched with currentQuantity and status
 */
export function useStock(products, entries, exits, precomputedStockMap = null) {
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

  const currentStock = useMemo(() => {
    const { entryMap, exitMap, precomputed } = stockMap;
    return products.map((p) => {
      const qty = precomputed
        ? (precomputed[p.sku] || 0)
        : (entryMap[p.sku] || 0) - (exitMap[p.sku] || 0);
      return {
        ...p,
        currentQuantity: qty,
        status: qty === 0 ? 'empty' : 'ok',
      };
    });
  }, [products, stockMap]);

  return { stockMap, currentStock };
}
