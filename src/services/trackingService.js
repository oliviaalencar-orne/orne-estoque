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
 * Excludes ENTREGUE, CANCELADO, DEVOLVIDO statuses.
 *
 * @param {Array} shippings - Array of shipping objects
 * @returns {Array} Filtered shippings that have tracking identifiers
 */
export function getPendingTrackingShippings(shippings) {
  return shippings.filter(s =>
    s.status !== 'ENTREGUE' &&
    s.status !== 'CANCELADO' &&
    s.status !== 'DEVOLVIDO' &&
    (s.melhorEnvioId || s.codigoRastreio)
  );
}
