/**
 * useLocaisOrigem.js — Locais de Origem state + update
 *
 * Extracted from index-legacy.html App component:
 *   - State: L2346
 *   - Fetch + Realtime: L2495-2515
 *   - updateLocaisOrigem: L2836-2846
 */
import { useState, useCallback } from 'react';
import { supabaseClient } from '@/config/supabase';

const DEFAULT_LOCAIS = ['Loja Principal', 'Depósito 1', 'Depósito 2'];

/**
 * Hook for locais de origem state and update.
 *
 * @param {boolean} isStockAdmin - Permission flag
 * @returns {Object}
 */
export function useLocaisOrigem(isStockAdmin) {
  const [locaisOrigem, setLocaisOrigem] = useState(DEFAULT_LOCAIS);

  /**
   * Initialize locais — fetch from DB or insert defaults.
   * Returns a Supabase channel for cleanup.
   */
  const initLocais = useCallback(() => {
    supabaseClient
      .from('locais_origem')
      .select('name')
      .order('id')
      .then(({ data }) => {
        if (data && data.length > 0) {
          setLocaisOrigem(data.map((d) => d.name));
        } else {
          DEFAULT_LOCAIS.forEach((name) =>
            supabaseClient.from('locais_origem').insert({ name })
          );
          setLocaisOrigem(DEFAULT_LOCAIS);
        }
      });

    const channel = supabaseClient
      .channel('locais_origem-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'locais_origem' },
        () => {
          supabaseClient
            .from('locais_origem')
            .select('name')
            .order('id')
            .then(({ data }) => {
              if (data) setLocaisOrigem(data.map((d) => d.name));
            });
        }
      )
      .subscribe();

    return channel;
  }, []);

  const updateLocaisOrigem = useCallback(
    async (locais) => {
      if (!isStockAdmin) {
        alert('Sem permissão para esta ação');
        return;
      }
      const { error: delError } = await supabaseClient
        .from('locais_origem')
        .delete()
        .neq('id', 0);
      if (delError) {
        console.error('Erro ao limpar locais:', delError);
        alert('Erro ao atualizar locais: ' + delError.message);
        return;
      }
      if (locais.length > 0) {
        const { error: insError } = await supabaseClient
          .from('locais_origem')
          .insert(locais.map((name) => ({ name })));
        if (insError) {
          console.error('Erro ao inserir locais:', insError);
          alert('Erro ao salvar locais: ' + insError.message);
        }
      }
    },
    [isStockAdmin]
  );

  return {
    locaisOrigem,
    setLocaisOrigem,
    initLocais,
    updateLocaisOrigem,
  };
}
