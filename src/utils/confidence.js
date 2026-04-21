/**
 * confidence.js — Classificação de "Confiança de Rastreio" (Fase 1).
 *
 * Avalia quão confiável está o status de um despacho comparando o
 * tempo desde a última movimentação com thresholds por transportadora.
 * NÃO auto-conclui nada — apenas sinaliza o que precisa de verificação
 * manual pelo time de expedição.
 *
 * Níveis:
 *   🟢 OK       — movimento recente ou verificação manual recente
 *   🟡 ATENCAO  — alguns dias sem movimento (configurável por transportadora)
 *   🔴 URGENTE  — muitos dias sem movimento, precisa verificar agora
 *   ⚪ NA       — não-aplicável (status terminal, devolução, entrega local, etc.)
 *
 * Fonte de data (fallback hierárquico):
 *   1. rastreioInfo.dataUltimoEvento — timestamp do último evento da transportadora
 *   2. date — timestamp do despacho inicial
 *   (Nota: NÃO usamos ultimaAtualizacaoRastreio como fallback — ele é
 *    "quando perguntamos à API", não "quando a carga mexeu". Usá-lo
 *    mascaria envios travados.)
 *
 * Cache: memoização in-memory (1 min TTL) por shipping.id, invalidada
 * quando qualquer campo relevante muda (status, data de evento,
 * verificacaoManual). Evita recalcular 200+ linhas a cada re-render.
 */

import { diffBusinessDays } from './businessDays.js';
import { classificarTransporte } from './transportadora.js';

export const CONFIANCA_NIVEIS = Object.freeze({
  OK: 'ok',
  ATENCAO: 'atencao',
  URGENTE: 'urgente',
  NA: 'na',
});

const LABELS = {
  ok: 'No prazo',
  atencao: 'Atenção',
  urgente: 'Verificar',
  na: 'Sem avaliação',
};

const EMOJIS = {
  ok: '🟢',
  atencao: '🟡',
  urgente: '🔴',
  na: '⚪',
};

// Paleta Orne (20% opacity para fundos).
const COLORS = {
  ok: { fg: '#39845f', bg: 'rgba(57, 132, 95, 0.2)' },
  atencao: { fg: '#c0912f', bg: 'rgba(192, 145, 47, 0.2)' },
  urgente: { fg: '#893030', bg: 'rgba(137, 48, 48, 0.2)' },
  na: { fg: '#6b6b6b', bg: 'rgba(180, 180, 180, 0.2)' },
};

// Status que não precisam de avaliação.
const TERMINAL_STATUSES = new Set(['ENTREGUE', 'DEVOLVIDO']);
const PRE_DISPATCH_STATUSES = new Set(['AGUARDANDO_COLETA']);

/**
 * Thresholds por transportadora (dias úteis sem movimento).
 *   < ok       → 🟢
 *   [ok, atencao) → 🟡
 *   >= atencao → 🔴
 *
 * Loggi tende a travar cedo (3-7 dias = risco médio; 7+ = perdido).
 * Correios costuma ter lacunas longas legítimas; só vira 🔴 em 10+.
 */
function thresholdsFor(transporte) {
  switch (transporte) {
    case 'loggi':
      return { ok: 3, atencao: 7 };
    case 'correios':
      return { ok: 3, atencao: 10 };
    case 'outras':
    case 'sem_transporte':
    default:
      return { ok: 3, atencao: 10 };
  }
}

// ---- Memoização -----------------------------------------------------------

const _cache = new Map();
const CACHE_TTL_MS = 60_000;

function cacheKey(shipping) {
  const v = shipping.verificacaoManual;
  const vkey = v ? `${v.decisao || ''}|${v.data || ''}` : '';
  const rastreioData = shipping.rastreioInfo?.dataUltimoEvento || '';
  return `${shipping.status || ''}|${shipping.date || ''}|${rastreioData}|${shipping.transportadora || ''}|${shipping.codigoRastreio || ''}|${shipping.entregaLocal ? 1 : 0}|${shipping.tipo || ''}|${vkey}`;
}

export function clearConfidenceCache() {
  _cache.clear();
}

// ---- Classificação principal ----------------------------------------------

/**
 * @typedef {Object} ConfidenceResult
 * @property {'ok'|'atencao'|'urgente'|'na'} nivel
 * @property {string} label               - Legenda curta (pt-BR)
 * @property {string} emoji               - Emoji unicode (🟢🟡🔴⚪)
 * @property {{fg:string, bg:string}} color - Cores da paleta Orne
 * @property {string} motivo              - Texto explicando o nível (tooltip)
 * @property {string|null} transporte     - 'loggi' | 'correios' | 'outras' | 'local' | null
 * @property {number|null} diasUteisSemMov - Dias úteis desde última movimentação (null se N/A)
 * @property {Date|null} dataReferencia   - Data usada como "última movimentação"
 * @property {boolean} temDataUltimoEvento - true = rastreioInfo.dataUltimoEvento populada
 */

/**
 * Classifica a confiança de rastreio de um despacho.
 *
 * @param {Object} shipping - Shipping object (camelCase)
 * @param {Date} [now] - Referência temporal (injetável p/ testes). Omita em produção p/ usar cache.
 * @returns {ConfidenceResult}
 */
export function classifyConfidence(shipping, now) {
  if (!shipping || typeof shipping !== 'object') {
    return buildResult('na', 'Dados ausentes');
  }

  // Só usa cache quando `now` é default (produção). Testes injetam `now`
  // explicitamente e pulam o cache.
  const useCache = now === undefined && shipping.id != null;
  if (useCache) {
    const entry = _cache.get(shipping.id);
    const key = cacheKey(shipping);
    if (entry && entry.key === key && Date.now() - entry.ts < CACHE_TTL_MS) {
      return entry.result;
    }
    const result = _compute(shipping, new Date());
    _cache.set(shipping.id, { key, result, ts: Date.now() });
    return result;
  }
  return _compute(shipping, now || new Date());
}

function _compute(shipping, now) {
  const status = shipping.status || '';
  const transporte = classificarTransporte(shipping);

  // ⚪ Casos não-aplicáveis --------------------------------------------------
  if (TERMINAL_STATUSES.has(status)) {
    return buildResult('na', 'Status terminal', { transporte });
  }
  if (PRE_DISPATCH_STATUSES.has(status)) {
    return buildResult('na', 'Aguardando coleta (problema interno, não de rastreio)', { transporte });
  }
  if (shipping.tipo === 'devolucao') {
    return buildResult('na', 'Fluxo de devolução — acompanhar separadamente', { transporte });
  }
  if (shipping.entregaLocal === true || transporte === 'local') {
    return buildResult('na', 'Entrega local — usa comprovante, não rastreio', { transporte });
  }
  if (!shipping.date) {
    return buildResult('na', 'Sem data de despacho', { transporte });
  }

  // 🟢 Verificação manual recente -------------------------------------------
  const v = shipping.verificacaoManual;
  if (v && v.decisao === 'confirmado_entregue') {
    return buildResult('na', 'Confirmado entregue manualmente', { transporte });
  }
  if (v && v.decisao === 'ainda_em_transito' && v.data) {
    const diasDesdeVerif = diffBusinessDays(v.data, now);
    if (diasDesdeVerif < 5) {
      return buildResult('ok', `Verificado manualmente há ${diasDesdeVerif} dia(s) útil(eis)`, {
        transporte,
        diasUteisSemMov: 0,
        dataReferencia: new Date(v.data),
        temDataUltimoEvento: !!shipping.rastreioInfo?.dataUltimoEvento,
      });
    }
    // Verificação manual antiga — cai no fluxo normal abaixo.
  }

  // Tempo sem movimento -----------------------------------------------------
  const dataUltimoEvento = shipping.rastreioInfo?.dataUltimoEvento;
  const temDataUltimoEvento = !!dataUltimoEvento && dataUltimoEvento !== '';
  const referencia = temDataUltimoEvento ? new Date(dataUltimoEvento) : new Date(shipping.date);

  if (isNaN(referencia.getTime())) {
    return buildResult('na', 'Data de referência inválida', { transporte });
  }

  const dias = diffBusinessDays(referencia, now);
  const { ok, atencao } = thresholdsFor(transporte);

  const motivo = temDataUltimoEvento
    ? `${dias} dia(s) útil(eis) desde a última movimentação`
    : `${dias} dia(s) útil(eis) desde o despacho (rastreio ainda não reportou evento)`;

  let nivel;
  if (dias < ok) nivel = 'ok';
  else if (dias < atencao) nivel = 'atencao';
  else nivel = 'urgente';

  return buildResult(nivel, motivo, {
    transporte,
    diasUteisSemMov: dias,
    dataReferencia: referencia,
    temDataUltimoEvento,
  });
}

function buildResult(nivel, motivo, extras = {}) {
  return {
    nivel,
    label: LABELS[nivel],
    emoji: EMOJIS[nivel],
    color: COLORS[nivel],
    motivo,
    transporte: extras.transporte ?? null,
    diasUteisSemMov: extras.diasUteisSemMov ?? null,
    dataReferencia: extras.dataReferencia ?? null,
    temDataUltimoEvento: extras.temDataUltimoEvento ?? false,
  };
}
