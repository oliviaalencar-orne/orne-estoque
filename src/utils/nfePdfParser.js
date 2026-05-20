/**
 * nfePdfParser.js — Parser de PDF de NF-e (DANFE) para fluxo de Import.
 *
 * Lê PDF via `pdfjs-dist`, extrai texto bruto e aplica regex para
 * recuperar os campos visíveis no DANFE: número da NF, nome do
 * destinatário, partes do endereço (bairro, município, UF, CEP) e
 * produtos (SKU, descrição, quantidade, unidade).
 *
 * Limitações estruturais (PDF é layout, não dados):
 *  - `chaveAcesso`/`chaveValida` não extraíveis com confiança a partir do
 *    texto extraído pelo pdfjs (vem fragmentado).
 *  - `tpNF`, `refNFe`, `dataEmissao`, `valorTotal`, `cpf`/`cnpj` —
 *    distinção entre dest/emit é frágil no texto livre; preferimos
 *    devolver nulo/zero do que adivinhar.
 *
 * Formato de saída idêntico ao `parseNfeXml` para que o caller possa
 * tratar XML e PDF uniformemente. Match contra estoque é responsabilidade
 * do caller (usa `matchPermissivo` exportado de `nfeXmlParser.js`).
 */

import * as pdfjsLib from 'pdfjs-dist';

export const PDF_PARSER_ERRORS = Object.freeze({
  PDF_VAZIO: 'PDF vazio ou inválido',
  PDF_MALFORMED: 'Erro ao ler PDF',
  PDF_SEM_DADOS: 'Não foi possível extrair dados do PDF — preencha manualmente',
});

const MAX_PRODUTOS = 50;

function fail(erro) {
  return { sucesso: false, dados: null, erro };
}

async function fileParaArrayBuffer(file) {
  if (file instanceof ArrayBuffer) return file;
  if (file && typeof file.arrayBuffer === 'function') return await file.arrayBuffer();
  return null;
}

async function extrairTextoPdf(buffer) {
  const typedArray = new Uint8Array(buffer);
  const pdf = await pdfjsLib.getDocument(typedArray).promise;
  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    fullText += textContent.items.map((item) => item.str).join(' ') + '\n';
  }
  return fullText;
}

function extrairNumeroNf(fullText) {
  const patterns = [
    /N[ºo°]\s*(\d{3}\.\d{3}|\d{6})/i,
    /NF-?e?\s*N[ºo°]?\s*(\d{3}\.\d{3}|\d{6})/i,
    /Nº\s*(\d{3}\.\d{3})/,
    /(\d{3}\.\d{3})\s*S[ée]rie/i,
    /FOLHA.*?(\d{3}\.\d{3})/i,
  ];
  for (const pattern of patterns) {
    const match = fullText.match(pattern);
    if (match) return match[1].replace(/\./g, '');
  }
  return '';
}

function extrairNomeCliente(fullText) {
  const patterns = [
    /NOME\s*\/?\s*RAZ[ÃA]O\s*SOCIAL\s+([A-Za-záéíóúâêôãõçÁÉÍÓÚÂÊÔÃÕÇ\s]+?)(?=\s*(?:CNP[JF]|CPF|CNPJ\/CPF|DATA|ENDERE))/i,
    /DESTINAT[ÁA]RIO\s*\/?\s*REMETENTE\s+NOME\s*\/?\s*RAZ[ÃA]O\s*SOCIAL\s+([A-Za-záéíóúâêôãõçÁÉÍÓÚÂÊÔÃÕÇ\s]+)/i,
    /RAZ[ÃA]O\s*SOCIAL\s+([A-Za-záéíóúâêôãõçÁÉÍÓÚÂÊÔÃÕÇ\s]{5,50})/i,
  ];
  for (const pattern of patterns) {
    const match = fullText.match(pattern);
    if (match) return match[1].trim().replace(/\s+/g, ' ');
  }
  return '';
}

function extrairDestino(fullText) {
  const destino = {
    logradouro: '',
    numero: '',
    complemento: '',
    bairro: '',
    municipio: '',
    uf: '',
    cep: '',
  };
  const endMatch = fullText.match(/ENDERE[ÇC]O\s+([^]+?)(?=BAIRRO|MUNIC[ÍI]PIO|CEP|\d{2}\.\d{3}-?\d{3})/i);
  if (endMatch) {
    destino.logradouro = endMatch[1].trim().replace(/\s+/g, ' ').substring(0, 100);
  }
  const bairroMatch = fullText.match(/BAIRRO\s+([A-Za-záéíóúâêôãõçÁÉÍÓÚÂÊÔÃÕÇ\s]+?)(?=\s*(?:CEP|FONE|MUNIC))/i);
  if (bairroMatch) destino.bairro = bairroMatch[1].trim();
  const munMatch = fullText.match(/MUNIC[ÍI]PIO\s+([A-Za-záéíóúâêôãõçÁÉÍÓÚÂÊÔÃÕÇ\s]+?)(?=\s*(?:FONE|UF|\(|\d))/i);
  if (munMatch) destino.municipio = munMatch[1].trim();
  const ufMatch = fullText.match(/\bUF\s+([A-Z]{2})\b/i);
  if (ufMatch) destino.uf = ufMatch[1].toUpperCase();
  const cepMatch = fullText.match(/CEP\s*(\d{2}\.?\d{3}-?\d{3})/i) || fullText.match(/(\d{2}\.\d{3}-\d{3})/);
  if (cepMatch) destino.cep = cepMatch[1];
  return destino;
}

function extrairProdutos(fullText) {
  const produtos = [];
  const prodPattern = /([A-Z0-9]{6,15})\s+([A-Za-záéíóúâêôãõçÁÉÍÓÚÂÊÔÃÕÇ0-9\s\-\.]+?)\s+(\d{8})\s+(\d{4})\s+(\d\.\d{3})\s+(UN|PC|PÇ|KG|CX|PCT|M2|M|LT)\s+(\d+[,.]?\d*)/gi;
  let match;
  while ((match = prodPattern.exec(fullText)) !== null && produtos.length < MAX_PRODUTOS) {
    const qtd = parseFloat(match[7].replace(',', '.'));
    produtos.push({
      sku: match[1].trim(),
      descricao: match[2].trim().replace(/\s+/g, ' '),
      quantidade: Number.isFinite(qtd) ? qtd : 1,
      unidade: match[6],
      ean: '',
    });
  }
  if (produtos.length === 0) {
    const altPattern = /C[ÓO]DIGO\s+([A-Z0-9]+)\s+.*?DESCRI[ÇC][ÃA]O[^A-Z]*([A-Za-záéíóúâêôãõç\s\-]{5,60}).*?QUANT[^\d]*(\d+)/gi;
    while ((match = altPattern.exec(fullText)) !== null && produtos.length < MAX_PRODUTOS) {
      const qtd = parseInt(match[3], 10);
      produtos.push({
        sku: match[1].trim(),
        descricao: match[2].trim(),
        quantidade: Number.isFinite(qtd) ? qtd : 1,
        unidade: '',
        ean: '',
      });
    }
  }
  return produtos;
}

/**
 * Parseia um PDF de NF-e (DANFE) e devolve estrutura compatível com
 * `parseNfeXml`. Campos não-extraíveis vêm vazios/null por contrato.
 *
 * @param {File|Blob|ArrayBuffer} file
 * @returns {Promise<{
 *   sucesso: boolean,
 *   erro: string|null,
 *   dados: object|null
 * }>}
 */
export async function parsePdfNfe(file) {
  const buffer = await fileParaArrayBuffer(file);
  if (!buffer) return fail(PDF_PARSER_ERRORS.PDF_VAZIO);

  let fullText;
  try {
    fullText = await extrairTextoPdf(buffer);
  } catch (e) {
    return fail(`${PDF_PARSER_ERRORS.PDF_MALFORMED}: ${e.message}`);
  }

  const numeroNf = extrairNumeroNf(fullText);
  const clienteNome = extrairNomeCliente(fullText);
  const destino = extrairDestino(fullText);
  const produtos = extrairProdutos(fullText);

  const algumDado = numeroNf || clienteNome || destino.bairro || destino.municipio || produtos.length > 0;
  if (!algumDado) return fail(PDF_PARSER_ERRORS.PDF_SEM_DADOS);

  return {
    sucesso: true,
    erro: null,
    dados: {
      chaveAcesso: '',
      chaveValida: false,
      numeroNf,
      dataEmissao: null,
      tpNF: null,
      refNFe: null,
      cliente: { nome: clienteNome, cpf: null, cnpj: null },
      destino,
      produtos,
      valorTotal: 0,
    },
  };
}
