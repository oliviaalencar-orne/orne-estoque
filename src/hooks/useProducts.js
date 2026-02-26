/**
 * useProducts.js — Products state + CRUD operations
 *
 * Extracted from index-legacy.html App component:
 *   - State: L2341
 *   - Fetch: L2469-2477
 *   - addProduct: L2717-2737
 *   - updateProduct: L2739-2754
 *   - deleteProduct: L2756-2762
 *   - refetchData: L2704-2715
 *   - handleImport: L2550-2596
 *
 * Products do NOT use Realtime (> 1000 rows), using paginated fetch instead.
 */
import { useState, useRef, useCallback } from 'react';
import { supabaseClient } from '@/config/supabase';
import { mapProductFromDB, mapEntryFromDB, mapExitFromDB } from '@/utils/mappers';
import { generateId } from '@/utils/helpers';
import { fetchAllRows } from './useSupabaseCollection';

const PRODUCT_FIELDS = 'id, name, sku, ean, category, min_stock, observations, nf_origem, created_at, tiny_id, unit_price, local';
const PRODUCT_FILTERS = [(q) => q.neq('sku', ''), (q) => q.neq('name', '')];

/**
 * Hook for products state and CRUD.
 *
 * @param {Object|null} user - Current auth user
 * @param {boolean} isStockAdmin - Permission flag
 * @returns {Object}
 */
export function useProducts(user, isStockAdmin) {
  const [products, setProducts] = useState([]);
  const loadProductsRef = useRef(null);

  /**
   * Load (or reload) all products from Supabase.
   * @returns {Promise}
   */
  const loadProducts = useCallback(async () => {
    const data = await fetchAllRows('products', PRODUCT_FIELDS, PRODUCT_FILTERS);
    setProducts(data.map(mapProductFromDB));
    return data;
  }, []);

  // Expose ref for external access
  loadProductsRef.current = loadProducts;

  const addProduct = useCallback(
    async (product) => {
      if (!isStockAdmin) {
        alert('Sem permissão para esta ação');
        return;
      }
      const newProduct = { ...product, id: product.id || generateId() };
      const { error } = await supabaseClient.from('products').upsert({
        id: newProduct.id,
        name: newProduct.name,
        sku: newProduct.sku,
        ean: newProduct.ean || '',
        category: newProduct.category || '',
        min_stock: newProduct.minStock || 3,
        observations: newProduct.observations || '',
        nf_origem: newProduct.nfOrigem || '',
        unit_price: newProduct.unitPrice || 0,
        created_at: newProduct.createdAt || new Date().toISOString(),
      });
      if (error) {
        console.error('Erro ao adicionar produto:', error);
        alert('Erro ao salvar produto: ' + error.message);
        return;
      }
      // Update local state (products without Realtime)
      setProducts((prev) => {
        const idx = prev.findIndex((p) => p.id === newProduct.id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = { ...prev[idx], ...newProduct };
          return updated;
        }
        return [...prev, newProduct];
      });
      return newProduct;
    },
    [isStockAdmin]
  );

  const updateProduct = useCallback(
    async (productId, data) => {
      if (!isStockAdmin) {
        alert('Sem permissão para esta ação');
        return;
      }
      const mapped = {};
      if (data.name !== undefined) mapped.name = data.name;
      if (data.sku !== undefined) mapped.sku = data.sku;
      if (data.ean !== undefined) mapped.ean = data.ean;
      if (data.category !== undefined) mapped.category = data.category;
      if (data.minStock !== undefined) mapped.min_stock = data.minStock;
      if (data.observations !== undefined) mapped.observations = data.observations;
      if (data.nfOrigem !== undefined) mapped.nf_origem = data.nfOrigem;
      if (data.local !== undefined) mapped.local = data.local;
      const { error } = await supabaseClient.from('products').update(mapped).eq('id', productId);
      if (error) {
        console.error('Erro ao atualizar produto:', error);
        alert('Erro ao atualizar produto: ' + error.message);
        return;
      }
      // Update local state
      setProducts((prev) => prev.map((p) => (p.id === productId ? { ...p, ...data } : p)));
    },
    [isStockAdmin]
  );

  const deleteProduct = useCallback(
    async (productId) => {
      if (!isStockAdmin) {
        alert('Sem permissão para esta ação');
        return;
      }
      const { error } = await supabaseClient.from('products').delete().eq('id', productId);
      if (error) {
        console.error('Erro ao excluir produto:', error);
        alert('Erro ao excluir produto: ' + error.message);
        return;
      }
      setProducts((prev) => prev.filter((p) => p.id !== productId));
    },
    [isStockAdmin]
  );

  /**
   * Full refetch of products, entries, and exits — returns setters for entries/exits.
   * Caller must pass setEntries and setExits.
   */
  const refetchData = useCallback(
    async (setEntries, setExits) => {
      const [prodData, entRes, exitRes] = await Promise.all([
        fetchAllRows('products', PRODUCT_FIELDS, PRODUCT_FILTERS),
        supabaseClient.from('entries').select('*'),
        supabaseClient.from('exits').select('*'),
      ]);
      if (prodData.length > 0) setProducts(prodData.map(mapProductFromDB));
      if (entRes.data) setEntries(entRes.data.map(mapEntryFromDB));
      if (exitRes.data) setExits(exitRes.data.map(mapExitFromDB));
    },
    []
  );

  /**
   * Import a single record (entry or exit) — used by ImportHub.
   */
  const handleImport = useCallback(
    async (data) => {
      if (!isStockAdmin) {
        alert('Sem permissão para esta ação');
        return;
      }
      const isEntry =
        data.type === 'entry' ||
        data.type === 'COMPRA' ||
        data.type === 'DEVOLUCAO' ||
        data.type === 'AJUSTE';

      if (isEntry) {
        const newRecord = {
          type: data.type,
          sku: data.sku,
          quantity: data.quantity,
          supplier: data.supplier || '',
          nf: data.nf || '',
          local_entrada: data.localEntrada || '',
          date: new Date().toISOString(),
          user_id: user.email,
        };
        const { data: inserted, error } = await supabaseClient
          .from('entries')
          .insert(newRecord)
          .select()
          .single();
        if (error) {
          console.error('Erro ao importar entrada:', error);
          alert('Erro ao importar entrada: ' + error.message);
          return;
        }
        // Note: entries state update handled by caller via setEntries returned from refetchData
        // Propagate local da entrada para o produto
        if (newRecord.local_entrada && newRecord.local_entrada.trim() !== '') {
          await supabaseClient
            .from('products')
            .update({ local: newRecord.local_entrada })
            .eq('sku', newRecord.sku);
          setProducts((prev) =>
            prev.map((p) =>
              p.sku === newRecord.sku ? { ...p, local: newRecord.local_entrada } : p
            )
          );
        }
        return { inserted, isEntry: true };
      } else {
        const newRecord = {
          type: data.type,
          sku: data.sku,
          quantity: data.quantity,
          client: data.client || '',
          nf: data.nf || '',
          nf_origem: data.nfOrigem || null,
          date: new Date().toISOString(),
          user_id: user.email,
        };
        const { data: inserted, error } = await supabaseClient
          .from('exits')
          .insert(newRecord)
          .select()
          .single();
        if (error) {
          console.error('Erro ao importar saída:', error);
          alert('Erro ao importar saída: ' + error.message);
          return;
        }
        return { inserted, isEntry: false };
      }
    },
    [user, isStockAdmin]
  );

  return {
    products,
    setProducts,
    loadProducts,
    loadProductsRef,
    addProduct,
    updateProduct,
    deleteProduct,
    refetchData,
    handleImport,
  };
}
