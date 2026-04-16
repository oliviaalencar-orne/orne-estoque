/**
 * useEntries.js — Entries state + CRUD operations
 *
 * Extracted from index-legacy.html App component:
 *   - State: L2342
 *   - addEntry: L2598-2639
 *   - updateEntry: L2664-2676
 *   - deleteEntry: L2678-2682
 */
import { useState, useCallback } from 'react';
import { supabaseClient } from '@/config/supabase';
import { mapEntryFromDB } from '@/utils/mappers';
import { syncProductDefeito } from '@/utils/defeitoSync';

/**
 * Hook for entries state and CRUD.
 *
 * @param {Object|null} user - Current auth user
 * @param {boolean} isStockAdmin - Permission flag
 * @param {Function} setProducts - Products state setter (for local propagation)
 * @returns {Object}
 */
export function useEntries(user, isStockAdmin, setProducts) {
  const [entries, setEntries] = useState([]);

  const addEntry = useCallback(
    async (entry) => {
      if (!isStockAdmin) {
        alert('Sem permissão para esta ação');
        return;
      }
      const newRecord = {
        type: entry.type,
        sku: entry.sku,
        quantity: entry.quantity,
        supplier: entry.supplier || '',
        nf: entry.nf || '',
        local_entrada: entry.localEntrada || '',
        date: new Date().toISOString(),
        user_id: user.email,
        defeito: !!entry.defeito,
        defeito_descricao: entry.defeito ? (entry.defeitoDescricao || '') : '',
      };
      const { data, error } = await supabaseClient
        .from('entries')
        .insert(newRecord)
        .select()
        .single();
      if (error) throw error;

      // Update state IMMEDIATELY without waiting for Realtime
      if (data) {
        setEntries((prev) => {
          if (prev.find((e) => e.id === data.id)) return prev;
          return [...prev, mapEntryFromDB(data)];
        });
      }

      // Propagate local, nf_origem, category and observations to product
      const productUpdate = {};
      if (newRecord.local_entrada && newRecord.local_entrada.trim() !== '') {
        productUpdate.local = newRecord.local_entrada;
      }
      if (newRecord.nf && newRecord.nf.trim() !== '') {
        productUpdate.nf_origem = newRecord.nf;
      }
      if (entry.category && entry.category.trim() !== '') {
        productUpdate.category = entry.category.trim();
      }
      if (entry.observations && entry.observations.trim() !== '') {
        productUpdate.observations = entry.observations.trim();
      }
      if (Object.keys(productUpdate).length > 0) {
        await supabaseClient
          .from('products')
          .update(productUpdate)
          .eq('sku', newRecord.sku);
        setProducts((prev) =>
          prev.map((p) => (p.sku === newRecord.sku ? { ...p, ...productUpdate } : p))
        );
      }

      // Se a entry foi marcada com defeito, recalcula defeito_sumario do produto
      if (newRecord.defeito) {
        try {
          const synced = await syncProductDefeito(newRecord.sku);
          setProducts((prev) =>
            prev.map((p) =>
              p.sku === newRecord.sku
                ? {
                    ...p,
                    defeito: synced.defeito,
                    defeitosPorNf: synced.defeitosPorNf,
                    defeitoData: synced.defeitoData,
                    defeitoDescricao: synced.defeitoDescricao,
                  }
                : p
            )
          );
        } catch (err) {
          console.error('[addEntry] falha no syncProductDefeito:', err);
        }
      }
    },
    [user, isStockAdmin, setProducts]
  );

  const updateEntry = useCallback(
    async (entryId, data) => {
      if (!isStockAdmin) {
        alert('Sem permissão para esta ação');
        return;
      }
      const mapped = {};
      if (data.type !== undefined) mapped.type = data.type;
      if (data.sku !== undefined) mapped.sku = data.sku;
      if (data.quantity !== undefined) mapped.quantity = data.quantity;
      if (data.supplier !== undefined) mapped.supplier = data.supplier;
      if (data.nf !== undefined) mapped.nf = data.nf;
      if (data.localEntrada !== undefined) mapped.local_entrada = data.localEntrada;
      if (data.date !== undefined) mapped.date = data.date;
      if (data.defeito !== undefined) mapped.defeito = !!data.defeito;
      if (data.defeitoDescricao !== undefined) mapped.defeito_descricao = data.defeitoDescricao || '';
      const { error } = await supabaseClient.from('entries').update(mapped).eq('id', entryId);
      if (error) {
        console.error('Erro ao atualizar entrada:', error);
        alert('Erro ao atualizar entrada: ' + error.message);
        return;
      }
      setEntries((prev) =>
        prev.map((e) => (e.id === entryId ? { ...e, ...data } : e))
      );

      // Se o estado de defeito mudou, recalcula produto
      if (data.defeito !== undefined || data.defeitoDescricao !== undefined) {
        const targetSku = data.sku !== undefined
          ? data.sku
          : undefined;
        let skuToSync = targetSku;
        if (!skuToSync) {
          // Busca sku da entry para fazer o sync
          const { data: row } = await supabaseClient
            .from('entries')
            .select('sku')
            .eq('id', entryId)
            .maybeSingle();
          skuToSync = row?.sku;
        }
        if (skuToSync) {
          try {
            const synced = await syncProductDefeito(skuToSync);
            setProducts?.((prev) =>
              prev.map((p) =>
                p.sku === skuToSync
                  ? {
                      ...p,
                      defeito: synced.defeito,
                      defeitosPorNf: synced.defeitosPorNf,
                      defeitoData: synced.defeitoData,
                      defeitoDescricao: synced.defeitoDescricao,
                    }
                  : p
              )
            );
          } catch (err) {
            console.error('[updateEntry] falha no syncProductDefeito:', err);
          }
        }
      }
    },
    [isStockAdmin, setProducts]
  );

  const deleteEntry = useCallback(
    async (entryId) => {
      if (!isStockAdmin) {
        alert('Sem permissão para esta ação');
        return;
      }
      // Captura sku+defeito antes de deletar, para saber se precisa re-sincronizar
      const { data: before } = await supabaseClient
        .from('entries')
        .select('sku, defeito')
        .eq('id', entryId)
        .maybeSingle();

      const { error } = await supabaseClient.from('entries').delete().eq('id', entryId);
      if (error) {
        console.error('Erro ao excluir entrada:', error);
        alert('Erro ao excluir entrada: ' + error.message);
        return;
      }
      setEntries((prev) => prev.filter((e) => e.id !== entryId));

      if (before?.sku && before.defeito) {
        try {
          const synced = await syncProductDefeito(before.sku);
          setProducts?.((prev) =>
            prev.map((p) =>
              p.sku === before.sku
                ? {
                    ...p,
                    defeito: synced.defeito,
                    defeitosPorNf: synced.defeitosPorNf,
                    defeitoData: synced.defeitoData,
                    defeitoDescricao: synced.defeitoDescricao,
                  }
                : p
            )
          );
        } catch (err) {
          console.error('[deleteEntry] falha no syncProductDefeito:', err);
        }
      }
    },
    [isStockAdmin, setProducts]
  );

  return {
    entries,
    setEntries,
    addEntry,
    updateEntry,
    deleteEntry,
  };
}
