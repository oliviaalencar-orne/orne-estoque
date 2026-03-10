/**
 * useEquipeData.js — Lightweight data loading for equipe users
 *
 * Equipe users don't need:
 *   - Full entries/exits tables (huge)
 *   - Realtime subscriptions on categories, locais, entries, exits
 *
 * Instead they get:
 *   - Products with pre-calculated stock via RPC (paginated, server-side search)
 *   - Stock summary for Dashboard stats
 *   - Realtime only on shippings + separations (2 channels vs 7 for admin)
 */
import { useState, useCallback, useRef } from 'react';
import { supabaseClient } from '@/config/supabase';
import { mapProductFromDB } from '@/utils/mappers';

const PAGE_SIZE = 50;

/**
 * Hook for paginated products with server-side stock calculation.
 * Uses the `get_products_with_stock` RPC.
 */
export function useEquipeProducts() {
  const [equipeProducts, setEquipeProducts] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const currentSearch = useRef('');
  const currentCategory = useRef('');
  const currentOffset = useRef(0);

  /**
   * Load a page of products with stock from RPC.
   * @param {Object} opts
   * @param {string} opts.search - Search term
   * @param {string} opts.category - Category filter
   * @param {boolean} opts.reset - If true, replaces current results; if false, appends
   */
  const loadPage = useCallback(async ({ search = '', category = '', reset = false } = {}) => {
    setIsLoading(true);

    if (reset) {
      currentOffset.current = 0;
      currentSearch.current = search;
      currentCategory.current = category;
    }

    try {
      const { data, error } = await supabaseClient.rpc('get_products_with_stock', {
        p_search: currentSearch.current,
        p_category: currentCategory.current,
        p_limit: PAGE_SIZE,
        p_offset: currentOffset.current,
      });

      if (error) {
        console.error('Erro ao carregar produtos (RPC):', error);
        setIsLoading(false);
        return;
      }

      const mapped = (data || []).map(row => ({
        ...mapProductFromDB({
          id: row.id,
          name: row.name,
          sku: row.sku,
          ean: row.ean,
          category: row.category,
          min_stock: row.min_stock,
          observations: row.observations,
          nf_origem: row.nf_origem,
          unit_price: row.unit_price,
          local: row.local,
          created_at: row.created_at,
          tiny_id: row.tiny_id,
        }),
        // Pre-calculated stock from RPC
        currentQuantity: Number(row.current_stock) || 0,
        status: Number(row.current_stock) === 0 ? 'empty' : 'ok',
      }));

      const total = data?.[0]?.total_count ? Number(data[0].total_count) : 0;
      setTotalCount(total);

      if (reset) {
        setEquipeProducts(mapped);
      } else {
        setEquipeProducts(prev => [...prev, ...mapped]);
      }

      currentOffset.current += mapped.length;
      setHasMore(currentOffset.current < total);
    } catch (err) {
      console.error('Erro RPC get_products_with_stock:', err);
    }

    setIsLoading(false);
  }, []);

  /**
   * Load next page (append).
   */
  const loadMore = useCallback(() => {
    if (!isLoading && hasMore) {
      loadPage({ reset: false });
    }
  }, [isLoading, hasMore, loadPage]);

  /**
   * Search with new term (reset and reload).
   */
  const searchProducts = useCallback((search, category = '') => {
    currentSearch.current = search;
    currentCategory.current = category;
    loadPage({ search, category, reset: true });
  }, [loadPage]);

  /**
   * Initial load.
   */
  const initLoad = useCallback(() => {
    loadPage({ search: '', category: '', reset: true });
  }, [loadPage]);

  return {
    equipeProducts,
    totalCount,
    isLoading,
    hasMore,
    loadMore,
    searchProducts,
    initLoad,
  };
}

/**
 * Load stock summary for Dashboard stats.
 * Returns a map: { sku: currentQuantity }
 */
export async function loadStockSummary() {
  const { data, error } = await supabaseClient.rpc('get_stock_summary');
  if (error) {
    console.error('Erro ao carregar resumo de estoque:', error);
    return {};
  }
  const map = {};
  (data || []).forEach(row => {
    map[row.sku] = Number(row.current_stock) || 0;
  });
  return map;
}

/**
 * Fetch-only version of a table (no realtime subscription).
 * Returns the data array.
 */
export async function fetchOnce(tableName, transform = null) {
  const { data, error } = await supabaseClient.from(tableName).select('*');
  if (error) {
    console.error(`Erro ao buscar ${tableName}:`, error);
    return [];
  }
  return transform ? data.map(transform) : data;
}
