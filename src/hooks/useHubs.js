/**
 * useHubs.js — Hubs state + CRUD + Realtime
 */
import { useState, useCallback } from 'react';
import { supabaseClient } from '@/config/supabase';

export function useHubs(isStockAdmin) {
  const [hubs, setHubs] = useState([]);
  const [hubsLoading, setHubsLoading] = useState(true);

  const initHubs = useCallback(() => {
    supabaseClient
      .from('hubs')
      .select('*')
      .order('name')
      .then(({ data, error }) => {
        if (error) { console.error('Erro ao buscar hubs:', error); }
        if (data) setHubs(data);
        setHubsLoading(false);
      });

    const channel = supabaseClient
      .channel('hubs-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'hubs' },
        () => {
          supabaseClient
            .from('hubs')
            .select('*')
            .order('name')
            .then(({ data, error }) => {
              if (error) { console.error('Erro ao refetch hubs:', error); return; }
              if (data) setHubs(data);
            });
        }
      )
      .subscribe();

    return channel;
  }, []);

  const addHub = useCallback(
    async (name) => {
      if (!isStockAdmin) {
        alert('Sem permissão para esta ação');
        return;
      }
      const { data, error } = await supabaseClient
        .from('hubs')
        .insert({ name })
        .select()
        .single();
      if (error) {
        console.error('Erro ao criar hub:', error);
        alert('Erro ao criar hub: ' + error.message);
        return null;
      }
      return data;
    },
    [isStockAdmin]
  );

  const updateHub = useCallback(
    async (hubId, name) => {
      if (!isStockAdmin) {
        alert('Sem permissão para esta ação');
        return;
      }
      const { error } = await supabaseClient
        .from('hubs')
        .update({ name, updated_at: new Date().toISOString() })
        .eq('id', hubId);
      if (error) {
        console.error('Erro ao atualizar hub:', error);
        alert('Erro ao atualizar hub: ' + error.message);
      }
    },
    [isStockAdmin]
  );

  const deleteHub = useCallback(
    async (hubId, separations) => {
      if (!isStockAdmin) {
        alert('Sem permissão para esta ação');
        return false;
      }
      const linked = (separations || []).filter(s => s.hubId === hubId);
      if (linked.length > 0) {
        alert(`Não é possível excluir: ${linked.length} separação(ões) vinculada(s) a este HUB.`);
        return false;
      }
      const { error } = await supabaseClient
        .from('hubs')
        .delete()
        .eq('id', hubId);
      if (error) {
        console.error('Erro ao excluir hub:', error);
        alert('Erro ao excluir hub: ' + error.message);
        return false;
      }
      return true;
    },
    [isStockAdmin]
  );

  return {
    hubs,
    setHubs,
    hubsLoading,
    initHubs,
    addHub,
    updateHub,
    deleteHub,
  };
}
