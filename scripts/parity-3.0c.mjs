/**
 * parity-3.0c.mjs — Suite de paridade do refactor de parser (Sub-frente 3.0c).
 *
 * Compara, para cada XML real do inventário 3.0c, a saída do parser legado
 * (inline em `ShippingXMLImport.jsx` pré-refactor) versus a saída do parser
 * unificado (`parseNfeXml` + `matchPermissivo` em `nfeXmlParser.js`).
 *
 * NOTA TÉCNICA sobre a "reimplementação legacy":
 *   O parser legado usava `DOMParser` (API de browser), inacessível em Node
 *   sem jsdom (nova dependência). Para evitar instalar jsdom apenas para a
 *   suite de paridade, este script reimplementa a lógica inline usando
 *   `fast-xml-parser` (já presente no projeto). A reimplementação foi
 *   validada por leitura LADO A LADO do código pré-refactor (commit 7420cc6,
 *   ShippingXMLImport.jsx linhas 14-133 da função `processarXML`):
 *     - mesmos selectors de tag (nNF, xNome, det.prod.cProd, etc.)
 *     - mesmo fallback `infProt.nProt` quando nNF ausente
 *     - mesma concatenação de destino
 *     - mesma cascata de matching (4 níveis: exato → normalizado → EAN → substring)
 *     - mesma normalização "SEM GTIN" → ''
 *     - mesma conversão `parseInt(parseFloat(qCom)) || 1` para quantidade
 *   Risco residual: divergência teórica entre DOMParser e fast-xml-parser
 *   em XMLs com estrutura não-padrão (namespace múltiplo, CDATA, etc.).
 *   Mitigação: todos os 16 XMLs do inventário são SEFAZ 4.00 padrão,
 *   verificados como estruturalmente consistentes pelo relatório de
 *   inspeção 18/05/2026 (inventario-xmls-3.0c.md §6).
 *
 * Whitelist (CP1 aprovada 20/05/2026): W1, W2, W3, W5, W6, W7, W8 aceitas;
 * W4 verificada empiricamente (todos qCom = 1.0000, nenhum fracionário).
 *
 * Saída esperada para CP2 verde:
 *   - 16/16 XMLs reais com paridade total
 *   - 1 fixture Latin-1 com robustez confirmada (acentos preservados)
 *   - 0 diffs fora da whitelist
 *   - 0 erros técnicos
 *
 * Uso: `node scripts/parity-3.0c.mjs`
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { parseNfeXml, matchPermissivo } from '../src/utils/nfeXmlParser.js';

const XML_BASE = 'C:/Users/Olivia/Documents/orne-xmls-coleta-3.0c';
const FIXTURE_LATIN1 = 'tests/fixtures/nfe-saida-latin1.xml';
const SUBDIRS = ['01-xml-saida-comum', '04-xml-saida-cfop-borda', '05-xml-devolucao'];

// ─── Reimplementação fiel do parser legado ─────────────────────────────────

const legacyParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: true,
});

function legacyParseXml(xmlText) {
  const doc = legacyParser.parse(xmlText);
  const nfeProc = doc?.nfeProc;
  const nfe = nfeProc?.NFe || doc?.NFe;
  const infNFe = nfe?.infNFe;
  if (!infNFe) throw new Error('Erro ao ler XML (estrutura inválida)');

  const ide = infNFe.ide || {};
  let nNF = ide.nNF != null ? String(ide.nNF) : '';
  if (!nNF) {
    const infProt = nfeProc?.protNFe?.infProt;
    nNF = infProt?.nProt != null ? String(infProt.nProt) : '';
  }

  const dest = infNFe.dest || {};
  const ed = dest.enderDest || {};
  const xNome = dest.xNome != null ? String(dest.xNome) : '';
  const xLgr = ed.xLgr != null ? String(ed.xLgr) : '';
  const nro = ed.nro != null ? String(ed.nro) : '';
  const xBairro = ed.xBairro != null ? String(ed.xBairro) : '';
  const xMun = ed.xMun != null ? String(ed.xMun) : '';
  const UF = ed.UF != null ? String(ed.UF) : '';
  const CEP = ed.CEP != null ? String(ed.CEP) : '';

  let destino = '';
  if (xLgr) destino += xLgr;
  if (nro) destino += `, ${nro}`;
  if (xBairro) destino += ` - ${xBairro}`;
  if (xMun) destino += ` - ${xMun}`;
  if (UF) destino += `/${UF}`;
  if (CEP) destino += ` - CEP: ${CEP}`;

  const detsArr = Array.isArray(infNFe.det) ? infNFe.det : (infNFe.det ? [infNFe.det] : []);
  const produtosLegacy = detsArr.map((det) => {
    const p = det?.prod || {};
    const cProd = p.cProd != null ? String(p.cProd) : '';
    const xProd = p.xProd != null ? String(p.xProd) : '';
    const qCom = p.qCom != null ? String(p.qCom) : '1';
    const cEAN = p.cEAN != null ? String(p.cEAN) : '';
    const skuNF = cProd.trim();
    const eanNormalizado = cEAN && cEAN !== 'SEM GTIN' ? cEAN.trim().replace(/[^0-9]/g, '') : '';
    return {
      cProd,
      xProd,
      quantidade: parseInt(parseFloat(qCom)) || 1,
      ean: eanNormalizado,
      _skuRaw: skuNF,
      _eanForMatch: eanNormalizado,
    };
  });

  return { nNF, xNome, destino, produtosLegacy };
}

function legacyMatch(skuNF, eanNormalizado, stock) {
  const skuNormalizado = skuNF.toLowerCase().replace(/[^a-z0-9]/g, '');
  return stock.find((p) => {
    const pSku = (p.sku || '').trim();
    const pSkuNorm = pSku.toLowerCase().replace(/[^a-z0-9]/g, '');
    const pEan = (p.ean || '').trim().replace(/[^0-9]/g, '');
    if (pSku.toLowerCase() === skuNF.toLowerCase()) return true;
    if (pSkuNorm && skuNormalizado && pSkuNorm === skuNormalizado) return true;
    if (pEan && eanNormalizado && pEan === eanNormalizado) return true;
    if (pSkuNorm.length >= 5 && skuNormalizado.length >= 5) {
      if (pSkuNorm.includes(skuNormalizado) || skuNormalizado.includes(pSkuNorm)) return true;
    }
    return false;
  });
}

function legacyProcessar(xmlText, stock, fileName, locaisOrigem) {
  const parsed = legacyParseXml(xmlText);
  const produtos = parsed.produtosLegacy.map((p) => {
    const produtoEncontrado = legacyMatch(p._skuRaw, p._eanForMatch, stock);
    return {
      sku: p.cProd,
      nome: p.xProd,
      quantidade: p.quantidade,
      ean: p.ean,
      baixarEstoque: false,
      produtoEstoque: produtoEncontrado || null,
      autoVinculado: !!produtoEncontrado,
    };
  });
  return {
    fileName,
    nfNumero: parsed.nNF,
    cliente: parsed.xNome,
    destino: parsed.destino,
    produtos,
    localOrigem: locaisOrigem[0] || 'Loja Principal',
    transportadora: '',
    codigoRastreio: '',
    linkRastreio: '',
    melhorEnvioId: '',
    observacoes: '',
    status: 'DESPACHADO',
    selected: true,
    vinculados: produtos.filter((p) => p.autoVinculado).length,
    total: produtos.length,
  };
}

// ─── Caller refatorado (espelho exato do que ShippingXMLImport.jsx faz) ────

// Espelha fmtDestinoShipping em ShippingXMLImport.jsx (formato legacy exato).
function fmtDestinoShipping(d) {
  if (!d) return '';
  let s = '';
  if (d.logradouro) s += d.logradouro;
  if (d.numero) s += `, ${d.numero}`;
  if (d.bairro) s += ` - ${d.bairro}`;
  if (d.municipio) s += ` - ${d.municipio}`;
  if (d.uf) s += `/${d.uf}`;
  if (d.cep) s += ` - CEP: ${d.cep}`;
  return s;
}

function novoProcessar(xmlText, stock, fileName, locaisOrigem) {
  const r = parseNfeXml(xmlText);
  if (!r.sucesso) throw new Error(r.erro);
  const produtos = r.dados.produtos.map((p) => {
    const produtoEncontrado = matchPermissivo(p, stock);
    return {
      sku: p.sku,
      nome: p.descricao,
      quantidade: Math.max(1, Math.round(p.quantidade ?? 1)),
      ean: p.ean || '',
      baixarEstoque: false,
      produtoEstoque: produtoEncontrado || null,
      autoVinculado: !!produtoEncontrado,
    };
  });
  return {
    fileName,
    nfNumero: r.dados.numeroNf,
    cliente: r.dados.cliente.nome,
    destino: fmtDestinoShipping(r.dados.destino),
    produtos,
    localOrigem: locaisOrigem[0] || 'Loja Principal',
    transportadora: '',
    codigoRastreio: '',
    linkRastreio: '',
    melhorEnvioId: '',
    observacoes: '',
    status: 'DESPACHADO',
    selected: true,
    vinculados: produtos.filter((p) => p.autoVinculado).length,
    total: produtos.length,
  };
}

// ─── Comparação aplicando whitelist ────────────────────────────────────────

function compareDespachos(legacy, novo) {
  const diffs = [];
  if (legacy.nfNumero !== novo.nfNumero) {
    diffs.push({ field: 'nfNumero', legacy: legacy.nfNumero, novo: novo.nfNumero });
  }
  if (legacy.cliente !== novo.cliente) {
    diffs.push({ field: 'cliente', legacy: legacy.cliente, novo: novo.cliente });
  }
  if (legacy.destino !== novo.destino) {
    diffs.push({ field: 'destino', legacy: legacy.destino, novo: novo.destino });
  }
  if (legacy.total !== novo.total) {
    diffs.push({ field: 'total', legacy: legacy.total, novo: novo.total });
  }
  if (legacy.vinculados !== novo.vinculados) {
    diffs.push({ field: 'vinculados', legacy: legacy.vinculados, novo: novo.vinculados });
  }
  for (let i = 0; i < legacy.produtos.length; i++) {
    const lp = legacy.produtos[i];
    const np = novo.produtos[i];
    if (!np) {
      diffs.push({ field: `produtos[${i}]`, legacy: '(presente)', novo: '(ausente)' });
      continue;
    }
    // W3 — comparar SKU já trimmed em ambos
    if (lp.sku.trim() !== np.sku.trim()) {
      diffs.push({ field: `produtos[${i}].sku (trim)`, legacy: lp.sku, novo: np.sku });
    }
    if (lp.nome !== np.nome) {
      diffs.push({ field: `produtos[${i}].nome`, legacy: lp.nome, novo: np.nome });
    }
    if (lp.quantidade !== np.quantidade) {
      diffs.push({ field: `produtos[${i}].quantidade`, legacy: lp.quantidade, novo: np.quantidade });
    }
    if (lp.ean !== np.ean) {
      diffs.push({ field: `produtos[${i}].ean`, legacy: lp.ean, novo: np.ean });
    }
    if (lp.autoVinculado !== np.autoVinculado) {
      diffs.push({ field: `produtos[${i}].autoVinculado`, legacy: lp.autoVinculado, novo: np.autoVinculado });
    }
  }
  return diffs;
}

function buildStockFromLegacy(legacyParsed) {
  return legacyParsed.produtosLegacy.map((p, i) => ({
    sku: p.cProd,
    ean: p.ean || `EAN-FAKE-${i}`,
    name: p.xProd,
  }));
}

function listarXmls() {
  const files = [];
  for (const sub of SUBDIRS) {
    const full = path.join(XML_BASE, sub);
    for (const f of readdirSync(full)) {
      if (f.endsWith('.xml')) {
        files.push({ name: f, path: path.join(full, f), categoria: sub });
      }
    }
  }
  return files;
}

// ─── Execução ──────────────────────────────────────────────────────────────

const xmls = listarXmls();
console.log(`\nSuite de paridade Sub-frente 3.0c — ${xmls.length} XMLs reais\n${'─'.repeat(72)}`);
let totalOk = 0;
let totalDiff = 0;
let totalErr = 0;

for (const xml of xmls) {
  const xmlText = readFileSync(xml.path, 'utf-8');
  let legacy;
  let novo;
  try {
    const parsedLegacy = legacyParseXml(xmlText);
    const stock = buildStockFromLegacy(parsedLegacy);
    legacy = legacyProcessar(xmlText, stock, xml.name, ['Loja Principal']);
    novo = novoProcessar(xmlText, stock, xml.name, ['Loja Principal']);
  } catch (e) {
    console.log(`❌ [${xml.categoria}/${xml.name}] erro técnico: ${e.message}`);
    totalErr++;
    continue;
  }
  const diffs = compareDespachos(legacy, novo);
  if (diffs.length === 0) {
    console.log(`✅ [${xml.categoria}/${xml.name}] paridade total`);
    totalOk++;
  } else {
    console.log(`⚠️  [${xml.categoria}/${xml.name}] diff fora whitelist:`);
    for (const d of diffs) {
      console.log(`    ${d.field}: legacy=${JSON.stringify(d.legacy)} | novo=${JSON.stringify(d.novo)}`);
    }
    totalDiff++;
  }
}

// ─── Robustez Latin-1 ──────────────────────────────────────────────────────

console.log(`\n─── Robustez Latin-1 ───`);
try {
  const buf = readFileSync(FIXTURE_LATIN1);
  const sample = new TextDecoder('ascii', { fatal: false }).decode(
    buf.slice(0, Math.min(256, buf.byteLength))
  );
  const m = sample.match(/<\?xml[^>]+encoding=["']([^"']+)["']/i);
  const encDeclarado = m ? m[1].toLowerCase() : 'utf-8';
  const enc =
    encDeclarado === 'iso-8859-1' || encDeclarado === 'latin1' || encDeclarado === 'latin-1'
      ? 'iso-8859-1'
      : encDeclarado === 'windows-1252' || encDeclarado === 'cp1252'
      ? 'windows-1252'
      : 'utf-8';
  const text = new TextDecoder(enc, { fatal: false }).decode(buf);
  const r = parseNfeXml(text);
  if (!r.sucesso) {
    console.log(`❌ Latin-1 fixture: parser falhou — ${r.erro}`);
    totalErr++;
  } else {
    const cliente = r.dados.cliente.nome;
    const municipio = r.dados.destino.municipio;
    const xProd = r.dados.produtos[0]?.descricao || '';
    const hasJoao = cliente.includes('JOÃO');
    const hasSaoPaulo = municipio.includes('SÃO PAULO');
    const hasLuminaria = xProd.includes('LUMINÁRIA');
    if (hasJoao && hasSaoPaulo && hasLuminaria) {
      console.log(`✅ Latin-1 fixture: acentos preservados`);
      console.log(`   cliente="${cliente}"`);
      console.log(`   município="${municipio}"`);
      console.log(`   xProd="${xProd}"`);
      totalOk++;
    } else {
      console.log(`⚠️  Latin-1 fixture: acentos corrompidos`);
      console.log(`   cliente="${cliente}" (esperado conter JOÃO: ${hasJoao})`);
      console.log(`   município="${municipio}" (esperado conter SÃO PAULO: ${hasSaoPaulo})`);
      console.log(`   xProd="${xProd}" (esperado conter LUMINÁRIA: ${hasLuminaria})`);
      totalDiff++;
    }
  }
} catch (e) {
  console.log(`❌ Latin-1 fixture: erro técnico — ${e.message}`);
  totalErr++;
}

console.log(`\n=== Resumo ===`);
console.log(`✅ Paridade total: ${totalOk}`);
console.log(`⚠️  Diff fora whitelist: ${totalDiff}`);
console.log(`❌ Erros técnicos: ${totalErr}`);
console.log(``);
process.exit(totalDiff + totalErr === 0 ? 0 : 1);
