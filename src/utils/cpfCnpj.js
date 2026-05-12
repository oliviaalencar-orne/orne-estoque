/**
 * cpfCnpj.js — Normalização de CPF/CNPJ do destinatário.
 *
 * Frente 8.9 — habilita uso do campo `document` searchable do Melhor Envio
 * como termo de busca em buscarPorNF (Estratégia 5) para NFs curtas que a API
 * ME rejeita no parâmetro q= (heurística #16: < 4 chars).
 *
 * PII — nunca logar o valor retornado; usar apenas como termo de busca ou
 * persistir em coluna marcada como sensível.
 */

/**
 * Normaliza um CPF ou CNPJ para apenas dígitos.
 *
 * @param {string|number|null|undefined} input — valor bruto (pode vir formatado)
 * @returns {string|null} string com 11 (CPF) ou 14 (CNPJ) dígitos, ou null se
 *   o input estiver ausente, vazio, ou tiver tamanho diferente após strip.
 */
export function normalizeCpfCnpj(input) {
  if (input == null) return null;
  const digits = String(input).replace(/\D/g, '');
  if (digits.length === 11 || digits.length === 14) return digits;
  return null;
}
