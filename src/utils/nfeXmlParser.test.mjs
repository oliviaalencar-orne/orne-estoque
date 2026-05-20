/**
 * nfeXmlParser.test.mjs — Testes do parser de NF-e.
 *
 * Rodar com: `node --test src/utils/nfeXmlParser.test.mjs`
 * (Node 18+ tem node:test nativo; mesmo padrão dos outros testes do projeto.)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import {
  parseNfeXml,
  validarDvChaveAcesso,
  matchPermissivo,
  matchConservador,
  PARSER_ERRORS,
} from './nfeXmlParser.js';

// Helper local duplicado do parser (propositalmente — testar DV contra
// implementação independente evita circularidade).
function computeDv(digits43) {
  let soma = 0;
  let peso = 2;
  for (let i = digits43.length - 1; i >= 0; i--) {
    soma += Number(digits43[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

const BASE_43 = '3524010123456700019055001000000519123456789';
const DV_CORRETO = computeDv(BASE_43);
const CHAVE_VALIDA = BASE_43 + DV_CORRETO;
const CHAVE_INVALIDA = BASE_43 + ((DV_CORRETO + 1) % 10);

function xmlFull({
  chave = CHAVE_VALIDA,
  usarIdAttr = true,
  usarChNFeTag = true,
  omitirNamespace = false,
  comCpf = true,
  comComplemento = true,
  multiProdutos = true,
  tpNF = '1',
  refNFeChave = null, // 44 dígitos para inserir tag <NFref><refNFe>
  infCpl = null, // texto para <infAdic><infCpl>
  cEAN = null, // valor de cEAN no produto 1 (default: tag omitida)
} = {}) {
  const ns = omitirNamespace ? '' : ' xmlns="http://www.portalfiscal.inf.br/nfe"';
  const idAttr = usarIdAttr ? ` Id="NFe${chave}"` : '';
  const destId = comCpf
    ? '<CPF>12345678901</CPF>'
    : '<CNPJ>12345678000190</CNPJ>';
  const cpl = comComplemento ? '<xCpl>APT 45</xCpl>' : '';
  const tpNFTag = tpNF != null ? `<tpNF>${tpNF}</tpNF>` : '';
  const nfRefTag = refNFeChave
    ? `<NFref><refNFe>${refNFeChave}</refNFe></NFref>`
    : '';
  const infAdicTag = infCpl != null
    ? `<infAdic><infCpl>${infCpl}</infCpl></infAdic>`
    : '';
  const cEANTag = cEAN != null ? `<cEAN>${cEAN}</cEAN>` : '';
  const prod2 = multiProdutos
    ? `<det nItem="2">
         <prod>
           <cProd>DEF456</cProd>
           <xProd>ABAJUR MESA</xProd>
           <qCom>1.0000</qCom>
           <uCom>UN</uCom>
         </prod>
       </det>`
    : '';
  const chTag = usarChNFeTag
    ? `<protNFe${ns}><infProt><chNFe>${chave}</chNFe></infProt></protNFe>`
    : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc${ns} versao="4.00">
  <NFe${ns}>
    <infNFe versao="4.00"${idAttr}>
      <ide>
        <nNF>519</nNF>
        ${tpNFTag}
        <dhEmi>2026-04-20T10:30:00-03:00</dhEmi>
        ${nfRefTag}
      </ide>
      <dest>
        ${destId}
        <xNome>FULANO DA SILVA</xNome>
        <enderDest>
          <xLgr>RUA DAS FLORES</xLgr>
          <nro>123</nro>
          ${cpl}
          <xBairro>CENTRO</xBairro>
          <xMun>SAO PAULO</xMun>
          <UF>SP</UF>
          <CEP>01000000</CEP>
        </enderDest>
      </dest>
      <det nItem="1">
        <prod>
          <cProd>ABC123</cProd>
          <xProd>LUMINARIA LED</xProd>
          ${cEANTag}
          <qCom>2.0000</qCom>
          <uCom>UN</uCom>
        </prod>
      </det>
      ${prod2}
      <total>
        <ICMSTot>
          <vNF>199.90</vNF>
        </ICMSTot>
      </total>
      ${infAdicTag}
    </infNFe>
  </NFe>
  ${chTag}
</nfeProc>`;
}

// ─── validarDvChaveAcesso ───────────────────────────────────────────────────

test('validarDvChaveAcesso aceita chave com DV correto', () => {
  assert.equal(validarDvChaveAcesso(CHAVE_VALIDA), true);
});

test('validarDvChaveAcesso rejeita chave com DV errado', () => {
  assert.equal(validarDvChaveAcesso(CHAVE_INVALIDA), false);
});

test('validarDvChaveAcesso rejeita tamanho diferente de 44', () => {
  assert.equal(validarDvChaveAcesso('12345'), false);
  assert.equal(validarDvChaveAcesso(BASE_43), false);
});

test('validarDvChaveAcesso rejeita não-dígitos', () => {
  assert.equal(validarDvChaveAcesso('X'.repeat(44)), false);
});

test('validarDvChaveAcesso rejeita null/undefined/não-string', () => {
  assert.equal(validarDvChaveAcesso(null), false);
  assert.equal(validarDvChaveAcesso(undefined), false);
  assert.equal(validarDvChaveAcesso(12345), false);
});

// ─── parseNfeXml — casos de erro ────────────────────────────────────────────

test('parseNfeXml rejeita string vazia', () => {
  const r = parseNfeXml('');
  assert.equal(r.sucesso, false);
  assert.equal(r.erro, PARSER_ERRORS.XML_VAZIO);
  assert.equal(r.dados, null);
});

test('parseNfeXml rejeita whitespace apenas', () => {
  const r = parseNfeXml('   \n\t  ');
  assert.equal(r.sucesso, false);
  assert.equal(r.erro, PARSER_ERRORS.XML_VAZIO);
});

test('parseNfeXml rejeita input não-string', () => {
  assert.equal(parseNfeXml(null).sucesso, false);
  assert.equal(parseNfeXml(123).sucesso, false);
  assert.equal(parseNfeXml({}).sucesso, false);
});

test('parseNfeXml rejeita XML com DOCTYPE (XXE guard)', () => {
  const evil = `<?xml version="1.0"?>
<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe/></nfeProc>`;
  const r = parseNfeXml(evil);
  assert.equal(r.sucesso, false);
  assert.equal(r.erro, PARSER_ERRORS.XXE_DETECTED);
});

test('parseNfeXml rejeita XML com ENTITY externa (XXE guard)', () => {
  const evil = `<?xml version="1.0"?><!ENTITY xxe SYSTEM "file:///etc/passwd"><nfeProc/>`;
  const r = parseNfeXml(evil);
  assert.equal(r.sucesso, false);
  assert.equal(r.erro, PARSER_ERRORS.XXE_DETECTED);
});

test('parseNfeXml rejeita XML sem tag NFe/nfeProc', () => {
  const r = parseNfeXml('<?xml version="1.0"?><root><foo/></root>');
  assert.equal(r.sucesso, false);
  assert.equal(r.erro, PARSER_ERRORS.NFE_TAG_MISSING);
});

test('parseNfeXml rejeita NFe sem namespace correto', () => {
  const r = parseNfeXml(xmlFull({ omitirNamespace: true }));
  assert.equal(r.sucesso, false);
  assert.equal(r.erro, PARSER_ERRORS.NAMESPACE_INVALID);
});

test('parseNfeXml rejeita quando não há chave (sem Id e sem chNFe)', () => {
  const r = parseNfeXml(xmlFull({ usarIdAttr: false, usarChNFeTag: false }));
  assert.equal(r.sucesso, false);
  assert.equal(r.erro, PARSER_ERRORS.CHAVE_MISSING);
});

test('parseNfeXml rejeita NF sem produtos', () => {
  const xml = `<?xml version="1.0"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe xmlns="http://www.portalfiscal.inf.br/nfe">
    <infNFe versao="4.00" Id="NFe${CHAVE_VALIDA}">
      <ide><nNF>1</nNF></ide>
      <dest><xNome>X</xNome></dest>
      <total><ICMSTot><vNF>0</vNF></ICMSTot></total>
    </infNFe>
  </NFe>
</nfeProc>`;
  const r = parseNfeXml(xml);
  assert.equal(r.sucesso, false);
  assert.equal(r.erro, PARSER_ERRORS.PRODUTOS_VAZIOS);
});

// ─── parseNfeXml — casos de sucesso ─────────────────────────────────────────

test('parseNfeXml extrai chave pelo atributo Id', () => {
  const r = parseNfeXml(xmlFull({ usarChNFeTag: false }));
  assert.equal(r.sucesso, true);
  assert.equal(r.dados.chaveAcesso, CHAVE_VALIDA);
  assert.equal(r.dados.chaveValida, true);
});

test('parseNfeXml extrai chave pela tag chNFe quando Id ausente', () => {
  const r = parseNfeXml(xmlFull({ usarIdAttr: false, usarChNFeTag: true }));
  assert.equal(r.sucesso, true);
  assert.equal(r.dados.chaveAcesso, CHAVE_VALIDA);
});

test('parseNfeXml aceita chave com DV inválido mas marca chaveValida=false', () => {
  const r = parseNfeXml(xmlFull({ chave: CHAVE_INVALIDA }));
  assert.equal(r.sucesso, true, 'não deve bloquear por DV');
  assert.equal(r.dados.chaveAcesso, CHAVE_INVALIDA);
  assert.equal(r.dados.chaveValida, false);
});

test('parseNfeXml extrai número, data e valor total', () => {
  const r = parseNfeXml(xmlFull());
  assert.equal(r.dados.numeroNf, '519');
  assert.equal(r.dados.dataEmissao, '2026-04-20T10:30:00-03:00');
  assert.equal(r.dados.valorTotal, 199.9);
});

test('parseNfeXml extrai cliente com CPF', () => {
  const r = parseNfeXml(xmlFull({ comCpf: true }));
  assert.equal(r.dados.cliente.nome, 'FULANO DA SILVA');
  assert.equal(r.dados.cliente.cpf, '12345678901');
  assert.equal(r.dados.cliente.cnpj, null);
});

test('parseNfeXml extrai cliente com CNPJ', () => {
  const r = parseNfeXml(xmlFull({ comCpf: false }));
  assert.equal(r.dados.cliente.cnpj, '12345678000190');
  assert.equal(r.dados.cliente.cpf, null);
});

test('parseNfeXml extrai endereço de destino completo', () => {
  const r = parseNfeXml(xmlFull({ comComplemento: true }));
  const d = r.dados.destino;
  assert.equal(d.logradouro, 'RUA DAS FLORES');
  assert.equal(d.numero, '123');
  assert.equal(d.complemento, 'APT 45');
  assert.equal(d.bairro, 'CENTRO');
  assert.equal(d.municipio, 'SAO PAULO');
  assert.equal(d.uf, 'SP');
  assert.equal(d.cep, '01000000');
});

test('parseNfeXml aceita endereço sem complemento (opcional)', () => {
  const r = parseNfeXml(xmlFull({ comComplemento: false }));
  assert.equal(r.dados.destino.complemento, '');
});

test('parseNfeXml extrai múltiplos produtos', () => {
  const r = parseNfeXml(xmlFull({ multiProdutos: true }));
  assert.equal(r.dados.produtos.length, 2);
  assert.deepEqual(r.dados.produtos[0], {
    sku: 'ABC123',
    descricao: 'LUMINARIA LED',
    quantidade: 2,
    unidade: 'UN',
    ean: '',
  });
  assert.deepEqual(r.dados.produtos[1], {
    sku: 'DEF456',
    descricao: 'ABAJUR MESA',
    quantidade: 1,
    unidade: 'UN',
    ean: '',
  });
});

test('parseNfeXml extrai produto único (det não é array)', () => {
  const r = parseNfeXml(xmlFull({ multiProdutos: false }));
  assert.equal(r.dados.produtos.length, 1);
  assert.equal(r.dados.produtos[0].sku, 'ABC123');
});

test('parseNfeXml aceita quantidade com vírgula decimal', () => {
  const xml = xmlFull().replace('<qCom>2.0000</qCom>', '<qCom>2,5000</qCom>');
  const r = parseNfeXml(xml);
  assert.equal(r.dados.produtos[0].quantidade, 2.5);
});

test('parseNfeXml aceita XML sem nfeProc (NFe raiz direta)', () => {
  const xml = `<?xml version="1.0"?>
<NFe xmlns="http://www.portalfiscal.inf.br/nfe">
  <infNFe versao="4.00" Id="NFe${CHAVE_VALIDA}">
    <ide><nNF>7</nNF></ide>
    <dest><xNome>JOSE</xNome></dest>
    <det nItem="1"><prod><cProd>X1</cProd><xProd>ITEM</xProd><qCom>1</qCom><uCom>UN</uCom></prod></det>
    <total><ICMSTot><vNF>10.00</vNF></ICMSTot></total>
  </infNFe>
</NFe>`;
  const r = parseNfeXml(xml);
  assert.equal(r.sucesso, true);
  assert.equal(r.dados.numeroNf, '7');
  assert.equal(r.dados.chaveAcesso, CHAVE_VALIDA);
});

test('parseNfeXml rejeita XML mal formado', () => {
  const r = parseNfeXml('<?xml version="1.0"?><nfeProc><NFe>')
  assert.equal(r.sucesso, false);
  // Pode ser XML_MALFORMED ou NFE_TAG_MISSING dependendo da tolerância do parser;
  // garantir apenas que é um erro legível.
  assert.ok(r.erro && typeof r.erro === 'string' && r.erro.length > 0);
});

test('parseNfeXml preserva SKU numérico como string', () => {
  const xml = xmlFull().replace('<cProd>ABC123</cProd>', '<cProd>000789</cProd>');
  const r = parseNfeXml(xml);
  assert.equal(r.dados.produtos[0].sku, '000789');
});

// ─── tpNF (Sub-frente 3.0c) ─────────────────────────────────────────────────

test('parseNfeXml extrai tpNF=1 para saída', () => {
  const r = parseNfeXml(xmlFull({ tpNF: '1' }));
  assert.equal(r.sucesso, true);
  assert.equal(r.dados.tpNF, 1);
  assert.equal(typeof r.dados.tpNF, 'number');
});

test('parseNfeXml extrai tpNF=0 para devolução/entrada', () => {
  const r = parseNfeXml(xmlFull({ tpNF: '0' }));
  assert.equal(r.dados.tpNF, 0);
});

test('parseNfeXml retorna tpNF=null quando tag ausente', () => {
  const r = parseNfeXml(xmlFull({ tpNF: null }));
  assert.equal(r.dados.tpNF, null);
});

// ─── refNFe (Sub-frente 3.0c) ───────────────────────────────────────────────

const REF_NFE_CHAVE = '35260446268741000159550020000002521939273693';

test('parseNfeXml extrai refNFe via <ide><NFref><refNFe>', () => {
  const r = parseNfeXml(xmlFull({ refNFeChave: REF_NFE_CHAVE }));
  assert.equal(r.sucesso, true);
  assert.equal(r.dados.refNFe, REF_NFE_CHAVE);
});

test('parseNfeXml retorna refNFe=null em saídas (sem NFref nem infCpl)', () => {
  const r = parseNfeXml(xmlFull());
  assert.equal(r.dados.refNFe, null);
});

test('parseNfeXml faz fallback de refNFe via regex em <infCpl> quando NFref ausente', () => {
  const r = parseNfeXml(
    xmlFull({
      refNFeChave: null,
      infCpl: `Devolução referente à NF chave ${REF_NFE_CHAVE} emitida em 14/04/2026.`,
    }),
  );
  assert.equal(r.dados.refNFe, REF_NFE_CHAVE);
});

test('parseNfeXml ignora chaves curtas no fallback infCpl', () => {
  const r = parseNfeXml(
    xmlFull({
      refNFeChave: null,
      infCpl: 'Sem chave válida aqui — apenas números curtos: 12345.',
    }),
  );
  assert.equal(r.dados.refNFe, null);
});

test('parseNfeXml prefere NFref ao fallback quando ambos presentes', () => {
  const outraChave = '35260546268741000159550020000099991234567893';
  const r = parseNfeXml(
    xmlFull({
      refNFeChave: REF_NFE_CHAVE,
      infCpl: `Devolução da NF chave ${outraChave}.`,
    }),
  );
  assert.equal(r.dados.refNFe, REF_NFE_CHAVE);
});

// ─── EAN (Sub-frente 3.0c) ──────────────────────────────────────────────────

test('parseNfeXml extrai ean válido', () => {
  const r = parseNfeXml(xmlFull({ cEAN: '7891234567890' }));
  assert.equal(r.dados.produtos[0].ean, '7891234567890');
});

test('parseNfeXml normaliza "SEM GTIN" para string vazia', () => {
  const r = parseNfeXml(xmlFull({ cEAN: 'SEM GTIN' }));
  assert.equal(r.dados.produtos[0].ean, '');
});

test('parseNfeXml normaliza cEAN ausente para string vazia', () => {
  const r = parseNfeXml(xmlFull({ cEAN: null }));
  assert.equal(r.dados.produtos[0].ean, '');
});

test('parseNfeXml remove não-dígitos do ean (caso defensivo)', () => {
  const r = parseNfeXml(xmlFull({ cEAN: '789-1234567890' }));
  assert.equal(r.dados.produtos[0].ean, '7891234567890');
});

// ─── matchPermissivo (Sub-frente 3.0c) ──────────────────────────────────────

const stockSample = [
  { sku: 'ABC123', ean: '7891111111111', name: 'Produto Alpha' },
  { sku: 'XYZ-999', ean: '7892222222222', name: 'Produto Beta' },
  { sku: '1005006597736486-small-D45H27.5cm-warm-l', ean: '', name: 'Spedy Long' },
];

test('matchPermissivo casa por SKU exato lowercased', () => {
  const r = matchPermissivo({ sku: 'abc123', ean: '' }, stockSample);
  assert.ok(r);
  assert.equal(r.sku, 'ABC123');
});

test('matchPermissivo casa por SKU normalizado (ignora não-alfanuméricos)', () => {
  const r = matchPermissivo({ sku: 'XYZ#999', ean: '' }, stockSample);
  assert.ok(r);
  assert.equal(r.sku, 'XYZ-999');
});

test('matchPermissivo casa por EAN normalizado quando SKU diverge', () => {
  const r = matchPermissivo({ sku: 'OUTROSKU', ean: '7891111111111' }, stockSample);
  assert.ok(r);
  assert.equal(r.sku, 'ABC123');
});

test('matchPermissivo casa por substring quando ambos ≥ 5 chars', () => {
  const r = matchPermissivo(
    { sku: '1005006597736486-small', ean: '' },
    stockSample,
  );
  assert.ok(r);
  assert.equal(r.sku, '1005006597736486-small-D45H27.5cm-warm-l');
});

test('matchPermissivo retorna null quando nenhum critério casa', () => {
  const r = matchPermissivo({ sku: 'INEXISTENTE', ean: '' }, stockSample);
  assert.equal(r, null);
});

test('matchPermissivo NÃO casa por substring quando SKU < 5 chars', () => {
  const r = matchPermissivo({ sku: 'AB', ean: '' }, [
    { sku: 'ABC123', ean: '', name: 'X' },
  ]);
  assert.equal(r, null);
});

test('matchPermissivo aceita produtoXml inválido sem crashar', () => {
  assert.equal(matchPermissivo(null, stockSample), null);
  assert.equal(matchPermissivo({}, stockSample), null);
  assert.equal(matchPermissivo({ sku: '' }, stockSample), null);
});

test('matchPermissivo aceita estoque inválido sem crashar', () => {
  assert.equal(matchPermissivo({ sku: 'X' }, null), null);
  assert.equal(matchPermissivo({ sku: 'X' }, undefined), null);
});

// ─── matchConservador (Sub-frente 3.0c, antecipa 3.1) ───────────────────────

test('matchConservador retorna 1 match para SKU exato lowercased', () => {
  const r = matchConservador({ sku: 'abc123' }, stockSample);
  assert.equal(r.length, 1);
  assert.equal(r[0].sku, 'ABC123');
});

test('matchConservador retorna array vazio quando SKU não bate', () => {
  const r = matchConservador({ sku: 'NAO-EXISTE' }, stockSample);
  assert.deepEqual(r, []);
});

test('matchConservador retorna múltiplos matches em SKU duplicado', () => {
  const stock = [
    { sku: 'DUP', ean: '', name: 'Primeiro' },
    { sku: 'dup', ean: '', name: 'Segundo lowercased' },
    { sku: 'outro', ean: '', name: 'Outro' },
  ];
  const r = matchConservador({ sku: 'DUP' }, stock);
  assert.equal(r.length, 2);
});

test('matchConservador NÃO casa com divergência mínima (sem normalização)', () => {
  // matchPermissivo casaria 'XYZ#999' contra 'XYZ-999', matchConservador não.
  const r = matchConservador({ sku: 'XYZ#999' }, stockSample);
  assert.deepEqual(r, []);
});

test('matchConservador NÃO casa por EAN', () => {
  // EAN bateria em matchPermissivo, mas conservador só olha SKU.
  const r = matchConservador({ sku: 'NAO', ean: '7891111111111' }, stockSample);
  assert.deepEqual(r, []);
});

test('matchConservador aceita inputs inválidos sem crashar', () => {
  assert.deepEqual(matchConservador(null, stockSample), []);
  assert.deepEqual(matchConservador({}, stockSample), []);
  assert.deepEqual(matchConservador({ sku: '' }, stockSample), []);
  assert.deepEqual(matchConservador({ sku: 'X' }, null), []);
});

// ─── Robustez Latin-1 (decisão 3.0c.1) ──────────────────────────────────────

test('parseNfeXml não-crasha em fixture Latin-1 e preserva acentos', () => {
  const buf = readFileSync(new URL('../../tests/fixtures/nfe-saida-latin1.xml', import.meta.url));
  // Detectar encoding do header (mesmo caminho do caller no ShippingXMLImport)
  const sample = new TextDecoder('ascii', { fatal: false }).decode(buf.subarray(0, 256));
  const m = sample.match(/<\?xml[^>]+encoding=["']([^"']+)["']/i);
  const encDeclarado = m ? m[1].toLowerCase() : 'utf-8';
  assert.equal(encDeclarado, 'iso-8859-1', 'fixture deve declarar ISO-8859-1');
  const text = new TextDecoder('iso-8859-1', { fatal: false }).decode(buf);
  const r = parseNfeXml(text);
  assert.equal(r.sucesso, true, `parser não deve crashar — erro: ${r.erro}`);
  assert.ok(r.dados.cliente.nome.includes('JOÃO'), `cliente esperado conter JOÃO, recebeu: ${r.dados.cliente.nome}`);
  assert.ok(r.dados.cliente.nome.includes('AÇÚCAR'), `cliente esperado conter AÇÚCAR, recebeu: ${r.dados.cliente.nome}`);
  assert.ok(r.dados.destino.municipio.includes('SÃO PAULO'), `município esperado SÃO PAULO, recebeu: ${r.dados.destino.municipio}`);
  assert.ok(r.dados.produtos[0].descricao.includes('LUMINÁRIA'), `xProd esperado conter LUMINÁRIA, recebeu: ${r.dados.produtos[0].descricao}`);
});

test('parseNfeXml retorna ean="" para fixture Latin-1 com cEAN=SEM GTIN', () => {
  const buf = readFileSync(new URL('../../tests/fixtures/nfe-saida-latin1.xml', import.meta.url));
  const text = new TextDecoder('iso-8859-1', { fatal: false }).decode(buf);
  const r = parseNfeXml(text);
  assert.equal(r.dados.produtos[0].ean, '');
});

test('parseNfeXml não corrompe acentos quando bytes Latin-1 são re-codificados como string', () => {
  // Sanidade: gera bytes Latin-1 inline, decodifica, parseia, verifica acento exato.
  const xmlStr = `<?xml version="1.0" encoding="ISO-8859-1"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe xmlns="http://www.portalfiscal.inf.br/nfe">
    <infNFe versao="4.00" Id="NFe${CHAVE_VALIDA}">
      <ide><nNF>1</nNF></ide>
      <dest><xNome>AÇÃO</xNome></dest>
      <det nItem="1"><prod><cProd>X</cProd><xProd>P</xProd><qCom>1</qCom><uCom>UN</uCom></prod></det>
      <total><ICMSTot><vNF>0</vNF></ICMSTot></total>
    </infNFe>
  </NFe>
</nfeProc>`;
  const buf = Buffer.from(xmlStr, 'latin1');
  const text = new TextDecoder('iso-8859-1', { fatal: false }).decode(buf);
  const r = parseNfeXml(text);
  assert.equal(r.sucesso, true);
  assert.equal(r.dados.cliente.nome, 'AÇÃO');
});
