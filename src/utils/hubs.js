/**
 * hubs.js — Normalização de nomes de HUB para exibição
 *
 * Converte qualquer variação legada ("HUB VG", "Vila Guilherme",
 * "Loja Principal" etc.) para o padrão visual G+SHIP VG/CWB/RJ.
 *
 * Os valores em banco de dados podem variar livremente — esta normalização
 * é aplicada apenas em tempo de exibição. Novos registros devem usar os
 * nomes canônicos.
 */

const HUB_MAP = [
  { canonical: 'G+SHIP VG',  match: ['g+ship vg', 'gship vg', 'hub vg', 'vila guilherme', 'vg (vila guilherme - sp)', 'vg', 'loja principal'] },
  { canonical: 'G+SHIP CWB', match: ['g+ship cwb', 'gship cwb', 'hub cwb', 'curitiba', 'cwb (curitiba)', 'cwb'] },
  { canonical: 'G+SHIP RJ',  match: ['g+ship rj', 'gship rj', 'hub rj', 'rio de janeiro', 'rj (rio de janeiro)', 'rj'] },
];

/**
 * Normaliza um nome de HUB para exibição.
 *
 * @param {string} rawName - valor bruto (pode ser "HUB VG", "Loja Principal" etc.)
 * @returns {string} nome canônico (G+SHIP VG/CWB/RJ) ou o original se não reconhecido
 */
export function formatHubName(rawName) {
  if (!rawName) return '';
  const lower = String(rawName).trim().toLowerCase();
  for (const h of HUB_MAP) {
    if (h.match.includes(lower)) return h.canonical;
  }
  return rawName;
}

/**
 * Retorna a sigla curta do HUB (VG/CWB/RJ) para chips compactos.
 *
 * @param {string} rawName
 * @returns {string} sigla ou o próprio nome original se não reconhecido
 */
export function hubShortCode(rawName) {
  const canonical = formatHubName(rawName);
  if (canonical === 'G+SHIP VG') return 'VG';
  if (canonical === 'G+SHIP CWB') return 'CWB';
  if (canonical === 'G+SHIP RJ') return 'RJ';
  return rawName || '';
}

/**
 * Cor distinta por HUB, derivada da paleta do sistema.
 * Reserva-se #39845f para "Entrega Local"; HUBs usam azul / roxo / índigo.
 *
 * @param {string} rawName
 * @returns {{color: string, bg: string}} cor para texto e fundo (20% opacity)
 */
export function hubColor(rawName) {
  const canonical = formatHubName(rawName);
  const MAP = {
    'G+SHIP VG':  { color: '#8c52ff', bg: 'rgba(140,82,255,0.20)' }, // roxo
    'G+SHIP CWB': { color: '#004aad', bg: 'rgba(0,74,173,0.20)'  }, // azul
    'G+SHIP RJ':  { color: '#1800ad', bg: 'rgba(24,0,173,0.18)'  }, // índigo
  };
  return MAP[canonical] || { color: '#6B7280', bg: 'rgba(180,180,180,0.25)' };
}

/**
 * Default HUB usado em novos registros.
 */
export const DEFAULT_HUB_NAME = 'G+SHIP VG';

/**
 * Lista padrão de HUBs usada como fallback quando a coleção do usuário
 * está vazia. Mantém paridade com os 3 HUBs canônicos.
 */
export const DEFAULT_HUBS = ['G+SHIP VG', 'G+SHIP CWB', 'G+SHIP RJ'];
