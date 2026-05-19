import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveHubAlias } from './hubAliasResolver.js';

const hubs = [
  { name: 'HUB CWB' },
  { name: 'HUB RJ' },
  { name: 'HUB VG' },
];

const aliases = [
  { name_alias: 'G+SHIP CWB', name_canonical: 'HUB CWB' },
  { name_alias: 'G+SHIP RJ', name_canonical: 'HUB RJ' },
  { name_alias: 'G+SHIP VG', name_canonical: 'HUB VG' },
];

test('retorna canonical null para entrada vazia / null / undefined', () => {
  assert.deepEqual(resolveHubAlias('', hubs, aliases), { canonical: null, wasNormalized: false });
  assert.deepEqual(resolveHubAlias(null, hubs, aliases), { canonical: null, wasNormalized: false });
  assert.deepEqual(resolveHubAlias(undefined, hubs, aliases), { canonical: null, wasNormalized: false });
  assert.deepEqual(resolveHubAlias('   ', hubs, aliases), { canonical: null, wasNormalized: false });
});

test('passa direto quando nome já é canônico em hubs', () => {
  const r = resolveHubAlias('HUB CWB', hubs, aliases);
  assert.equal(r.canonical, 'HUB CWB');
  assert.equal(r.wasNormalized, false);
});

test('normaliza alias conhecido (G+SHIP RJ → HUB RJ)', () => {
  const r = resolveHubAlias('G+SHIP RJ', hubs, aliases);
  assert.equal(r.canonical, 'HUB RJ');
  assert.equal(r.wasNormalized, true);
  assert.equal(r.originalName, 'G+SHIP RJ');
});

test('trim espaços nas pontas antes de tentar match', () => {
  assert.equal(resolveHubAlias('  HUB CWB  ', hubs, aliases).canonical, 'HUB CWB');
  assert.equal(resolveHubAlias('  G+SHIP VG  ', hubs, aliases).canonical, 'HUB VG');
});

test('retorna canonical null para nome desconhecido (não está em hubs nem em aliases)', () => {
  const r = resolveHubAlias('Inexistente', hubs, aliases);
  assert.equal(r.canonical, null);
  assert.equal(r.wasNormalized, false);
});

test('retorna canonical null se alias aponta para canonical não existente em hubs (orfão)', () => {
  const orfaos = [{ name_alias: 'OLD NAME', name_canonical: 'HUB EXTINTO' }];
  const r = resolveHubAlias('OLD NAME', hubs, orfaos);
  assert.equal(r.canonical, null);
  assert.equal(r.wasNormalized, false);
});

test('match é case-sensitive (KISS — operador sempre seleciona via select)', () => {
  assert.equal(resolveHubAlias('hub cwb', hubs, aliases).canonical, null);
  assert.equal(resolveHubAlias('g+ship rj', hubs, aliases).canonical, null);
});

test('tolera hubs/aliases vazios ou undefined', () => {
  assert.equal(resolveHubAlias('HUB CWB', [], []).canonical, null);
  assert.equal(resolveHubAlias('HUB CWB', null, null).canonical, null);
  assert.equal(resolveHubAlias('HUB CWB', undefined, undefined).canonical, null);
});
