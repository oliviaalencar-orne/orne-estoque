/**
 * useExits.js — Exits state + CRUD operations
 *
 * Extracted from index-legacy.html App component:
 *   - State: L2343
 *   - addExit: L2641-2662  (RETURNS the created exit — critical for shipping)
 *   - updateExit: L2684-2696
 *   - deleteExit: L2698-2702
 */
import { useState, useCallback } from 'react';
import { supabaseClient } from '@/config/supabase';
import { mapExitFromDB } from '@/utils/mappers';

/**
 * Hook for exits state and CRUD.
 *
 * @param {Object|null} user - Current auth user
 * @param {boolean} isStockAdmin - Permission flag
 * @returns {Object}
 */
export function useExits(user, isStockAdmin) {
  const [exits, setExits] = useState([]);

  /**
   * Add exit and RETURN the created exit record.
   * This is critical — ShippingManager uses the return value for exitId in JSONB.
   */
  const addExit = useCallback(
    async (exit) => {
      if (!isStockAdmin) {
        alert('Sem permissão para esta ação');
        return null;
      }
      const newRecord = {
        type: exit.type,
        sku: exit.sku,
        quantity: exit.quantity,
        client: exit.client || '',
        nf: exit.nf || '',
        nf_origem: exit.nfOrigem || null,
        date: new Date().toISOString(),
        user_id: user.email,
      };
      const { data, error } = await supabaseClient
        .from('exits')
        .insert(newRecord)
        .select()
        .single();
      if (error) throw error;

      // Update state IMMEDIATELY without waiting for Realtime
      if (data) {
        const mappedExit = mapExitFromDB(data);
        setExits((prev) => {
          if (prev.find((e) => e.id === data.id)) return prev;
          return [...prev, mappedExit];
        });
        return mappedExit;
      }
      return null;
    },
    [user, isStockAdmin]
  );

  const updateExit = useCallback(
    async (exitId, data) => {
      if (!isStockAdmin) {
        alert('Sem permissão para esta ação');
        return;
      }
      const mapped = {};
      if (data.type !== undefined) mapped.type = data.type;
      if (data.sku !== undefined) mapped.sku = data.sku;
      if (data.quantity !== undefined) mapped.quantity = data.quantity;
      if (data.client !== undefined) mapped.client = data.client;
      if (data.nf !== undefined) mapped.nf = data.nf;
      if (data.nfOrigem !== undefined) mapped.nf_origem = data.nfOrigem;
      if (data.date !== undefined) mapped.date = data.date;
      const { error } = await supabaseClient.from('exits').update(mapped).eq('id', exitId);
      if (error) {
        console.error('Erro ao atualizar saída:', error);
        alert('Erro ao atualizar saída: ' + error.message);
      }
    },
    [isStockAdmin]
  );

  const deleteExit = useCallback(
    async (exitId) => {
      if (!isStockAdmin) {
        alert('Sem permissão para esta ação');
        return;
      }
      const { error } = await supabaseClient.from('exits').delete().eq('id', exitId);
      if (error) {
        console.error('Erro ao excluir saída:', error);
        alert('Erro ao excluir saída: ' + error.message);
      }
    },
    [isStockAdmin]
  );

  return {
    exits,
    setExits,
    addExit,
    updateExit,
    deleteExit,
  };
}
