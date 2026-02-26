/**
 * useShippings.js — Shippings state + CRUD operations
 *
 * Extracted from index-legacy.html App component:
 *   - State: L2345
 *   - addShipping: L2787-2808
 *   - updateShipping: L2810-2828
 *   - deleteShipping: L2830-2834
 */
import { useState, useCallback } from 'react';
import { supabaseClient } from '@/config/supabase';
import { generateId } from '@/utils/helpers';

/**
 * Hook for shippings state and CRUD.
 *
 * @param {Object|null} user - Current auth user
 * @param {boolean} isStockAdmin - Permission flag
 * @returns {Object}
 */
export function useShippings(user, isStockAdmin) {
  const [shippings, setShippings] = useState([]);

  const addShipping = useCallback(
    async (shipping) => {
      if (!isStockAdmin) {
        alert('Sem permissão para esta ação');
        return;
      }
      const newShipping = {
        id: shipping.id || generateId(),
        nf_numero: shipping.nfNumero || '',
        cliente: shipping.cliente || '',
        destino: shipping.destino || '',
        local_origem: shipping.localOrigem || '',
        transportadora: shipping.transportadora || '',
        codigo_rastreio: shipping.codigoRastreio || '',
        link_rastreio: shipping.linkRastreio || '',
        melhor_envio_id: shipping.melhorEnvioId || '',
        produtos: shipping.produtos || [],
        observacoes: shipping.observacoes || '',
        status: shipping.status || 'PENDENTE',
        date: new Date().toISOString(),
        user_id: user.email,
      };
      const { error } = await supabaseClient.from('shippings').upsert(newShipping);
      if (error) {
        console.error('Erro ao criar despacho:', error);
        alert('Erro ao criar despacho: ' + error.message);
        return;
      }
      return {
        ...shipping,
        id: newShipping.id,
        date: newShipping.date,
        userId: user.email,
        status: newShipping.status,
      };
    },
    [user, isStockAdmin]
  );

  const updateShipping = useCallback(
    async (shippingId, data) => {
      if (!isStockAdmin) {
        alert('Sem permissão para esta ação');
        return;
      }
      const mapped = {};
      if (data.nfNumero !== undefined) mapped.nf_numero = data.nfNumero;
      if (data.cliente !== undefined) mapped.cliente = data.cliente;
      if (data.destino !== undefined) mapped.destino = data.destino;
      if (data.localOrigem !== undefined) mapped.local_origem = data.localOrigem;
      if (data.transportadora !== undefined) mapped.transportadora = data.transportadora;
      if (data.codigoRastreio !== undefined) mapped.codigo_rastreio = data.codigoRastreio;
      if (data.linkRastreio !== undefined) mapped.link_rastreio = data.linkRastreio;
      if (data.melhorEnvioId !== undefined) mapped.melhor_envio_id = data.melhorEnvioId;
      if (data.produtos !== undefined) mapped.produtos = data.produtos;
      if (data.observacoes !== undefined) mapped.observacoes = data.observacoes;
      if (data.status !== undefined) mapped.status = data.status;
      if (data.ultimaAtualizacaoRastreio !== undefined)
        mapped.ultima_atualizacao_rastreio = data.ultimaAtualizacaoRastreio;
      if (data.rastreioInfo !== undefined) mapped.rastreio_info = data.rastreioInfo;
      const { error } = await supabaseClient
        .from('shippings')
        .update(mapped)
        .eq('id', shippingId);
      if (error) {
        console.error('Erro ao atualizar despacho:', error);
        alert('Erro ao atualizar despacho: ' + error.message);
      }
    },
    [isStockAdmin]
  );

  const deleteShipping = useCallback(
    async (shippingId) => {
      if (!isStockAdmin) {
        alert('Sem permissão para esta ação');
        return;
      }
      const { error } = await supabaseClient.from('shippings').delete().eq('id', shippingId);
      if (error) {
        console.error('Erro ao excluir despacho:', error);
        alert('Erro ao excluir despacho: ' + error.message);
      }
    },
    [isStockAdmin]
  );

  return {
    shippings,
    setShippings,
    addShipping,
    updateShipping,
    deleteShipping,
  };
}
