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
        if (error.code === '23505') {
          // unique_violation — hubs_name_unique adicionada na Sub-frente 3.0b (M2).
          // Antes da 3.0b a duplicata passava silenciosamente; agora bloqueia.
          alert(`HUB '${name}' já existe. Use outro nome ou edite o existente.`);
        } else {
          alert('Erro ao criar hub: ' + (error.message || 'erro desconhecido'));
        }
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
        .update({ name })
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
