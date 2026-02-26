/**
 * formatters.js — Currency formatting helpers (BRL)
 *
 * Extracted from index-legacy.html L1803-1804
 */

export const formatBRL = (value) =>
  Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const parseBRL = (str) =>
  parseFloat((str || '0').replace(/\./g, '').replace(',', '.')) || 0;
