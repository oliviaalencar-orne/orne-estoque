/**
 * useMotivosDevolucao.js — Motivos de devolução state + CRUD (Sub-frente 3.0a)
 *
 * Padrão B (CP1 2026-05-13): one-shot fetch + refetch após mutation.
 * Diferente do useHubs (realtime channel) porque o caso de uso é
 * distinto: admin único editor, modal raramente aberto, lista muda
 * raramente — WS sempre aberto seria custo sem benefício.
 *
 * Retorna a lista COMPLETA (ativos + inativos) ordenada por `ordem`.
 * Consumers filtram via `motivos.filter(m => m.ativo)` para selects.
 * Modal de gestão usa a lista completa com toggle "mostrar desativados".
 */
import { useState, useCallback, useEffect } from 'react';
import { supabaseClient } from '@/config/supabase';

export function useMotivosDevolucao(isStockAdmin) {
  const [motivos, setMotivos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchMotivos = useCallback(async () => {
    const { data, error: err } = await supabaseClient
      .from('motivos_devolucao')
      .select('*')
      .order('ordem', { ascending: true });
    if (err) {
      console.error('Erro ao buscar motivos de devolução:', err);
      setError(err);
    } else {
      setMotivos(data || []);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchMotivos();
  }, [fetchMotivos]);

  const addMotivo = useCallback(
    async (nome) => {
      if (!isStockAdmin) {
        alert('Sem permissão para esta ação');
        return null;
      }
      const trimmed = (nome || '').trim();
      if (!trimmed) return null;
      const nextOrdem = motivos.reduce((max, m) => Math.max(max, m.ordem || 0), 0) + 1;
      const { data, error: err } = await supabaseClient
        .from('motivos_devolucao')
        .insert({ nome: trimmed, ordem: nextOrdem })
        .select()
        .single();
      if (err) {
        console.error('Erro ao criar motivo:', err);
        alert('Erro ao criar motivo: ' + err.message);
        return null;
      }
      await fetchMotivos();
      return data;
    },
    [isStockAdmin, motivos, fetchMotivos]
  );

  const updateMotivo = useCallback(
    async (id, patch) => {
      if (!isStockAdmin) {
        alert('Sem permissão para esta ação');
        return false;
      }
      const cleanPatch = {};
      if (patch.nome !== undefined) cleanPatch.nome = (patch.nome || '').trim();
      if (patch.ativo !== undefined) cleanPatch.ativo = patch.ativo;
      if (patch.ordem !== undefined) cleanPatch.ordem = patch.ordem;
      if (Object.keys(cleanPatch).length === 0) return true;
      const { error: err } = await supabaseClient
        .from('motivos_devolucao')
        .update(cleanPatch)
        .eq('id', id);
      if (err) {
        console.error('Erro ao atualizar motivo:', err);
        alert('Erro ao atualizar motivo: ' + err.message);
        return false;
      }
      await fetchMotivos();
      return true;
    },
    [isStockAdmin, fetchMotivos]
  );

  const deleteMotivo = useCallback(
    async (id) => {
      if (!isStockAdmin) {
        alert('Sem permissão para esta ação');
        return false;
      }
      const { error: err } = await supabaseClient
        .from('motivos_devolucao')
        .delete()
        .eq('id', id);
      if (err) {
        console.error('Erro ao excluir motivo:', err);
        alert('Erro ao excluir motivo: ' + err.message);
        return false;
      }
      await fetchMotivos();
      return true;
    },
    [isStockAdmin, fetchMotivos]
  );

  const toggleAtivo = useCallback(
    (id, ativo) => updateMotivo(id, { ativo }),
    [updateMotivo]
  );

  /**
   * Reordenação com renumeração total: garante que após cada operação a
   * coluna `ordem` seja sempre contígua 1..N, sem colisões nem gaps. Caso
   * `novaOrdem` esteja fora de [1, N], clampa para a borda. Envia apenas
   * os UPDATEs estritamente necessários (rows cuja ordem efetivamente mudou).
   *
   * Decidido após CP2: comportamento anterior (UPDATE direto) permitia
   * duplicatas + tie-break não-determinístico (observado empiricamente).
   */
  const reorderMotivo = useCallback(
    async (id, novaOrdem) => {
      if (!isStockAdmin) {
        alert('Sem permissão para esta ação');
        return false;
      }
      const sorted = [...motivos].sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
      const target = sorted.find(m => m.id === id);
      if (!target) return false;
      const withoutTarget = sorted.filter(m => m.id !== id);
      const targetPos = Math.max(1, Math.min(parseInt(novaOrdem, 10) || 1, sorted.length));
      withoutTarget.splice(targetPos - 1, 0, target);
      const updates = withoutTarget
        .map((m, idx) => ({ id: m.id, newOrdem: idx + 1, oldOrdem: m.ordem }))
        .filter(u => u.newOrdem !== u.oldOrdem);
      if (updates.length === 0) return true;
      for (const u of updates) {
        const { error: err } = await supabaseClient
          .from('motivos_devolucao')
          .update({ ordem: u.newOrdem })
          .eq('id', u.id);
        if (err) {
          console.error('Erro ao reordenar motivos:', err);
          alert('Erro ao reordenar: ' + err.message);
          await fetchMotivos();
          return false;
        }
      }
      await fetchMotivos();
      return true;
    },
    [isStockAdmin, motivos, fetchMotivos]
  );

  // Conta quantas shippings (tipo='devolucao') usam o nome de um motivo.
  // Usado pelo modal antes de desativar/excluir para mostrar contagem.
  const countUsage = useCallback(async (nome) => {
    const { count, error: err } = await supabaseClient
      .from('shippings')
      .select('id', { count: 'exact', head: true })
      .eq('tipo', 'devolucao')
      .eq('motivo_devolucao', nome);
    if (err) {
      console.error('Erro ao contar uso do motivo:', err);
      return 0;
    }
    return count || 0;
  }, []);

  return {
    motivos,
    loading,
    error,
    refetch: fetchMotivos,
    addMotivo,
    updateMotivo,
    deleteMotivo,
    toggleAtivo,
    reorderMotivo,
    countUsage,
  };
}
