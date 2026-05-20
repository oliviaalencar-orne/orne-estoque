/**
 * nfeXmlParser.js — Parser de NF-e (padrão SEFAZ) para fluxo de Import XML.
 *
 * Lê arquivos XML no formato <nfeProc> ou <NFe> e extrai dados necessários
 * para criar uma Separation/Shipping/Devolução: chave de acesso, número,
 * data, tpNF, refNFe, cliente, destino, produtos e valor total.
 *
 * Segurança:
 *  - Rejeita qualquer XML com declaração DOCTYPE ou ENTITY (defesa contra XXE).
 *    fast-xml-parser por padrão já não resolve entidades externas, este é um
 *    guard adicional de defesa em profundidade.
 *  - Não processa CDATA como markup.
 *
 * Validação do DV da chave de acesso:
 *  - Algoritmo Módulo 11 sobre os 43 primeiros dígitos, pesos 2..9 cíclicos
 *    da direita para a esquerda. Manual SEFAZ:
 *    https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=W0XGhf/7nOg=
 *  - DV inválido NÃO bloqueia o parse — retorna chaveValida=false e a UI
 *    decide (amarelo/aviso).
 *
 * Funções de match (exportadas para uso pelos importadores):
 *  - matchPermissivo: 4 níveis em cascata (exato → normalizado → EAN → substring).
 *    Preserva comportamento histórico do fluxo de saída.
 *  - matchConservador: apenas exato lowercased. Reservado para devolução (3.1)
 *    onde falso positivo é grave (estoque errado).
 */

import { XMLParser } from 'fast-xml-parser';

const PORTAL_NS = 'http://www.portalfiscal.inf.br/nfe';

export const PARSER_ERRORS = Object.freeze({
  XML_VAZIO: 'XML vazio ou inválido',
  XXE_DETECTED: 'XML contém declaração DOCTYPE/ENTITY (não suportado por segurança)',
  XML_MALFORMED: 'XML mal formado',
  NFE_TAG_MISSING: 'Tag <NFe> ou <nfeProc> não encontrada',
  NAMESPACE_INVALID: `Namespace NF-e ausente (esperado ${PORTAL_NS})`,
  CHAVE_MISSING: 'Chave de acesso não encontrada',
  PRODUTOS_VAZIOS: 'NF sem produtos',
});

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: true,
});

/**
 * Valida o dígito verificador (último dos 44 dígitos) da chave de acesso
 * NF-e via Módulo 11.
 *
 * @param {string} chave — 44 dígitos numéricos
 * @returns {boolean} true se o DV bate com os 43 primeiros dígitos
 */
export function validarDvChaveAcesso(chave) {
  if (!chave || typeof chave !== 'string') return false;
  if (!/^\d{44}$/.test(chave)) return false;
  const digitos = chave.slice(0, 43);
  const dvInformado = Number(chave[43]);
  let soma = 0;
  let peso = 2;
  for (let i = digitos.length - 1; i >= 0; i--) {
    soma += Number(digitos[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  const dvCalc = resto < 2 ? 0 : 11 - resto;
  return dvCalc === dvInformado;
}

function toArray(x) {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

function parseNumero(str) {
  if (str == null) return null;
  const n = Number(String(str).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function asString(v) {
  if (v == null) return '';
  return String(v);
}

/**
 * A chave pode vir em dois lugares:
 *  1. Atributo Id do <infNFe>: "NFe" + 44 dígitos
 *  2. Tag <chNFe> dentro de <protNFe><infProt> (só em XMLs com nfeProc)
 */
function extrairChave(infNFeNode, nfeProcNode) {
  const rawId = infNFeNode?.['@_Id'];
  if (typeof rawId === 'string') {
    const m = rawId.match(/NFe(\d{44})/);
    if (m) return m[1];
  }
  const chNFe = nfeProcNode?.protNFe?.infProt?.chNFe;
  if (chNFe != null) {
    const s = String(chNFe).trim();
    if (/^\d{44}$/.test(s)) return s;
  }
  return null;
}

/**
 * Extrai a chave da NF-e referenciada (usada em devoluções).
 *  - Primário: <ide><NFref><refNFe> (pode ser único ou array)
 *  - Fallback: regex /\d{44}/ em <infAdic><infCpl> (texto livre)
 *
 * Retorna null quando nenhuma referência válida é encontrada — é o caso
 * esperado em NFs de saída (sem documento anterior referenciado).
 */
function extrairRefNFe(ide, infAdic) {
  const NFrefArr = toArray(ide?.NFref);
  for (const nfRef of NFrefArr) {
    const ref = nfRef?.refNFe;
    if (ref != null) {
      const s = String(ref).trim();
      if (/^\d{44}$/.test(s)) return s;
    }
  }
  const cpl = infAdic?.infCpl;
  if (cpl != null) {
    const m = String(cpl).match(/(\d{44})/);
    if (m) return m[1];
  }
  return null;
}

/**
 * Normaliza EAN: descarta "SEM GTIN" (convenção SEFAZ para itens sem EAN)
 * e remove qualquer não-dígito. Retorna string vazia se ausente ou inválido.
 */
function normalizarEan(cEAN) {
  if (cEAN == null) return '';
  const s = String(cEAN).trim();
  if (s === '' || s.toUpperCase() === 'SEM GTIN') return '';
  return s.replace(/[^0-9]/g, '');
}

function fail(erro) {
  return { sucesso: false, dados: null, erro };
}

/**
 * Parseia uma string XML de NF-e e extrai os dados para criação de
 * Separation, Shipping ou Devolução.
 *
 * @param {string} xmlString
 * @returns {{
 *   sucesso: boolean,
 *   erro: string|null,
 *   dados: {
 *     chaveAcesso: string,
 *     chaveValida: boolean,
 *     numeroNf: string,
 *     dataEmissao: string|null,
 *     tpNF: number|null,
 *     refNFe: string|null,
 *     cliente: { nome: string, cpf: string|null, cnpj: string|null },
 *     destino: {
 *       logradouro: string, numero: string, complemento: string,
 *       bairro: string, municipio: string, uf: string, cep: string
 *     },
 *     produtos: Array<{ sku: string, descricao: string, quantidade: number, unidade: string, ean: string }>,
 *     valorTotal: number,
 *   }|null
 * }}
 */
export function parseNfeXml(xmlString) {
  if (!xmlString || typeof xmlString !== 'string' || xmlString.trim() === '') {
    return fail(PARSER_ERRORS.XML_VAZIO);
  }

  if (/<!DOCTYPE|<!ENTITY/i.test(xmlString)) {
    return fail(PARSER_ERRORS.XXE_DETECTED);
  }

  let doc;
  try {
    doc = parser.parse(xmlString);
  } catch (e) {
    return fail(`${PARSER_ERRORS.XML_MALFORMED}: ${e.message}`);
  }

  const nfeProc = doc?.nfeProc;
  const nfe = nfeProc?.NFe || doc?.NFe;
  if (!nfe) return fail(PARSER_ERRORS.NFE_TAG_MISSING);

  const infNFe = nfe.infNFe;
  if (!infNFe) return fail(PARSER_ERRORS.NFE_TAG_MISSING);

  const nsProc = nfeProc?.['@_xmlns'];
  const nsNfe = nfe?.['@_xmlns'];
  if (nsProc !== PORTAL_NS && nsNfe !== PORTAL_NS) {
    return fail(PARSER_ERRORS.NAMESPACE_INVALID);
  }

  const chaveAcesso = extrairChave(infNFe, nfeProc);
  if (!chaveAcesso) return fail(PARSER_ERRORS.CHAVE_MISSING);
  const chaveValida = validarDvChaveAcesso(chaveAcesso);

  const ide = infNFe.ide || {};
  const numeroNf = asString(ide.nNF);
  const dataEmissao = ide.dhEmi || ide.dEmi || null;
  const tpNFRaw = ide.tpNF;
  const tpNF = tpNFRaw != null && tpNFRaw !== '' ? Number(tpNFRaw) : null;
  const refNFe = extrairRefNFe(ide, infNFe.infAdic);

  const dest = infNFe.dest || {};
  const cliente = {
    nome: asString(dest.xNome),
    cpf: dest.CPF != null ? asString(dest.CPF) : null,
    cnpj: dest.CNPJ != null ? asString(dest.CNPJ) : null,
  };

  const ed = dest.enderDest || {};
  const destino = {
    logradouro: asString(ed.xLgr),
    numero: asString(ed.nro),
    complemento: asString(ed.xCpl),
    bairro: asString(ed.xBairro),
    municipio: asString(ed.xMun),
    uf: asString(ed.UF),
    cep: asString(ed.CEP),
  };

  const dets = toArray(infNFe.det);
  const produtos = dets.map((det) => {
    const p = det?.prod || {};
    return {
      sku: asString(p.cProd),
      descricao: asString(p.xProd),
      quantidade: parseNumero(p.qCom) ?? 0,
      unidade: asString(p.uCom),
      ean: normalizarEan(p.cEAN),
    };
  });

  if (produtos.length === 0) return fail(PARSER_ERRORS.PRODUTOS_VAZIOS);

  const valorTotal = parseNumero(infNFe.total?.ICMSTot?.vNF) ?? 0;

  return {
    sucesso: true,
    erro: null,
    dados: {
      chaveAcesso,
      chaveValida,
      numeroNf,
      dataEmissao,
      tpNF,
      refNFe,
      cliente,
      destino,
      produtos,
      valorTotal,
    },
  };
}

// ─── Funções de match ──────────────────────────────────────────────────────

const SKU_SUBSTRING_MIN_LEN = 5;

function normalizarSku(s) {
  return (s || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizarEanProduto(s) {
  return (s || '').trim().replace(/[^0-9]/g, '');
}

/**
 * matchPermissivo — porta do `encontrarProdutoEstoque` / inline match em
 * `ShippingXMLImport.jsx`. Usado pelo fluxo de saída.
 *
 * Cascata (primeiro match vence):
 *  1. SKU exato lowercased
 *  2. SKU normalizado (apenas alfanuméricos lowercased)
 *  3. EAN normalizado (apenas dígitos, quando ambos têm EAN)
 *  4. Substring SKU normalizado (quando ambos ≥ 5 chars normalizados)
 *
 * @param {{sku: string, ean?: string}} produtoXml — produto extraído pelo parser
 * @param {Array<{sku: string, ean?: string}>} produtosEstoque
 * @returns {object|null} produto do estoque, ou null se nenhum casar
 */
export function matchPermissivo(produtoXml, produtosEstoque) {
  if (!produtoXml || !Array.isArray(produtosEstoque)) return null;
  const skuOriginal = (produtoXml.sku || '').trim();
  const skuLower = skuOriginal.toLowerCase();
  const skuNorm = normalizarSku(skuOriginal);
  const eanNorm = normalizarEanProduto(produtoXml.ean);

  for (const p of produtosEstoque) {
    if (!p) continue;
    const pSkuOriginal = (p.sku || '').trim();
    const pSkuLower = pSkuOriginal.toLowerCase();
    const pSkuNorm = normalizarSku(pSkuOriginal);
    const pEan = normalizarEanProduto(p.ean);

    if (pSkuLower && skuLower && pSkuLower === skuLower) return p;
    if (pSkuNorm && skuNorm && pSkuNorm === skuNorm) return p;
    if (pEan && eanNorm && pEan === eanNorm) return p;
    if (pSkuNorm.length >= SKU_SUBSTRING_MIN_LEN && skuNorm.length >= SKU_SUBSTRING_MIN_LEN) {
      if (pSkuNorm.includes(skuNorm) || skuNorm.includes(pSkuNorm)) return p;
    }
  }
  return null;
}

/**
 * matchConservador — porta de `buildProdutoLinha` em `XMLNFeImport.jsx`.
 * Reservado para fluxo de devolução (Sub-frente 3.1) onde falso positivo é
 * grave (lançaria entrada em estoque errado).
 *
 * Regra única: SKU exato lowercased. Retorna TODOS os matches para o caller
 * decidir (0 = não encontrado, 1 = auto-vincular, N>1 = ambiguidade →
 * modal de resolução).
 *
 * @param {{sku: string}} produtoXml
 * @param {Array<{sku: string}>} produtosEstoque
 * @returns {Array<object>} matches (pode ser vazio)
 */
export function matchConservador(produtoXml, produtosEstoque) {
  if (!produtoXml || !Array.isArray(produtosEstoque)) return [];
  const skuBusca = (produtoXml.sku || '').toLowerCase();
  if (!skuBusca) return [];
  return produtosEstoque.filter(p => p && (p.sku || '').toLowerCase() === skuBusca);
}
