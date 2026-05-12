import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCpfCnpj } from './cpfCnpj.js';

// Valores fictícios sintaticamente válidos — repo público, regra #11.
const CPF_FICTICIO = '00000000000';
const CNPJ_FICTICIO = '00000000000000';

test('normalizeCpfCnpj retorna null para entradas ausentes', () => {
  assert.equal(normalizeCpfCnpj(null), null);
  assert.equal(normalizeCpfCnpj(undefined), null);
  assert.equal(normalizeCpfCnpj(''), null);
});

test('normalizeCpfCnpj aceita CPF com 11 dígitos puros', () => {
  assert.equal(normalizeCpfCnpj(CPF_FICTICIO), CPF_FICTICIO);
});

test('normalizeCpfCnpj aceita CNPJ com 14 dígitos puros', () => {
  assert.equal(normalizeCpfCnpj(CNPJ_FICTICIO), CNPJ_FICTICIO);
});

test('normalizeCpfCnpj remove pontuação de CPF formatado', () => {
  assert.equal(normalizeCpfCnpj('000.000.000-00'), CPF_FICTICIO);
});

test('normalizeCpfCnpj remove pontuação de CNPJ formatado', () => {
  assert.equal(normalizeCpfCnpj('00.000.000/0000-00'), CNPJ_FICTICIO);
});

test('normalizeCpfCnpj rejeita tamanhos inválidos', () => {
  assert.equal(normalizeCpfCnpj('123'), null);
  assert.equal(normalizeCpfCnpj('1234567890'), null);   // 10 dígitos
  assert.equal(normalizeCpfCnpj('123456789012'), null); // 12 dígitos
  assert.equal(normalizeCpfCnpj('1234567890123'), null); // 13 dígitos
  assert.equal(normalizeCpfCnpj('123456789012345'), null); // 15 dígitos
});

test('normalizeCpfCnpj rejeita string sem dígitos', () => {
  assert.equal(normalizeCpfCnpj('abc'), null);
  assert.equal(normalizeCpfCnpj('---.---.---'), null);
});

test('normalizeCpfCnpj converte input numérico', () => {
  // Number perde leading zeros — útil só quando o caller mandou number
  // de boa fé. Aqui só validamos que a coerção via String() funciona.
  assert.equal(normalizeCpfCnpj(12345678901), '12345678901');
});

test('normalizeCpfCnpj aceita CPF com espaços e ruído', () => {
  assert.equal(normalizeCpfCnpj('  000 000 000-00  '), CPF_FICTICIO);
});
