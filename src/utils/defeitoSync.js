/**
 * defeitoSync.js — sincronizacao do estado de defeito entre entries e products
 *
 * Fonte da verdade: entries.defeito (boolean) + entries.defeito_descricao (text)
 *
 * products.defeito (boolean)         = flag resumo (OR de todas as entries do SKU)
 * products.defeitos_por_nf (jsonb)   = [{nf, descricao, entry_id}, ...] derivado
 * products.defeito_data (timestamp)  = setado quando passa a true pela primeira vez
 * products.defeito_descricao (text)  = mantido por compatibilidade (= 1a descricao)
 */
import { supabaseClient } from '@/config/supabase';

/**
 * Recalcula products.defeito e products.defeitos_por_nf a partir das entries do SKU.
 *
 * @param {string} sku
 * @returns {Promise<{ defeito: boolean, defeitosPorNf: Array, defeitoData: string|null, defeitoDescricao: string }>}
 *          Valores atualizados — podem ser aplicados ao state local via setProducts.
 */
export async function syncProductDefeito(sku) {
  if (!sku) return { defeito: false, defeitosPorNf: [], defeitoData: null, defeitoDescricao: '' };

  // 1. Busca entries defeituosas do SKU (fonte da verdade)
  const { data: defectiveEntries, error: entriesErr } = await supabaseClient
    .from('entries')
    .select('id, nf, defeito_descricao, date')
    .eq('sku', sku)
    .eq('defeito', true)
    .order('date', { ascending: false });

  if (entriesErr) {
    console.error('[defeitoSync] erro ao buscar entries defeituosas:', entriesErr);
    throw entriesErr;
  }

  const defeitosPorNf = (defectiveEntries || []).map((e) => ({
    nf: e.nf || '',
    descricao: e.defeito_descricao || '',
    entry_id: e.id,
  }));

  const defeito = defeitosPorNf.length > 0;

  // 2. Busca estado atual para decidir sobre defeito_data
  const { data: current, error: currentErr } = await supabaseClient
    .from('products')
    .select('defeito, defeito_data')
    .eq('sku', sku)
    .maybeSingle();

  if (currentErr) {
    console.error('[defeitoSync] erro ao buscar product:', currentErr);
    throw currentErr;
  }

  // 3. Monta payload
  const updatePayload = {
    defeito,
    defeitos_por_nf: defeitosPorNf,
  };

  let defeitoData = current?.defeito_data || null;
  let defeitoDescricao = '';

  if (defeito) {
    // Passou a (ou continua) ter defeito
    if (!current?.defeito) {
      defeitoData = new Date().toISOString();
      updatePayload.defeito_data = defeitoData;
    }
    defeitoDescricao = defeitosPorNf[0].descricao || '';
    updatePayload.defeito_descricao = defeitoDescricao;
  } else {
    // Nao ha mais defeitos
    defeitoData = null;
    defeitoDescricao = '';
    updatePayload.defeito_data = null;
    updatePayload.defeito_descricao = '';
  }

  const { error: updateErr } = await supabaseClient
    .from('products')
    .update(updatePayload)
    .eq('sku', sku);

  if (updateErr) {
    console.error('[defeitoSync] erro ao atualizar product:', updateErr);
    throw updateErr;
  }

  return { defeito, defeitosPorNf, defeitoData, defeitoDescricao };
}

/**
 * Atualiza TODAS as entries de um SKU com o mesmo estado de defeito.
 * Util para o fluxo do edit modal quando o usuario marca/desmarca
 * o flag de defeito no nivel do produto (bulk).
 *
 * @param {string} sku
 * @param {boolean} defeito
 * @param {string} descricao
 */
export async function setDefeitoForAllEntries(sku, defeito, descricao = '') {
  if (!sku) return;
  const { error } = await supabaseClient
    .from('entries')
    .update({
      defeito: !!defeito,
      defeito_descricao: defeito ? (descricao || '') : '',
    })
    .eq('sku', sku);
  if (error) {
    console.error('[defeitoSync] erro ao atualizar entries bulk:', error);
    throw error;
  }
}

/**
 * Atualiza entries de uma NF especifica (todas as entries que compartilham sku+nf).
 *
 * @param {string} sku
 * @param {string} nf
 * @param {boolean} defeito
 * @param {string} descricao
 */
export async function setDefeitoForNf(sku, nf, defeito, descricao = '') {
  if (!sku) return;
  const query = supabaseClient
    .from('entries')
    .update({
      defeito: !!defeito,
      defeito_descricao: defeito ? (descricao || '') : '',
    })
    .eq('sku', sku);
  // Tratamento de NF vazia/null
  if (nf && nf.trim() !== '') {
    query.eq('nf', nf);
  } else {
    query.or('nf.is.null,nf.eq.');
  }
  const { error } = await query;
  if (error) {
    console.error('[defeitoSync] erro ao atualizar entries por NF:', error);
    throw error;
  }
}
