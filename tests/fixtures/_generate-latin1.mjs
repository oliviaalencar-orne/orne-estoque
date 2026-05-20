/**
 * Gerador one-shot da fixture sintética `nfe-saida-latin1.xml`.
 *
 * Por que sintética: evita commitar PII real (clientes, CPFs, endereços) que
 * estariam num XML do inventário operacional. Os acentos cobrem o teste
 * de robustez Latin-1 (decisão 3.0c.1).
 *
 * Rodar: `node tests/fixtures/_generate-latin1.mjs`
 * Saída: `tests/fixtures/nfe-saida-latin1.xml` (encoding ISO-8859-1 bytes).
 *
 * Este script é mantido apenas para reproducibilidade — a fixture gerada já
 * está commitada no repo. Re-rodar só se a estrutura sintética mudar.
 */
import { writeFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';

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

const BASE_43 = '3524010123456700019055001000000160512345678';
const CHAVE = BASE_43 + computeDv(BASE_43);

const xml = `<?xml version="1.0" encoding="ISO-8859-1"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe xmlns="http://www.portalfiscal.inf.br/nfe">
    <infNFe versao="4.00" Id="NFe${CHAVE}">
      <ide>
        <nNF>1605</nNF>
        <tpNF>1</tpNF>
        <dhEmi>2026-05-15T10:00:00-03:00</dhEmi>
      </ide>
      <dest>
        <CPF>12345678901</CPF>
        <xNome>JOÃO DA SILVA AÇÚCAR</xNome>
        <enderDest>
          <xLgr>RUA SÃO JOÃO</xLgr>
          <nro>123</nro>
          <xBairro>CENTRO</xBairro>
          <xMun>SÃO PAULO</xMun>
          <UF>SP</UF>
          <CEP>01000000</CEP>
        </enderDest>
      </dest>
      <det nItem="1">
        <prod>
          <cProd>SKU-ACU-01</cProd>
          <xProd>LUMINÁRIA DE MESA</xProd>
          <cEAN>SEM GTIN</cEAN>
          <qCom>1.0000</qCom>
          <uCom>UN</uCom>
        </prod>
      </det>
      <total>
        <ICMSTot>
          <vNF>199.90</vNF>
        </ICMSTot>
      </total>
    </infNFe>
  </NFe>
</nfeProc>
`;

const buf = Buffer.from(xml, 'latin1');
const outPath = new URL('./nfe-saida-latin1.xml', import.meta.url);
writeFileSync(outPath, buf);
console.log(`Fixture gerada: ${buf.length} bytes (ISO-8859-1).`);
