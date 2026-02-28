/**
 * useSeparations.js — Separations state + CRUD operations
 */
import { useState, useCallback } from 'react';
import { supabaseClient } from '@/config/supabase';
import { generateId } from '@/utils/helpers';

export function useSeparations(user, isStockAdmin) {
  const [separations, setSeparations] = useState([]);

  const addSeparation = useCallback(
    async (separation) => {
      if (!isStockAdmin) {
        alert('Sem permissão para esta ação');
        return;
      }
      const newSeparation = {
        id: separation.id || generateId(),
        nf_numero: separation.nfNumero || '',
        cliente: separation.cliente || '',
        destino: separation.destino || '',
        observacoes: separation.observacoes || '',
        status: separation.status || 'pendente',
        produtos: separation.produtos || [],
        shipping_id: separation.shippingId || '',
        date: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_id: separation.userId || user?.email || '',
      };
      const { error } = await supabaseClient.from('separations').upsert(newSeparation);
      if (error) {
        console.error('Erro ao criar separação:', error);
        alert('Erro ao criar separação: ' + error.message);
        return;
      }
      return {
        ...separation,
        id: newSeparation.id,
        date: newSeparation.date,
        updatedAt: newSeparation.updated_at,
        userId: newSeparation.user_id,
        status: newSeparation.status,
      };
    },
    [user, isStockAdmin]
  );

  const updateSeparation = useCallback(
    async (separationId, data) => {
      if (!isStockAdmin) {
        alert('Sem permissão para esta ação');
        return;
      }
      const mapped = { updated_at: new Date().toISOString() };
      if (data.nfNumero !== undefined) mapped.nf_numero = data.nfNumero;
      if (data.cliente !== undefined) mapped.cliente = data.cliente;
      if (data.destino !== undefined) mapped.destino = data.destino;
      if (data.observacoes !== undefined) mapped.observacoes = data.observacoes;
      if (data.status !== undefined) mapped.status = data.status;
      if (data.produtos !== undefined) mapped.produtos = data.produtos;
      if (data.shippingId !== undefined) mapped.shipping_id = data.shippingId;
      const { error } = await supabaseClient
        .from('separations')
        .update(mapped)
        .eq('id', separationId);
      if (error) {
        console.error('Erro ao atualizar separação:', error);
        alert('Erro ao atualizar separação: ' + error.message);
      }
    },
    [isStockAdmin]
  );

  const deleteSeparation = useCallback(
    async (separationId) => {
      if (!isStockAdmin) {
        alert('Sem permissão para esta ação');
        return;
      }
      const { error } = await supabaseClient.from('separations').delete().eq('id', separationId);
      if (error) {
        console.error('Erro ao excluir separação:', error);
        alert('Erro ao excluir separação: ' + error.message);
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
