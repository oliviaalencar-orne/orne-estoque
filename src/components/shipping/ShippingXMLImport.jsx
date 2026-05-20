/**
 * ShippingXMLImport.jsx — Importação single de XML/PDF de NF-e para Shipping.
 *
 * Refatorado na Sub-frente 3.0c: parsing delegado a `nfeXmlParser.js`
 * (canônico, fast-xml-parser) e `nfePdfParser.js` (pdfjs + regex).
 * O componente faz apenas: leitura do arquivo, dispatch por extensão,
 * match contra estoque via `matchPermissivo`, montagem do shape do form.
 *
 * Encoding (CP1, caminho A): lê como ArrayBuffer, detecta encoding declarado
 * no header XML (~256 primeiros bytes) e decodifica via TextDecoder.
 * Suporta 'utf-8', 'iso-8859-1', 'windows-1252'.
 */
import React from 'react';
import { Icon } from '@/utils/icons';
import { parseNfeXml, matchPermissivo } from '@/utils/nfeXmlParser';
import { parsePdfNfe } from '@/utils/nfePdfParser';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const SAMPLE_HEADER_BYTES = 256;

function detectarEncoding(buffer) {
  const sample = new TextDecoder('ascii', { fatal: false }).decode(
    buffer.slice(0, Math.min(SAMPLE_HEADER_BYTES, buffer.byteLength))
  );
  const m = sample.match(/<\?xml[^>]+encoding=["']([^"']+)["']/i);
  if (!m) return 'utf-8';
  const enc = m[1].toLowerCase().trim();
  if (enc === 'utf-8' || enc === 'utf8') return 'utf-8';
  if (enc === 'iso-8859-1' || enc === 'latin1' || enc === 'latin-1') return 'iso-8859-1';
  if (enc === 'windows-1252' || enc === 'cp1252') return 'windows-1252';
  return 'utf-8';
}

async function lerXmlComEncoding(file) {
  const buffer = await file.arrayBuffer();
  const encoding = detectarEncoding(buffer);
  return new TextDecoder(encoding, { fatal: false }).decode(buffer);
}

/**
 * fmtDestinoShipping — formata destino estruturado como string concatenada,
 * preservando EXATAMENTE o formato que o parser inline pré-refactor
 * produzia ("xLgr, nro - xBairro - xMun/UF - CEP: ..."). Sem complemento
 * (`xCpl`) porque o legacy não lia esse campo.
 *
 * NB: `XMLNFeImport.jsx` tem outro helper homônimo (`fmtDestinoCompleto`)
 * com formato pipe `|` e inclui complemento — esse é o formato do fluxo de
 * Separations, não do Shipping. Manter os dois separados é intencional
 * para preservar paridade comportamental de cada fluxo.
 */
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

function aplicarMatchEFormatar(dados, stock) {
  return (dados.produtos || []).map((p) => {
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
}

function montarDespacho(dados, produtos, file, locaisOrigem) {
  return {
    fileName: file.name,
    nfNumero: dados.numeroNf || '',
    cliente: dados.cliente?.nome || '',
    destino: fmtDestinoShipping(dados.destino),
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

/**
 * processarXML — parsing + match + shape do despacho para 1 arquivo XML.
 *
 * Mantém a assinatura legacy consumida por `ShippingBatchImport.jsx`.
 *
 * @param {File} file
 * @param {Array} stock
 * @param {Array<string>} locaisOrigem
 * @returns {Promise<object>} despacho pronto para o form/lote
 */
export const processarXML = async (file, stock, locaisOrigem) => {
  const xmlText = await lerXmlComEncoding(file);
  const result = parseNfeXml(xmlText);
  if (!result.sucesso) throw new Error(result.erro || 'Erro ao ler XML');
  const produtos = aplicarMatchEFormatar(result.dados, stock);
  return montarDespacho(result.dados, produtos, file, locaisOrigem);
};

async function processarPDF(file, stock, locaisOrigem) {
  const result = await parsePdfNfe(file);
  if (!result.sucesso) throw new Error(result.erro || 'Erro ao processar PDF');
  const produtos = aplicarMatchEFormatar(result.dados, stock);
  return montarDespacho(result.dados, produtos, file, locaisOrigem);
}

export default function ShippingXMLImport({
  stock,
  nfFile,
  setNfFile,
  onSetForm,
  onSetNfData,
  onSetActiveView,
  onSetSuccess,
  onSetError,
  locaisOrigem,
}) {
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      onSetError(`Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Máximo: 10MB.`);
      return;
    }

    setNfFile(file);
    onSetError('');
    const fileNameLower = file.name.toLowerCase();
    const isXml = fileNameLower.endsWith('.xml');
    const isPdf = fileNameLower.endsWith('.pdf');

    if (!isXml && !isPdf) {
      onSetError('Formato não suportado. Use XML ou PDF.');
      return;
    }

    try {
      if (isPdf) onSetSuccess('Processando PDF...');
      const despacho = isXml
        ? await processarXML(file, stock, locaisOrigem)
        : await processarPDF(file, stock, locaisOrigem);

      onSetForm((prevForm) => ({
        ...prevForm,
        nfNumero: despacho.nfNumero,
        cliente: despacho.cliente,
        destino: despacho.destino,
        produtos: despacho.produtos,
        codigoRastreio: '',
        linkRastreio: '',
      }));

      onSetNfData(
        isPdf
          ? {
              type: 'pdf',
              fileName: file.name,
              nfNumero: despacho.nfNumero,
              cliente: despacho.cliente,
              destino: despacho.destino,
              produtos: despacho.produtos,
            }
          : {
              nfNumero: despacho.nfNumero,
              cliente: despacho.cliente,
              destino: despacho.destino,
              produtos: despacho.produtos,
            }
      );

      const naoVinculados = despacho.total - despacho.vinculados;
      let msg;
      if (isXml) {
        msg = `NF ${despacho.nfNumero} importada! ${despacho.total} produto(s).`;
        if (despacho.vinculados > 0) msg += ` ${despacho.vinculados} vinculado(s) automaticamente.`;
        if (naoVinculados > 0) msg += ` ${naoVinculados} não encontrado(s) no estoque.`;
      } else {
        msg = 'PDF processado!';
        if (despacho.nfNumero) msg += ` NF: ${despacho.nfNumero}.`;
        if (despacho.cliente) msg += ` Cliente: ${despacho.cliente.substring(0, 20)}...`;
        if (despacho.total > 0) msg += ` ${despacho.total} produto(s).`;
        if (despacho.vinculados > 0) msg += ` ${despacho.vinculados} vinculado(s) ao estoque.`;
        if (!despacho.nfNumero && !despacho.cliente && despacho.total === 0) {
          msg = 'Não foi possível extrair todos os dados. Complete manualmente.';
        }
      }
      onSetSuccess(msg);
      onSetActiveView('register');
      setTimeout(() => onSetSuccess(''), 8000);
    } catch (err) {
      console.error(`Erro ao processar ${file.name}:`, err);
      if (isXml) {
        onSetError('Erro ao processar XML: ' + err.message);
      } else {
        onSetError('Erro ao processar PDF. Tente usar o arquivo XML ou preencha manualmente.');
        onSetNfData({ type: 'pdf', fileName: file.name });
        onSetActiveView('register');
      }
    }
  };

  return (
    <>
      <p style={{ color: 'var(--text-muted)', marginBottom: '20px', fontSize: '13px' }}>
        Importe a NF em formato XML (dados extraídos automaticamente) ou PDF
      </p>

      <div
        style={{
          border: '2px dashed var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '40px',
          textAlign: 'center',
          background: 'var(--bg-primary)',
        }}
      >
        <input
          type="file"
          accept=".xml,.pdf"
          onChange={handleFileUpload}
          style={{ display: 'none' }}
          id="nf-upload"
        />
        <label htmlFor="nf-upload" style={{ cursor: 'pointer' }}>
          <div style={{ marginBottom: '16px', color: 'var(--text-light)' }}>
            <Icon name="file" size={48} />
          </div>
          <div style={{ fontWeight: '600', marginBottom: '8px' }}>Clique para selecionar arquivo</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>XML ou PDF</div>
        </label>
      </div>

      {nfFile && (
        <div
          style={{
            marginTop: '16px',
            padding: '12px',
            background: 'var(--success-light)',
            borderRadius: 'var(--radius)',
            fontSize: '13px',
          }}
        >
          Arquivo carregado: <strong>{nfFile.name}</strong>
        </div>
      )}
    </>
  );
}
