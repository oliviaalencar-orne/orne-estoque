/**
 * useSupabaseCollection.js — Generic Supabase fetch + realtime subscription with debounce
 *
 * Extracted from index-legacy.html L1828-1924
 *
 * NOTE: In the legacy code, setupSupabaseCollection and fetchAllRows are plain
 * functions (not hooks). We keep them as plain functions here for now so that
 * existing call sites can migrate 1:1. In a future phase they can be wrapped
 * into proper React hooks (useCollection, usePaginatedFetch).
 */
import { supabaseClient } from '@/config/supabase';

/**
 * Sets up an initial fetch + realtime subscription with debounced batching.
 *
 * @param {string} tableName - Supabase table name
 * @param {Function} setState - React setState function
 * @param {Object} options
 * @param {Function} [options.transform] - row → item mapper
 * @param {Function} [options.filter] - item → boolean filter
 * @param {Function} [options.onLoaded] - callback(items, rawData) after initial load
 * @param {string}   [options.selectFields] - Supabase select fields (default '*')
 * @param {Function} [options.dbFilter] - query → query filter applied to DB query
 * @returns {Object} Supabase channel (for cleanup)
 */
export function setupSupabaseCollection(tableName, setState, options = {}) {
  const { transform, filter, onLoaded, selectFields, dbFilter } = options;

  // Initial fetch with optional select fields and DB filters
  let query = supabaseClient.from(tableName).select(selectFields || '*');
  if (dbFilter) query = dbFilter(query);

  query.then(({ data, error }) => {
    if (error) {
      console.error('Erro ao buscar ' + tableName + ':', error);
      return;
    }
    const items = transform ? data.map(transform) : data;
    const filtered = filter ? items.filter(filter) : items;
    setState(filtered);
    if (onLoaded) onLoaded(filtered, data);
  });

  // Realtime with DEBOUNCE — accumulates changes and applies in batch
  let pendingChanges = [];
  let debounceTimer = null;

  const applyPendingChanges = () => {
    if (pendingChanges.length === 0) return;
    const changes = [...pendingChanges];
    pendingChanges = [];

    // Many changes (sync in progress) → full refetch
    if (changes.length > 20) {
      let refetchQuery = supabaseClient.from(tableName).select(selectFields || '*');
      if (dbFilter) refetchQuery = dbFilter(refetchQuery);
      refetchQuery.then(({ data }) => {
        if (!data) return;
        const items = transform ? data.map(transform) : data;
        const filtered = filter ? items.filter(filter) : items;
        setState(filtered);
      });
      return;
    }

    // Few changes: apply incrementally
    setState((prev) => {
      let updated = [...prev];
      for (const { eventType, newRec, oldRec } of changes) {
        if (eventType === 'INSERT') {
          const item = transform ? transform(newRec) : newRec;
          if (!filter || filter(item)) {
            if (!updated.find((i) => i.id === item.id)) updated.push(item);
          }
        } else if (eventType === 'UPDATE') {
          const item = transform ? transform(newRec) : newRec;
          const idx = updated.findIndex((i) => i.id === item.id);
          if (idx >= 0) updated[idx] = item;
          else if (!filter || filter(item)) updated.push(item);
        } else if (eventType === 'DELETE') {
          updated = updated.filter((i) => i.id !== (oldRec && oldRec.id));
        }
      }
      return updated;
    });
  };

  const channel = supabaseClient
    .channel(tableName + '-realtime')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: tableName },
      (payload) => {
        pendingChanges.push({
          eventType: payload.eventType,
          newRec: payload.new,
          oldRec: payload.old,
        });
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(applyPendingChanges, 500);
      }
    )
    .subscribe();

  return channel;
}

/**
 * Fetch ALL rows from a table (bypasses the 1000 row Supabase limit).
 *
 * @param {string} tableName
 * @param {string} selectFields - default '*'
 * @param {Array<Function>} filters - array of query => query functions
 * @returns {Promise<Array>}
 */
export async function fetchAllRows(tableName, selectFields = '*', filters = []) {
  const PAGE_SIZE = 1000;
  let allData = [];
  let from = 0;

  while (true) {
    let query = supabaseClient.from(tableName).select(selectFields);
    for (const f of filters) query = f(query);
    query = query.range(from, from + PAGE_SIZE - 1);

    const { data, error } = await query;
    if (error) {
      console.error(`Erro ao buscar ${tableName}:`, error);
      break;
    }
    if (!data || data.length === 0) break;

    allData = allData.concat(data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return allData;
}
