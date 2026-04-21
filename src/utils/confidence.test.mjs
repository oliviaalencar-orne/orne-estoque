/**
 * confidence.test.mjs — Testes para classifyConfidence.
 *
 * Rodar com: `node --test src/utils/confidence.test.mjs`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyConfidence, CONFIANCA_NIVEIS, clearConfidenceCache } from './confidence.js';

// Datas-âncora: 2026-04-21 é terça-feira.
const NOW = new Date(2026, 3, 21, 14, 0, 0); // 2026-04-21 14h
const HOJE_MANHA = new Date(2026, 3, 21, 9, 0, 0);
const ONTEM = new Date(2026, 3, 20);       // segunda
const DOIS_DIAS_UTEIS_ATRAS = new Date(2026, 3, 17);   // sexta → 2 úteis até terça
const TRES_DIAS_UTEIS_ATRAS = new Date(2026, 3, 16);   // quinta → 3 úteis
const QUATRO_DIAS_UTEIS_ATRAS = new Date(2026, 3, 15); // quarta → 4 úteis
const SEIS_DIAS_UTEIS_ATRAS = new Date(2026, 3, 13); // segunda → ~6 úteis
const OITO_DIAS_UTEIS_ATRAS = new Date(2026, 3, 9);  // quinta → ~8 úteis
const DOZE_DIAS_UTEIS_ATRAS = new Date(2026, 2, 30); // ~12 úteis

test.beforeEach(() => clearConfidenceCache());

test('status ENTREGUE retorna ⚪ na', () => {
  const r = classifyConfidence({ id: '1', status: 'ENTREGUE', date: ONTEM }, NOW);
  assert.equal(r.nivel, CONFIANCA_NIVEIS.NA);
});

test('status DEVOLVIDO retorna ⚪ na', () => {
  const r = classifyConfidence({ id: '2', status: 'DEVOLVIDO', date: ONTEM }, NOW);
  assert.equal(r.nivel, 'na');
});

test('AGUARDANDO_COLETA retorna ⚪ (problema interno, não de rastreio)', () => {
  const r = classifyConfidence({ id: '3', status: 'AGUARDANDO_COLETA', date: ONTEM }, NOW);
  assert.equal(r.nivel, 'na');
  assert.match(r.motivo, /coleta/i);
});

test('tipo devolucao sempre ⚪', () => {
  const r = classifyConfidence({ id: '4', status: 'EM_TRANSITO', tipo: 'devolucao', date: ONTEM }, NOW);
  assert.equal(r.nivel, 'na');
});

test('entrega local sempre ⚪', () => {
  const r = classifyConfidence({ id: '5', status: 'DESPACHADO', entregaLocal: true, date: ONTEM }, NOW);
  assert.equal(r.nivel, 'na');
});

test('EM_TRANSITO com evento hoje → 🟢 ok', () => {
  const r = classifyConfidence({
    id: '6',
    status: 'EM_TRANSITO',
    date: OITO_DIAS_UTEIS_ATRAS,
    rastreioInfo: { dataUltimoEvento: HOJE_MANHA.toISOString() },
    transportadora: 'Correios',
  }, NOW);
  assert.equal(r.nivel, 'ok');
  assert.equal(r.diasUteisSemMov, 0);
});

test('Loggi com 6 dias úteis sem movimento → 🟡 atenção', () => {
  const r = classifyConfidence({
    id: '7',
    status: 'EM_TRANSITO',
    date: OITO_DIAS_UTEIS_ATRAS,
    rastreioInfo: { dataUltimoEvento: SEIS_DIAS_UTEIS_ATRAS.toISOString() },
    transportadora: 'Loggi',
    codigoRastreio: 'LGI123',
  }, NOW);
  assert.equal(r.nivel, 'atencao');
  assert.equal(r.transporte, 'loggi');
});

test('Loggi com 8 dias úteis sem movimento → 🔴 urgente', () => {
  const r = classifyConfidence({
    id: '8',
    status: 'EM_TRANSITO',
    date: DOZE_DIAS_UTEIS_ATRAS,
    rastreioInfo: { dataUltimoEvento: OITO_DIAS_UTEIS_ATRAS.toISOString() },
    transportadora: 'Loggi',
  }, NOW);
  assert.equal(r.nivel, 'urgente');
});

// ---- Calibração Correios (pós-feedback staging) -------------------------
// Correios usa limiar específico de 4 dias úteis (sem faixa amarela):
// 🟢 <4 úteis  |  🔴 >=4 úteis. Evita falsos positivos em trânsitos
// normais, que frequentemente têm lacunas de 2-3 dias entre eventos.

test('Correios com 2 dias úteis sem movimento → 🟢', () => {
  const r = classifyConfidence({
    id: '9a',
    status: 'EM_TRANSITO',
    date: SEIS_DIAS_UTEIS_ATRAS,
    rastreioInfo: { dataUltimoEvento: DOIS_DIAS_UTEIS_ATRAS.toISOString() },
    transportadora: 'Correios',
  }, NOW);
  assert.equal(r.nivel, 'ok');
  assert.equal(r.diasUteisSemMov, 2);
});

test('Correios com 3 dias úteis sem movimento → 🟢 (abaixo do limiar)', () => {
  const r = classifyConfidence({
    id: '9b',
    status: 'EM_TRANSITO',
    date: SEIS_DIAS_UTEIS_ATRAS,
    rastreioInfo: { dataUltimoEvento: TRES_DIAS_UTEIS_ATRAS.toISOString() },
    transportadora: 'Correios',
  }, NOW);
  assert.equal(r.nivel, 'ok');
});

test('Correios com 4 dias úteis sem movimento → 🔴 (pula direto, sem faixa amarela)', () => {
  const r = classifyConfidence({
    id: '9c',
    status: 'EM_TRANSITO',
    date: OITO_DIAS_UTEIS_ATRAS,
    rastreioInfo: { dataUltimoEvento: QUATRO_DIAS_UTEIS_ATRAS.toISOString() },
    transportadora: 'Correios',
  }, NOW);
  assert.equal(r.nivel, 'urgente');
  assert.equal(r.diasUteisSemMov, 4);
});

test('Correios com 8 dias úteis sem movimento → 🔴 urgente', () => {
  const r = classifyConfidence({
    id: '9',
    status: 'EM_TRANSITO',
    date: DOZE_DIAS_UTEIS_ATRAS,
    rastreioInfo: { dataUltimoEvento: OITO_DIAS_UTEIS_ATRAS.toISOString() },
    transportadora: 'Correios',
  }, NOW);
  assert.equal(r.nivel, 'urgente');
});

test('Correios nunca cai em atencao (sem faixa amarela)', () => {
  // Varre de 4 a 12 úteis — todos devem ser urgente, nenhum atencao.
  const anchors = [
    QUATRO_DIAS_UTEIS_ATRAS,
    SEIS_DIAS_UTEIS_ATRAS,
    OITO_DIAS_UTEIS_ATRAS,
    DOZE_DIAS_UTEIS_ATRAS,
  ];
  for (const d of anchors) {
    const r = classifyConfidence({
      id: `cor-${d.toISOString()}`,
      status: 'EM_TRANSITO',
      date: DOZE_DIAS_UTEIS_ATRAS,
      rastreioInfo: { dataUltimoEvento: d.toISOString() },
      transportadora: 'Correios',
    }, NOW);
    assert.notEqual(r.nivel, 'atencao', `Correios ${d.toISOString()} não deve ser atencao`);
  }
});

test('Correios com 12 dias úteis sem movimento → 🔴 urgente', () => {
  const r = classifyConfidence({
    id: '10',
    status: 'EM_TRANSITO',
    date: DOZE_DIAS_UTEIS_ATRAS,
    rastreioInfo: { dataUltimoEvento: DOZE_DIAS_UTEIS_ATRAS.toISOString() },
    transportadora: 'Correios',
  }, NOW);
  assert.equal(r.nivel, 'urgente');
});

test('sem dataUltimoEvento, usa date como fallback', () => {
  const r = classifyConfidence({
    id: '11',
    status: 'DESPACHADO',
    date: OITO_DIAS_UTEIS_ATRAS,
    rastreioInfo: null,
    transportadora: 'Loggi',
  }, NOW);
  assert.equal(r.nivel, 'urgente'); // 8 úteis > 7 (Loggi threshold)
  assert.equal(r.temDataUltimoEvento, false);
  assert.match(r.motivo, /despacho/i);
});

test('dataUltimoEvento vazia tratada como ausente', () => {
  const r = classifyConfidence({
    id: '12',
    status: 'DESPACHADO',
    date: ONTEM,
    rastreioInfo: { dataUltimoEvento: '' },
    transportadora: 'Loggi',
  }, NOW);
  assert.equal(r.nivel, 'ok'); // 1 dia útil desde o despacho
  assert.equal(r.temDataUltimoEvento, false);
});

test('verificacaoManual confirmado_entregue → ⚪', () => {
  const r = classifyConfidence({
    id: '13',
    status: 'EM_TRANSITO',
    date: DOZE_DIAS_UTEIS_ATRAS,
    rastreioInfo: { dataUltimoEvento: OITO_DIAS_UTEIS_ATRAS.toISOString() },
    transportadora: 'Loggi',
    verificacaoManual: {
      decisao: 'confirmado_entregue',
      data: ONTEM.toISOString(),
    },
  }, NOW);
  assert.equal(r.nivel, 'na');
  assert.match(r.motivo, /manualmente/i);
});

test('verificacaoManual ainda_em_transito recente → 🟢', () => {
  const r = classifyConfidence({
    id: '14',
    status: 'EM_TRANSITO',
    date: DOZE_DIAS_UTEIS_ATRAS,
    rastreioInfo: { dataUltimoEvento: OITO_DIAS_UTEIS_ATRAS.toISOString() },
    transportadora: 'Loggi',
    verificacaoManual: {
      decisao: 'ainda_em_transito',
      data: ONTEM.toISOString(),
    },
  }, NOW);
  assert.equal(r.nivel, 'ok');
});

test('verificacaoManual ainda_em_transito antiga não mascara 🔴', () => {
  const r = classifyConfidence({
    id: '15',
    status: 'EM_TRANSITO',
    date: DOZE_DIAS_UTEIS_ATRAS,
    rastreioInfo: { dataUltimoEvento: OITO_DIAS_UTEIS_ATRAS.toISOString() },
    transportadora: 'Loggi',
    verificacaoManual: {
      decisao: 'ainda_em_transito',
      data: DOZE_DIAS_UTEIS_ATRAS.toISOString(), // verificação de 12 dias úteis atrás
    },
  }, NOW);
  assert.equal(r.nivel, 'urgente');
});

test('verificacaoManual com decisao=null (desfeita) volta ao cálculo automático', () => {
  // Cenário: operador confirmou entregue, depois desfez. decisao=null,
  // só historico preservado. Badge deve voltar ao cálculo por tempo.
  const r = classifyConfidence({
    id: '15b',
    status: 'EM_TRANSITO',
    date: DOZE_DIAS_UTEIS_ATRAS,
    rastreioInfo: { dataUltimoEvento: OITO_DIAS_UTEIS_ATRAS.toISOString() },
    transportadora: 'Loggi',
    verificacaoManual: {
      decisao: null,
      historico: [
        {
          decisao: 'confirmado_entregue',
          data: ONTEM.toISOString(),
          por_usuario_id: 'x',
          desfeito_em: NOW.toISOString(),
        },
      ],
    },
  }, NOW);
  // 8 úteis Loggi → urgente (regra automática, sem mascaramento manual)
  assert.equal(r.nivel, 'urgente');
});

test('shipping nulo retorna na', () => {
  const r = classifyConfidence(null, NOW);
  assert.equal(r.nivel, 'na');
});

test('shipping sem date retorna na', () => {
  const r = classifyConfidence({ id: '16', status: 'DESPACHADO', transportadora: 'Correios' }, NOW);
  assert.equal(r.nivel, 'na');
});

test('cache: duas chamadas seguidas (sem now) retornam mesma referência', () => {
  const s = {
    id: 'cache-test',
    status: 'EM_TRANSITO',
    date: ONTEM,
    rastreioInfo: { dataUltimoEvento: HOJE_MANHA.toISOString() },
    transportadora: 'Correios',
  };
  const r1 = classifyConfidence(s);
  const r2 = classifyConfidence(s);
  assert.equal(r1, r2); // mesma instância (cache hit)
});

test('resultado inclui color.fg e color.bg para render', () => {
  const r = classifyConfidence({
    id: '17',
    status: 'EM_TRANSITO',
    date: OITO_DIAS_UTEIS_ATRAS,
    rastreioInfo: { dataUltimoEvento: OITO_DIAS_UTEIS_ATRAS.toISOString() },
    transportadora: 'Loggi',
  }, NOW);
  assert.equal(typeof r.color.fg, 'string');
  assert.equal(typeof r.color.bg, 'string');
  assert.match(r.color.fg, /^#/);
});
