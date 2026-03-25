/**
 * trackingService.js — Shipping tracking service
 *
 * Real implementation extracted from ShippingManager (L6244-6340).
 * Calls the 'rastrear-envio' Edge Function for Melhor Envio tracking.
 */
import { SUPABASE_URL, supabaseClient } from '@/config/supabase';

const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

/**
 * Fetch tracking info for a single shipping via Melhor Envio.
 * Uses either melhorEnvioId (label ID) or codigoRastreio (tracking code).
 *
 * @param {Object} shipping - Shipping object with melhorEnvioId and/or codigoRastreio
 * @returns {Promise<Object|null>} Tracking info object { status, codigoRastreio, ... } or null
 */
export async function fetchTrackingInfo(shipping) {
  if (!shipping.melhorEnvioId && !shipping.codigoRastreio) {
    throw new Error('Informe o ID da etiqueta ou codigo de rastreio');
  }

  const { data: { session } } = await supabaseClient.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Sessao expirada. Faca login novamente.');

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  let response;
  if (shipping.melhorEnvioId) {
    // Rastrear pelo ID da etiqueta
    response = await fetch(`${FUNCTIONS_URL}/rastrear-envio`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ orderIds: [shipping.melhorEnvioId] }),
    });
  } else {
    // Rastrear pelo codigo de rastreio
    response = await fetch(`${FUNCTIONS_URL}/rastrear-envio`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ codigosRastreio: [shipping.codigoRastreio] }),
    });
  }

  const result = await response.json();

  if (result.success && result.data) {
    const key = shipping.melhorEnvioId || shipping.codigoRastreio;
    const info = result.data[key];

    if (info?.erro) {
      throw new Error(info.erro);
    }

    return info || null;
  }

  if (result.error) {
    throw new Error(result.error);
  }

  return null;
}

/**
 * Update tracking for a single shipping record.
 * Calls the Edge Function and returns the update payload.
 *
 * @param {Object} shipping - Shipping object
 * @returns {Promise<Object|null>} Update payload { status, codigoRastreio, ultimaAtualizacaoRastreio, rastreioInfo } or null
 */
export async function getTrackingUpdate(shipping) {
  const info = await fetchTrackingInfo(shipping);

  if (info && info.status) {
    return {
      status: info.status,
      codigoRastreio: info.codigoRastreio || shipping.codigoRastreio,
      ultimaAtualizacaoRastreio: new Date().toISOString(),
      rastreioInfo: info,
    };
  }

  return null;
}

/**
 * Filter shippings that are pending tracking updates.
 * Excludes ENTREGUE and DEVOLVIDO (final statuses).
 *
 * @param {Array} shippings - Array of shipping objects
 * @returns {Array} Filtered shippings that have tracking identifiers
 */
export function getPendingTrackingShippings(shippings) {
  return shippings.filter(s =>
    s.status !== 'ENTREGUE' &&
    s.status !== 'DEVOLVIDO' &&
    (s.melhorEnvioId || s.codigoRastreio)
  );
}

/**
 * Search Melhor Envio for tracking data by NF number.
 * Calls the Edge Function with { buscarPorNF: [nfNumero], clientes: { nf: nome } }.
 * The Edge Function uses the client name as fallback search when NF number yields no results.
 * The Edge Function also auto-saves found data to DB.
 *
 * @param {string} nfNumero - Invoice number to search
 * @param {string} [clienteNome] - Client name for fallback search
 * @returns {Promise<Object|null>} Result { encontrado, melhor_envio_id, codigo_rastreio, debug, ... } or null
 */
export async function buscarRastreioPorNF(nfNumero, clienteNome) {
  if (!nfNumero) return null;

  const { data: { session } } = await supabaseClient.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Sessao expirada. Faca login novamente.');

  const payload = { buscarPorNF: [nfNumero] };
  if (clienteNome) {
    payload.clientes = { [nfNumero]: clienteNome };
  }

  const response = await fetch(`${FUNCTIONS_URL}/rastrear-envio`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json();

  if (result.success && result.data) {
    const info = result.data[nfNumero];
    return info || null;
  }

  if (result.error) {
    throw new Error(result.error);
  }

  return null;
}

/**
 * Search Melhor Envio for tracking data by multiple NF numbers (batch).
 * Sends batches of up to batchSize NFs at a time with delay between batches.
 * The Edge Function auto-saves found data (melhor_envio_id, codigo_rastreio, etc.) to DB.
 *
 * @param {Array<{id, nfNumero, cliente}>} pendentes - Shippings to search
 * @param {Object} opts - Options
 * @param {number} [opts.batchSize=5] - NFs per batch
 * @param {number} [opts.delayMs=3000] - Delay between batches in ms
 * @param {function} [opts.onProgress] - Callback({ current, total, vinculados, naoEncontrados, erros, nfAtual })
 * @param {function} [opts.shouldCancel] - Returns true to abort
 * @returns {Promise<{vinculados, naoEncontrados, erros}>}
 */
export async function buscarRastreiosLoteME(pendentes, { batchSize = 5, delayMs = 3000, onProgress, shouldCancel } = {}) {
  const { data: { session } } = await supabaseClient.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Sessao expirada. Faca login novamente.');

  let vinculados = 0, naoEncontrados = 0, erros = 0;

  for (let i = 0; i < pendentes.length; i += batchSize) {
    if (shouldCancel?.()) break;

    const batch = pendentes.slice(i, i + batchSize);
    const nfs = batch.map(s => s.nfNumero);
    const clientes = {};
    batch.forEach(s => { clientes[s.nfNumero] = s.cliente; });

    const nfAtual = nfs[0];

    try {
      const response = await fetch(`${FUNCTIONS_URL}/rastrear-envio`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ buscarPorNF: nfs, clientes }),
      });

      const result = await response.json();

      if (result.success && result.data) {
        for (const nf of nfs) {
          const info = result.data[nf];
          if (info?.encontrado) {
            vinculados++;
          } else {
            naoEncontrados++;
          }
        }
      } else {
        erros += batch.length;
      }
    } catch (err) {
      console.error('[ME-lote] Erro no batch:', err);
      erros += batch.length;
    }

    onProgress?.({
      current: Math.min(i + batchSize, pendentes.length),
      total: pendentes.length,
      vinculados,
      naoEncontrados,
      erros,
      nfAtual,
    });

    if (i + batchSize < pendentes.length && !shouldCancel?.()) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  return { vinculados, naoEncontrados, erros };
}
