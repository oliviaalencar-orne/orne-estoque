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
 * @returns {Object} { stockMap, currentStock }
 *   - stockMap: { entryMap, exitMap } — SKU → total qty
 *   - currentStock: products enriched with currentQuantity and status
 */
export function useStock(products, entries, exits) {
  const stockMap = useMemo(() => {
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
    return { entryMap, exitMap };
  }, [entries, exits]);

  const currentStock = useMemo(() => {
    const { entryMap, exitMap } = stockMap;
    return products.map((p) => {
      const qty = (entryMap[p.sku] || 0) - (exitMap[p.sku] || 0);
      const min = p.minStock || 3;
      return {
        ...p,
        currentQuantity: qty,
        status: qty === 0 ? 'empty' : qty < min ? 'low' : 'ok',
      };
    });
  }, [products, stockMap]);

  return { stockMap, currentStock };
}
