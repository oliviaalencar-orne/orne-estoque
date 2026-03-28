/**
 * devolucaoEntries.js — Auto-create stock entries when devoluções reach ENTREGUE
 *
 * Uses atomic UPDATE (entrada_criada=false guard) to prevent duplicates.
 */
import { supabaseClient } from '@/config/supabase';

/**
 * Creates stock entries for each product in a received devolução.
 *
 * @param {Object} shipping - The devolução shipping object (camelCase)
 * @param {Function} onAddEntry - addEntry from useEntries hook
 * @returns {Promise<{created: number, errors: number}>}
 */
export async function criarEntradasDevolucao(shipping, onAddEntry) {
  if (shipping.tipo !== 'devolucao') return { created: 0, errors: 0 };
  if (shipping.entradaCriada) return { created: 0, errors: 0 };
  if (shipping.status !== 'ENTREGUE') return { created: 0, errors: 0 };
  if (!shipping.produtos?.length) return { created: 0, errors: 0 };

  // Atomic guard — only proceed if we can flip entrada_criada
  const { data: updated, error: guardError } = await supabaseClient
    .from('shippings')
    .update({ entrada_criada: true })
    .eq('id', shipping.id)
    .eq('entrada_criada', false)
    .select('id')
    .maybeSingle();

  if (guardError || !updated) {
    // Another process already claimed this devolução
    return { created: 0, errors: 0 };
  }

  let created = 0;
  let skipped = 0;
  let errors = 0;
  const nfDev = `DEV-${shipping.nfNumero || ''}`;

  for (const prod of shipping.produtos) {
    const sku = prod.produtoEstoque?.sku || prod.sku;
    const quantidade = prod.quantidade;
    if (!sku || !quantidade) {
      errors++;
      continue;
    }

    // Check for existing entry with same SKU and NF (DEV-xxx or xxx)
    const { data: existing } = await supabaseClient
      .from('entries')
      .select('id')
      .eq('sku', sku)
      .or(`nf.eq.${nfDev},nf.eq.${shipping.nfNumero || ''}`)
      .limit(1);

    if (existing && existing.length > 0) {
      // Entrada já existe para este SKU/NF, pulando
      skipped++;
      continue;
    }

    // Verify SKU exists
    const { data: exists } = await supabaseClient
      .from('products')
      .select('sku')
      .eq('sku', sku)
      .maybeSingle();

    if (!exists) {
      console.warn(`[devolucao] SKU não encontrado: ${sku}`);
      errors++;
      continue;
    }

    try {
      await onAddEntry({
        type: 'DEVOLUCAO',
        sku,
        quantity: quantidade,
        supplier: shipping.cliente || '',
        nf: nfDev,
        localEntrada: shipping.hubDestino || '',
      });
      created++;
    } catch (err) {
      console.error(`[devolucao] Erro ao criar entrada para SKU ${sku}:`, err);
      errors++;
    }
  }

  return { created, skipped, errors };
}
