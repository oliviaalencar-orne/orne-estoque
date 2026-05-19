/**
 * useHubAliases.js — Hub aliases state + CRUD (Sub-frente 3.0b)
 *
 * Padrão B (one-shot + refetch pós-mutation), consistente com
 * useMotivosDevolucao (3.0a). Admin único editor, modal raramente aberto,
 * tabela muda raramente — WS sempre aberto seria custo sem benefício.
 *
 * Aliases mapeiam nomes antigos (ex: "G+SHIP RJ") para o nome canônico
 * atual em `hubs` (ex: "HUB RJ"). Usado pelo resolver em
 * `src/utils/hubAliasResolver.js` ao criar devolução.
 */
import { useState, useCallback, useEffect } from 'react';
import { supabaseClient } from '@/config/supabase';

export function useHubAliases(isStockAdmin) {
  const [aliases, setAliases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAliases = useCallback(async () => {
    const { data, error: err } = await supabaseClient
      .from('hub_aliases')
      .select('*')
      .order('name_alias', { ascending: true });
    if (err) {
      console.error('Erro ao buscar hub_aliases:', err);
      setError(err);
    } else {
      setAliases(data || []);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAliases();
  }, [fetchAliases]);

  const addAlias = useCallback(
    async (nameAlias, nameCanonical) => {
      if (!isStockAdmin) {
        alert('Sem permissão para esta ação');
        return null;
      }
      const aliasTrim = (nameAlias || '').trim();
      const canonicalTrim = (nameCanonical || '').trim();
      if (!aliasTrim || !canonicalTrim) return null;
      const { data, error: err } = await supabaseClient
        .from('hub_aliases')
        .insert({ name_alias: aliasTrim, name_canonical: canonicalTrim })
        .select()
        .single();
      if (err) {
        console.error('Erro ao criar alias:', err);
        alert('Erro ao criar alias: ' + err.message);
        return null;
      }
      await fetchAliases();
      return data;
    },
    [isStockAdmin, fetchAliases]
  );

  // Atualiza apenas o `name_canonical` — o `name_alias` é PK e não muda
  // (se admin quiser renomear o alias, deleta e cria de novo).
  const updateAlias = useCallback(
    async (nameAlias, nameCanonical) => {
      if (!isStockAdmin) {
        alert('Sem permissão para esta ação');
        return false;
      }
      const canonicalTrim = (nameCanonical || '').trim();
      if (!canonicalTrim) return false;
      const { error: err } = await supabaseClient
        .from('hub_aliases')
        .update({ name_canonical: canonicalTrim })
        .eq('name_alias', nameAlias);
      if (err) {
        console.error('Erro ao atualizar alias:', err);
        alert('Erro ao atualizar alias: ' + err.message);
        return false;
      }
      await fetchAliases();
      return true;
    },
    [isStockAdmin, fetchAliases]
  );

  const deleteAlias = useCallback(
    async (nameAlias) => {
      if (!isStockAdmin) {
        alert('Sem permissão para esta ação');
        return false;
      }
      const { error: err } = await supabaseClient
        .from('hub_aliases')
        .delete()
        .eq('name_alias', nameAlias);
      if (err) {
        console.error('Erro ao excluir alias:', err);
        alert('Erro ao excluir alias: ' + err.message);
        return false;
      }
      await fetchAliases();
      return true;
    },
    [isStockAdmin, fetchAliases]
  );

  return {
    aliases,
    loading,
    error,
    refetch: fetchAliases,
    addAlias,
    updateAlias,
    deleteAlias,
  };
}
