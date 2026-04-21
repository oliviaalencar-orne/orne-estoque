/**
 * businessDays.test.mjs — Testes para diffBusinessDays.
 *
 * Rodar com: `node --test src/utils/businessDays.test.mjs`
 * (Node 18+ já inclui node:test nativamente; zero dependências novas.)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffBusinessDays, isBusinessDay } from './businessDays.js';

// Usamos datas fixas (ano cujo calendário é conhecido) para evitar flakiness.
// 2026-04-20 (segunda) → 2026-04-24 (sexta) = 4 dias úteis inteiros.
// 2026-04-24 (sexta)   → 2026-04-27 (segunda) = 1 dia útil.

test('mesmo dia retorna 0', () => {
  const d = new Date(2026, 3, 20, 10, 0, 0);
  assert.equal(diffBusinessDays(d, d), 0);
});

test('segunda → sexta na mesma semana = 4 dias úteis', () => {
  const seg = new Date(2026, 3, 20); // 2026-04-20 segunda
  const sex = new Date(2026, 3, 24); // 2026-04-24 sexta
  assert.equal(diffBusinessDays(seg, sex), 4);
});

test('sexta → segunda seguinte = 1 dia útil (pula fim de semana)', () => {
  const sex = new Date(2026, 3, 24); // sexta
  const seg = new Date(2026, 3, 27); // segunda
  assert.equal(diffBusinessDays(sex, seg), 1);
});

test('sábado → segunda = 0 (sábado não conta, 1 dia de diferença mas é domingo)', () => {
  const sab = new Date(2026, 3, 25); // sábado
  const seg = new Date(2026, 3, 27); // segunda
  // entre sábado e segunda há: sábado e domingo — nenhum dia útil inteiro
  assert.equal(diffBusinessDays(sab, seg), 0);
});

test('datas invertidas retornam negativo simétrico', () => {
  const seg = new Date(2026, 3, 20);
  const sex = new Date(2026, 3, 24);
  assert.equal(diffBusinessDays(sex, seg), -4);
});

test('ignora horário — 09h e 23h do mesmo dia = 0', () => {
  const manha = new Date(2026, 3, 20, 9, 0, 0);
  const noite = new Date(2026, 3, 20, 23, 0, 0);
  assert.equal(diffBusinessDays(manha, noite), 0);
});

test('duas semanas completas (10 dias úteis)', () => {
  const inicio = new Date(2026, 3, 6); // segunda
  const fim = new Date(2026, 3, 20);   // segunda (2 semanas depois)
  assert.equal(diffBusinessDays(inicio, fim), 10);
});

test('datas inválidas retornam 0', () => {
  assert.equal(diffBusinessDays('not-a-date', new Date()), 0);
  assert.equal(diffBusinessDays(new Date(), null), 0);
});

test('aceita strings ISO', () => {
  const a = '2026-04-20T10:00:00.000Z';
  const b = '2026-04-24T10:00:00.000Z';
  // entre 20 e 24 abril (local TZ) — como construímos Date a partir de ISO,
  // fuso horário pode mover em até 1 dia. Este teste valida que aceita strings
  // sem quebrar; o valor exato depende do fuso de quem roda.
  const result = diffBusinessDays(a, b);
  assert.ok(result >= 3 && result <= 4, `Esperado 3 ou 4, recebeu ${result}`);
});

test('isBusinessDay: sábado e domingo retornam false', () => {
  assert.equal(isBusinessDay(new Date(2026, 3, 25)), false); // sábado
  assert.equal(isBusinessDay(new Date(2026, 3, 26)), false); // domingo
});

test('isBusinessDay: segunda a sexta retornam true', () => {
  assert.equal(isBusinessDay(new Date(2026, 3, 20)), true); // segunda
  assert.equal(isBusinessDay(new Date(2026, 3, 21)), true); // terça
  assert.equal(isBusinessDay(new Date(2026, 3, 22)), true); // quarta
  assert.equal(isBusinessDay(new Date(2026, 3, 23)), true); // quinta
  assert.equal(isBusinessDay(new Date(2026, 3, 24)), true); // sexta
});

test('isBusinessDay: data inválida retorna false', () => {
  assert.equal(isBusinessDay('xyz'), false);
});
