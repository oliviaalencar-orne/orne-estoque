/**
 * useSeparations.js — Separations state + CRUD operations
 */
import { useState, useCallback } from 'react';
import { supabaseClient } from '@/config/supabase';
import { generateId } from '@/utils/helpers';

export function useSeparations(user, isStockAdmin, isOperador = false) {
  const canEditSeparation = isStockAdmin || isOperador;
  const [separations, setSeparations] = useState([]);

  const addSeparation = useCallback(
    async (separation) => {
      // Admin ou operador podem criar separações. Operador foi habilitado
      // em abril/2026 para suportar o fluxo Import XML (admin decision),
      // alinhando com a política já existente em updateSeparation.
      if (!canEditSeparation) {
        throw new Error('Sem permissão para esta ação');
      }
      const newSeparation = {
        id: separation.id || generateId(),
        nf_numero: separation.nfNumero || '',
        cliente: separation.cliente || '',
        destino: separation.destino || '',
        observacoes: separation.observacoes || '',
        transportadora: separation.transportadora || '',
        status: separation.status || 'pendente',
        produtos: separation.produtos || [],
        shipping_id: separation.shippingId || '',
        hub_id: separation.hubId || null,
        chave_acesso: separation.chaveAcesso || null,
        date: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_id: separation.userId || user?.email || '',
      };
      const { error } = await supabaseClient.from('separations').upsert(newSeparation);
      if (error) {
        console.error('Erro ao criar separação:', error);
        throw new Error('Erro ao criar separação: ' + error.message);
      }
      // Optimistic local state update (don't wait for realtime)
      const created = {
        ...separation,
        id: newSeparation.id,
        date: newSeparation.date,
        updatedAt: newSeparation.updated_at,
        userId: newSeparation.user_id,
        status: newSeparation.status,
        hubId: newSeparation.hub_id || '',
        chaveAcesso: newSeparation.chave_acesso || null,
      };
      setSeparations(prev => {
        if (prev.find(s => s.id === created.id)) return prev;
        return [...prev, created];
      });
      return created;
    },
    [user, canEditSeparation]
  );

  const updateSeparation = useCallback(
    async (separationId, data) => {
      if (!canEditSeparation) {
        alert('Sem permissão para esta ação');
        return;
      }
      // Optimistic local state update
      setSeparations(prev => prev.map(s =>
        s.id === separationId ? { ...s, ...data, updatedAt: new Date().toISOString() } : s
      ));
      const mapped = { updated_at: new Date().toISOString() };
      if (data.nfNumero !== undefined) mapped.nf_numero = data.nfNumero;
      if (data.cliente !== undefined) mapped.cliente = data.cliente;
      if (data.destino !== undefined) mapped.destino = data.destino;
      if (data.observacoes !== undefined) mapped.observacoes = data.observacoes;
      if (data.transportadora !== undefined) mapped.transportadora = data.transportadora;
      if (data.status !== undefined) mapped.status = data.status;
      if (data.produtos !== undefined) mapped.produtos = data.produtos;
      if (data.shippingId !== undefined) mapped.shipping_id = data.shippingId;
      if (data.hubId !== undefined) mapped.hub_id = data.hubId;
      const { error } = await supabaseClient
        .from('separations')
        .update(mapped)
        .eq('id', separationId);
      if (error) {
        console.error('Erro ao atualizar separação:', error);
        alert('Erro ao atualizar separação: ' + error.message);
      }
    },
    [canEditSeparation]
  );

  const deleteSeparation = useCallback(
    async (separationId) => {
      if (!isStockAdmin) {
        alert('Sem permissão para esta ação');
        return;
      }
      // Optimistic local state update — remove immediately from UI
      setSeparations(prev => prev.filter(s => s.id !== separationId));
      const { error } = await supabaseClient.from('separations').delete().eq('id', separationId);
      if (error) {
        console.error('Erro ao excluir separação:', error);
        alert('Erro ao excluir separação: ' + error.message);
        // Realtime will re-sync if needed, but the row is likely gone from DB anyway
      }
    },
    [isStockAdmin]
  );

  return {
    separations,
    setSeparations,
    addSeparation,
    updateSeparation,
    deleteSeparation,
  };
}
