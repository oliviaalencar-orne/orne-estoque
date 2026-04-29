/**
 * XMLNFeImport.jsx — Importação em lote de Separations via XML de NF-e.
 *
 * Fluxo:
 *   1. Upload múltiplo (drag-and-drop ou seleção) de arquivos .xml
 *   2. Parse local (nfeXmlParser), sem fetch remoto
 *   3. Preview em tabela editável com 3 estados:
 *        verde  — OK, pode importar
 *        amarelo — aviso (duplicata / DV inválido / múltiplos matches de SKU)
 *        vermelho — bloqueia (SKU não encontrado, precisa resolução)
 *   4. Edição individual por linha: HUB, transportadora, observações, produtos
 *   5. Confirma → criação em lote das separations
 *
 * Permissões:
 *   - Admin e Operador: podem importar.
 *   - Apenas Admin: pode cadastrar novo produto quando SKU não é encontrado.
 *
 * Dedup:
 *   - Primeiro tenta match por chave_acesso nas separations/shippings existentes.
 *   - Fallback para nf_numero quando chave não vier no XML.
 *
 * Sentry (Fase A, frontend):
 *   - captureException em erros de parse e erros de escrita (criação da separation).
 *   - extras sem PII: sufixo da chave (últimos 8) + nf_numero + linha_index.
 *   - Nome/endereço/CPF/CNPJ/valor nunca vão para o Sentry.
 */
import React, { useState, useCallback, useMemo, useRef } from 'react';
import * as Sentry from '@sentry/react';
import { parseNfeXml } from '@/utils/nfeXmlParser';
import { generateId } from '@/utils/helpers';

const MAX_ARQUIVOS = 100;
const MAX_BYTES_POR_ARQUIVO = 500 * 1024; // 500KB
const MAX_MATCHES_SKU = 50;
const TRANSPORTADORAS_PADRAO = ['Entrega Local', 'Loggi', 'Correios', 'Jadlog', 'Melhor Envio', 'Total Express', 'Braspress', 'TNT', 'Azul Cargo', 'Outro'];

function chaveSuffix(chave) {
  if (!chave || typeof chave !== 'string') return '';
  return chave.slice(-8);
}

function sentryTag(action, extras = {}) {
  return {
    tags: { feature: 'import_xml', action },
    extra: extras,
  };
}

// Aplica o toggle de NOSSO em um produto da linha, replicando o side-effect
// de SeparationForm.jsx:273-282: desmarcar zera baixarEstoque e limpa nfOrigem.
// Retorna nova lista (imutável) para uso direto em onChangeProdutos/updateLinha.
// Usado pelo EditProdutosModal e pelos toggles inline da tabela de preview —
// fonte única de regra para garantir paridade de comportamento.
function applyNossoToggle(produtos, idx, val) {
  return produtos.map((p, i) => {
    if (i !== idx) return p;
    return {
      ...p,
      doNossoEstoque: val,
      baixarEstoque: val ? p.baixarEstoque : false,
      nfOrigem: val ? (p.nfOrigem || '') : '',
    };
  });
}

function calcStatus(linha) {
  // erro: algum produto sem match
  const temProdutoSemMatch = linha.produtos.some(p => p.matches.length === 0);
  if (temProdutoSemMatch) return 'erro';
  // warning: dup, DV inválido ou produto com múltiplos matches não resolvido
  const temProdutoAmbiguoNaoResolvido = linha.produtos.some(p => p.matches.length > 1 && !p.produtoEstoque);
  if (linha.dupInfo || !linha.chaveValida || temProdutoAmbiguoNaoResolvido) return 'warning';
  return 'ok';
}

function buildProdutoLinha(produtoXml, allProducts) {
  const skuBusca = (produtoXml.sku || '').toLowerCase();
  const matches = allProducts.filter(p => (p.sku || '').toLowerCase() === skuBusca).slice(0, MAX_MATCHES_SKU);
  // 1 match: auto-vincular. N>1 ou 0: deixar pro admin resolver.
  const produtoEstoque = matches.length === 1 ? matches[0] : null;
  return {
    sku: produtoXml.sku,
    skuOriginal: produtoXml.sku,
    descricao: produtoXml.descricao,
    quantidade: Math.max(1, Math.round(produtoXml.quantidade || 1)),
    unidade: produtoXml.unidade,
    matches,
    produtoEstoque,
    // Paridade com SeparationForm — campo persistido e consultado por
    // disabled={!doNossoEstoque || !vinculado} na regra do Baixa.
    vinculado: !!produtoEstoque,
    // Ambos NOSSO e Baixa começam desmarcados por padrão (decisão admin).
    doNossoEstoque: false,
    baixarEstoque: false,
  };
}

function buildLinha({ dados, nomeArquivo, dupInfo, allProducts, defaultHubId }) {
  return {
    id: generateId(),
    nomeArquivo,
    chaveAcesso: dados.chaveAcesso,
    chaveValida: dados.chaveValida,
    numeroNf: dados.numeroNf,
    dataEmissao: dados.dataEmissao,
    cliente: dados.cliente,
    destino: dados.destino,
    produtos: dados.produtos.map(p => buildProdutoLinha(p, allProducts)),
    valorTotal: dados.valorTotal,
    hubId: defaultHubId || '',
    transportadora: '',
    observacoes: '',
    dupInfo,
    confirmaDup: false,
  };
}

function fmtDestino(d) {
  const partes = [d.municipio, d.uf].filter(Boolean);
  return partes.join(' / ');
}

function fmtDestinoCompleto(d) {
  const linha1 = [d.logradouro, d.numero, d.complemento].filter(Boolean).join(', ');
  const linha2 = [d.bairro, d.municipio, d.uf].filter(Boolean).join(' - ');
  return [linha1, linha2, d.cep].filter(Boolean).join(' | ');
}

function fmtValor(v) {
  if (v == null) return '-';
  return `R$ ${Number(v).toFixed(2).replace('.', ',')}`;
}

// ─── Componente principal ──────────────────────────────────────────────────

export default function XMLNFeImport({
  products = [],
  shippings = [],
  separations = [],
  hubs = [],
  locaisOrigem = [],
  defaultHubId = '',
  transportadoras = null,
  categories = [],
  isStockAdmin = false,
  isOperador = false,
  onPrepareSeparationFromXml,
  onAddProduct,
  onAddCategory,
}) {
  const canCreateProduct = isStockAdmin;

  const [linhas, setLinhas] = useState([]);
  const [arquivosComErro, setArquivosComErro] = useState([]);
  const [parsing, setParsing] = useState(false);
  const [parseProgress, setParseProgress] = useState({ atual: 0, total: 0 });
  const [saving, setSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState({ atual: 0, total: 0 });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [skuModal, setSkuModal] = useState(null);         // { linhaId, produtoIdx }
  const [editProdutosModal, setEditProdutosModal] = useState(null); // { linhaId }
  const [novoProdutoModal, setNovoProdutoModal] = useState(null);   // { linhaId, produtoIdx, skuBuscado, descricao }
  const inputFileRef = useRef(null);

  const hubOptions = useMemo(() => {
    if (hubs && hubs.length > 0) return hubs.map(h => ({ value: h.id, label: h.name || h.id }));
    return (locaisOrigem || []).map(l => ({ value: l, label: l }));
  }, [hubs, locaisOrigem]);

  const transportadorasOptions = transportadoras && transportadoras.length
    ? transportadoras : TRANSPORTADORAS_PADRAO;

  // Dedup: primeiro por chave_acesso, fallback por nf_numero.
  const checkDup = useCallback((chaveAcesso, nfNumero) => {
    if (chaveAcesso) {
      const shipMatch = shippings.find(s => s.chaveAcesso === chaveAcesso);
      if (shipMatch) return { tipo: 'shipping', via: 'chave', detalhe: 'Já despachada' };
      const sepMatch = separations.find(s => s.chaveAcesso === chaveAcesso && s.status !== 'despachado');
      if (sepMatch) return { tipo: 'separation', via: 'chave', detalhe: `Em separação (${sepMatch.status})` };
    }
    if (nfNumero) {
      const shipMatch = shippings.find(s => s.nfNumero === nfNumero);
      if (shipMatch) return { tipo: 'shipping', via: 'nf', detalhe: 'Já despachada (match por NF)' };
      const sepMatch = separations.find(s => s.nfNumero === nfNumero && s.status !== 'despachado');
      if (sepMatch) return { tipo: 'separation', via: 'nf', detalhe: `Em separação por NF (${sepMatch.status})` };
    }
    return null;
  }, [shippings, separations]);

  const handleFiles = useCallback(async (fileList) => {
    setError('');
    setSuccess('');
    const files = Array.from(fileList || []);
    if (files.length === 0) return;

    if (files.length > MAX_ARQUIVOS) {
      setError(`Limite de ${MAX_ARQUIVOS} arquivos por lote (recebidos ${files.length}).`);
      return;
    }

    // Cada upload é independente: erros antigos não poluem o header deste
    // lote (evita "2 com erro" de uploads anteriores ao lado de "2 OK" do atual).
    setArquivosComErro([]);
    setParsing(true);
    setParseProgress({ atual: 0, total: files.length });
    const novasLinhas = [];
    const novosErros = [];

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      setParseProgress({ atual: i + 1, total: files.length });
      try {
        if (!/\.xml$/i.test(f.name)) {
          novosErros.push({ nome: f.name, erro: 'Extensão não é .xml' });
          continue;
        }
        if (f.size > MAX_BYTES_POR_ARQUIVO) {
          novosErros.push({ nome: f.name, erro: `Arquivo > ${MAX_BYTES_POR_ARQUIVO / 1024}KB (tem ${Math.round(f.size / 1024)}KB)` });
          continue;
        }
        const texto = await f.text();
        const r = parseNfeXml(texto);
        if (!r.sucesso) {
          novosErros.push({ nome: f.name, erro: r.erro });
          continue;
        }
        const dupInfo = checkDup(r.dados.chaveAcesso, r.dados.numeroNf);
        novasLinhas.push(buildLinha({
          dados: r.dados,
          nomeArquivo: f.name,
          dupInfo,
          allProducts: products,
          defaultHubId,
        }));
        // Yield pro browser não travar
        if (i % 5 === 0) await new Promise(r => setTimeout(r, 0));
      } catch (e) {
        Sentry.captureException(e, sentryTag('parse_xml', {
          arquivo: f.name,
          tamanho_bytes: f.size,
        }));
        novosErros.push({ nome: f.name, erro: `Erro inesperado: ${e.message}` });
      }
    }

    setLinhas(prev => [...prev, ...novasLinhas]);
    setArquivosComErro(prev => [...prev, ...novosErros]);
    setParsing(false);
    setParseProgress({ atual: 0, total: 0 });
    if (inputFileRef.current) inputFileRef.current.value = '';
  }, [checkDup, products, defaultHubId]);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!dragActive) setDragActive(true);
  };
  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    handleFiles(e.dataTransfer?.files);
  };

  const updateLinha = useCallback((id, updates) => {
    setLinhas(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l));
  }, []);

  const removerLinha = useCallback((id) => {
    setLinhas(prev => prev.filter(l => l.id !== id));
  }, []);

  const vincularProdutoExistente = useCallback((linhaId, produtoIdx, produtoEstoque) => {
    setLinhas(prev => prev.map(l => {
      if (l.id !== linhaId) return l;
      const produtos = l.produtos.map((p, i) => {
        if (i !== produtoIdx) return p;
        // Se o produto escolhido não está na lista de matches (busca livre por SKU),
        // adicionamos à lista pra manter coerência do estado.
        const matches = p.matches.some(m => m.id === produtoEstoque.id)
          ? p.matches
          : [produtoEstoque, ...p.matches];
        return { ...p, produtoEstoque, matches, vinculado: true };
      });
      return { ...l, produtos };
    }));
    setSkuModal(null);
  }, []);

  const handleCadastrarNovoProduto = useCallback(async (linhaId, produtoIdx, dadosProduto) => {
    if (!canCreateProduct) {
      setError('Apenas admin pode cadastrar novos produtos.');
      return;
    }
    try {
      const novo = await onAddProduct({
        name: dadosProduto.name.trim(),
        sku: dadosProduto.sku.trim(),
        ean: dadosProduto.ean?.trim() || '',
        category: dadosProduto.category,
        observations: dadosProduto.observations?.trim() || '',
        createdAt: new Date().toISOString(),
      });
      if (!novo) return;
      // Vincular imediatamente à linha
      vincularProdutoExistente(linhaId, produtoIdx, novo);
      setNovoProdutoModal(null);
    } catch (e) {
      Sentry.captureException(e, sentryTag('cadastrar_produto', {
        sku_buscado: dadosProduto.sku,
      }));
      setError('Erro ao cadastrar produto: ' + e.message);
    }
  }, [canCreateProduct, onAddProduct, vincularProdutoExistente]);

  // ─── Confirmar import em lote ──────────────────────────────────────────
  const linhasStatus = useMemo(() => linhas.map(l => ({ id: l.id, status: calcStatus(l) })), [linhas]);
  const temVermelho = linhasStatus.some(s => s.status === 'erro');
  const linhasOk = useMemo(() => linhasStatus.filter(s => s.status === 'ok').length, [linhasStatus]);
  const linhasWarning = useMemo(() => linhasStatus.filter(s => s.status === 'warning').length, [linhasStatus]);
  const totalLinhasImportaveis = useMemo(() => linhas.filter(l => {
    const st = calcStatus(l);
    if (st === 'erro') return false;
    if (st === 'warning' && l.dupInfo && !l.confirmaDup) return false;
    return true;
  }).length, [linhas]);

  const handleConfirmarImport = async () => {
    if (temVermelho) {
      setError('Há linhas com SKU não encontrado. Resolva antes de confirmar.');
      return;
    }
    if (totalLinhasImportaveis === 0) {
      setError('Nenhuma linha válida para importar.');
      return;
    }

    setError('');
    setSuccess('');
    setSaving(true);

    const paraImportar = linhas.filter(l => {
      const st = calcStatus(l);
      if (st === 'erro') return false;
      if (l.dupInfo && !l.confirmaDup) return false;
      return true;
    });

    setSaveProgress({ atual: 0, total: paraImportar.length });

    let criadas = 0;
    let erros = 0;
    const dupsImportadas = paraImportar.filter(l => l.dupInfo && l.confirmaDup).length;
    const puladasDup = linhas.filter(l => l.dupInfo && !l.confirmaDup).length;

    for (let i = 0; i < paraImportar.length; i++) {
      const l = paraImportar[i];
      setSaveProgress({ atual: i + 1, total: paraImportar.length });
      try {
        const destinoStr = fmtDestinoCompleto(l.destino);
        const produtos = l.produtos.map(p => ({
          sku: p.produtoEstoque?.sku || p.sku,
          nome: p.produtoEstoque?.name || p.descricao,
          quantidade: p.quantidade,
          unidade: p.unidade || 'UN',
          ean: p.produtoEstoque?.ean || '',
          produtoEstoque: p.produtoEstoque || null,
          vinculado: !!p.vinculado,
          autoVinculado: !!p.produtoEstoque,
          doNossoEstoque: !!p.doNossoEstoque,
          baixarEstoque: !!p.baixarEstoque,
          nfOrigem: '',
          observacao: '',
          manual: false,
        }));
        await onPrepareSeparationFromXml({
          nfNumero: l.numeroNf,
          chaveAcesso: l.chaveAcesso,
          cliente: l.cliente.nome,
          destino: destinoStr,
          observacoes: l.observacoes,
          transportadora: l.transportadora,
          hubId: l.hubId,
          produtos,
        });
        criadas++;
      } catch (e) {
        Sentry.captureException(e, sentryTag('criar_separation', {
          nf_numero: l.numeroNf,
          chave_suffix: chaveSuffix(l.chaveAcesso),
          linha_index: i,
        }));
        console.error(`Erro ao criar separation para NF ${l.numeroNf}:`, e);
        erros++;
      }
    }

    setSaving(false);
    setSaveProgress({ atual: 0, total: 0 });

    // Limpa linhas criadas com sucesso
    const idsImportados = paraImportar.slice(0, criadas).map(l => l.id);
    setLinhas(prev => prev.filter(l => !idsImportados.includes(l.id)));

    const partes = [];
    if (criadas > 0) partes.push(`${criadas} criada(s)`);
    if (puladasDup > 0) partes.push(`${puladasDup} pulada(s) (duplicatas não confirmadas)`);
    if (erros > 0) partes.push(`${erros} com erro`);
    if (dupsImportadas > 0) partes.push(`${dupsImportadas} duplicata(s) importada(s) conforme confirmado`);
    const msg = partes.join(', ');

    if (erros > 0 && criadas === 0) {
      setError(msg);
    } else {
      setSuccess(msg);
      setTimeout(() => setSuccess(''), 8000);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────

  const linhaSelecionadaSku = skuModal
    ? linhas.find(l => l.id === skuModal.linhaId)
    : null;
  const produtoSelecionadoSku = linhaSelecionadaSku
    ? linhaSelecionadaSku.produtos[skuModal.produtoIdx]
    : null;
  const linhaEditProdutos = editProdutosModal
    ? linhas.find(l => l.id === editProdutosModal.linhaId)
    : null;

  return (
    <div style={{ marginBottom: '24px' }}>
      {error && <div className="alert alert-danger" style={{ marginBottom: '12px' }}>{error}</div>}
      {success && <div className="alert alert-success" style={{ marginBottom: '12px' }}>{success}</div>}

      {/* Área de upload */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${dragActive ? 'var(--accent, #8c52ff)' : 'var(--border-color, #ddd)'}`,
          borderRadius: '8px',
          padding: '32px 16px',
          textAlign: 'center',
          background: dragActive ? 'rgba(140, 82, 255, 0.04)' : 'var(--bg-secondary, #fafafa)',
          transition: 'background 0.15s, border-color 0.15s',
          marginBottom: '16px',
        }}
      >
        <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>
          Importar XML(s) de NF-e
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
          Arraste arquivos .xml aqui ou clique para selecionar. Máximo {MAX_ARQUIVOS} arquivos, {MAX_BYTES_POR_ARQUIVO / 1024}KB cada.
        </div>
        <input
          ref={inputFileRef}
          type="file"
          accept=".xml,application/xml,text/xml"
          multiple
          onChange={(e) => handleFiles(e.target.files)}
          style={{ display: 'none' }}
          id="xml-upload-input"
        />
        <label htmlFor="xml-upload-input" className="btn btn-primary" style={{ cursor: 'pointer' }}>
          Selecionar XMLs
        </label>
      </div>

      {/* Progresso de parse */}
      {parsing && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
            Lendo {parseProgress.atual} de {parseProgress.total} arquivo(s)...
          </div>
          <div style={{ width: '100%', height: '6px', background: 'var(--bg-secondary)', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{
              width: `${parseProgress.total > 0 ? (parseProgress.atual / parseProgress.total) * 100 : 0}%`,
              height: '100%',
              background: 'var(--accent, #8c52ff)',
              transition: 'width 0.2s',
            }} />
          </div>
        </div>
      )}

      {/* Arquivos com erro */}
      {arquivosComErro.length > 0 && (
        <div style={{
          border: '1px solid #fca5a5',
          background: '#fee2e2',
          borderRadius: '6px',
          padding: '10px 12px',
          marginBottom: '16px',
          fontSize: '13px',
        }}>
          <div style={{ fontWeight: 600, marginBottom: '6px', color: '#893030' }}>
            {arquivosComErro.length} arquivo(s) não puderam ser lidos
          </div>
          <ul style={{ margin: 0, paddingLeft: '20px', color: '#7f1d1d' }}>
            {arquivosComErro.map((a, i) => (
              <li key={i}><strong>{a.nome}</strong>: {a.erro}</li>
            ))}
          </ul>
          <button
            className="btn btn-secondary"
            style={{ marginTop: '8px', fontSize: '12px', padding: '4px 10px' }}
            onClick={() => setArquivosComErro([])}
          >
            Limpar erros
          </button>
        </div>
      )}

      {/* Sumário + Confirmar */}
      {linhas.length > 0 && (
        <div className="card" style={{ padding: '12px', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ fontSize: '13px', display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span><strong>{linhas.length}</strong> arquivo(s) prontos</span>
            {linhasOk > 0 && <span style={{ color: 'var(--success, #39845f)' }}>✅ {linhasOk} OK</span>}
            {linhasWarning > 0 && <span style={{ color: '#92400e' }}>⚠️ {linhasWarning} avisos</span>}
            {temVermelho && <span style={{ color: 'var(--danger, #893030)' }}>❌ {linhasStatus.filter(s => s.status === 'erro').length} bloqueados</span>}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="btn btn-secondary"
              onClick={() => { setLinhas([]); setArquivosComErro([]); }}
              disabled={saving}
            >
              Limpar tudo
            </button>
            <button
              className="btn btn-primary"
              onClick={handleConfirmarImport}
              disabled={temVermelho || saving || totalLinhasImportaveis === 0}
              title={temVermelho ? 'Resolva linhas bloqueadas antes de confirmar' : ''}
            >
              {saving
                ? `Criando ${saveProgress.atual}/${saveProgress.total}...`
                : `Confirmar importação (${totalLinhasImportaveis})`}
            </button>
          </div>
        </div>
      )}

      {/* Tabela de preview */}
      {linhas.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ margin: 0, fontSize: '13px' }}>
              <thead>
                <tr>
                  <th style={{ width: '28px' }}></th>
                  <th>NF</th>
                  <th>Cliente</th>
                  <th>Destino</th>
                  <th>Produtos</th>
                  <th>Valor</th>
                  <th style={{ textAlign: 'center', width: '60px' }} title="Produto do nosso estoque">NOSSO</th>
                  <th style={{ textAlign: 'center', width: '60px' }} title="Baixar do estoque ao despachar">Baixa</th>
                  <th>HUB</th>
                  <th>Transportadora</th>
                  <th>Observações</th>
                  <th style={{ width: '90px' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => {
                  const st = calcStatus(l);
                  const bg = st === 'erro' ? '#fee2e2'
                    : st === 'warning' ? '#fef3c7'
                    : 'transparent';
                  return (
                    <tr key={l.id} style={{ background: bg }}>
                      <td style={{ textAlign: 'center', fontSize: '16px' }}>
                        {st === 'ok' && <span title="Pronto para importar">✅</span>}
                        {st === 'warning' && <span title="Aviso — pode importar com cautela">⚠️</span>}
                        {st === 'erro' && <span title="Bloqueado — resolver SKU">❌</span>}
                      </td>
                      <td title={`Chave: ${l.chaveAcesso}\nArquivo: ${l.nomeArquivo}`}>
                        <div style={{ fontWeight: 600 }}>{l.numeroNf || '-'}</div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                          ...{chaveSuffix(l.chaveAcesso)}
                        </div>
                        {!l.chaveValida && (
                          <div style={{ fontSize: '10px', color: '#92400e' }} title="Dígito verificador da chave não bate">
                            DV inválido
                          </div>
                        )}
                      </td>
                      <td>{l.cliente.nome || '-'}</td>
                      <td title={fmtDestinoCompleto(l.destino)}>{fmtDestino(l.destino)}</td>
                      <td>
                        {l.produtos.length} item(s)
                        <button
                          type="button"
                          onClick={() => setEditProdutosModal({ linhaId: l.id })}
                          style={{ marginLeft: '6px', background: 'transparent', border: 'none', color: 'var(--accent, #8c52ff)', cursor: 'pointer', fontSize: '11px', textDecoration: 'underline' }}
                        >
                          editar
                        </button>
                        {l.produtos.map((p, i) => {
                          if (p.matches.length === 0) {
                            return (
                              <div key={i} style={{ fontSize: '11px', color: '#893030' }}>
                                <button
                                  type="button"
                                  onClick={() => setSkuModal({ linhaId: l.id, produtoIdx: i })}
                                  className="btn btn-secondary"
                                  style={{ fontSize: '10px', padding: '2px 8px', marginTop: '2px' }}
                                >
                                  SKU "{p.sku}" não encontrado — resolver
                                </button>
                              </div>
                            );
                          }
                          if (p.matches.length > 1 && !p.produtoEstoque) {
                            return (
                              <div key={i} style={{ fontSize: '11px', color: '#92400e' }}>
                                <button
                                  type="button"
                                  onClick={() => setSkuModal({ linhaId: l.id, produtoIdx: i })}
                                  className="btn btn-secondary"
                                  style={{ fontSize: '10px', padding: '2px 8px', marginTop: '2px' }}
                                >
                                  SKU "{p.sku}" com {p.matches.length} matches — escolher
                                </button>
                              </div>
                            );
                          }
                          return null;
                        })}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtValor(l.valorTotal)}</td>
                      {/* Toggles inline NOSSO + Baixa — só quando a linha tem exatamente 1 produto.
                          Caso contrário (raro: NF com múltiplos itens), admin abre modal pra
                          ajustar individualmente. Wrapper 40x40 garante área de toque mobile. */}
                      {l.produtos.length === 1 ? (() => {
                        const p = l.produtos[0];
                        const baixaDisabled = !p.doNossoEstoque || !p.vinculado;
                        const tdBase = { textAlign: 'center', padding: 0 };
                        const labelBase = {
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '40px',
                          height: '40px',
                          cursor: 'pointer',
                        };
                        return (
                          <>
                            <td style={tdBase}>
                              <label style={labelBase}>
                                <input
                                  type="checkbox"
                                  checked={!!p.doNossoEstoque}
                                  onChange={(e) => updateLinha(l.id, {
                                    produtos: applyNossoToggle(l.produtos, 0, e.target.checked),
                                  })}
                                  aria-label="Produto do nosso estoque"
                                />
                              </label>
                            </td>
                            <td style={tdBase}>
                              <label style={{ ...labelBase, cursor: baixaDisabled ? 'not-allowed' : 'pointer' }}
                                title={baixaDisabled ? 'Marque "NOSSO" e vincule ao cadastro para habilitar' : ''}>
                                <input
                                  type="checkbox"
                                  checked={!!p.baixarEstoque}
                                  disabled={baixaDisabled}
                                  onChange={(e) => updateLinha(l.id, {
                                    produtos: l.produtos.map((q, i) => i === 0 ? { ...q, baixarEstoque: e.target.checked } : q),
                                  })}
                                  aria-label="Baixar do estoque ao despachar"
                                />
                              </label>
                            </td>
                          </>
                        );
                      })() : (
                        <>
                          <td colSpan={2} style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)' }}
                              title="Múltiplos produtos — abra o modal para configurar individualmente">
                            {l.produtos.length} itens · ver modal
                          </td>
                        </>
                      )}
                      <td>
                        <select
                          className="form-select"
                          value={l.hubId}
                          onChange={(e) => updateLinha(l.id, { hubId: e.target.value })}
                          style={{ fontSize: '12px', padding: '4px 6px', minWidth: '110px' }}
                        >
                          <option value="">—</option>
                          {hubOptions.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          className="form-select"
                          value={l.transportadora}
                          onChange={(e) => updateLinha(l.id, { transportadora: e.target.value })}
                          style={{ fontSize: '12px', padding: '4px 6px', minWidth: '130px' }}
                        >
                          <option value="">—</option>
                          {transportadorasOptions.map(t => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          type="text"
                          className="form-input"
                          maxLength={200}
                          value={l.observacoes}
                          onChange={(e) => updateLinha(l.id, { observacoes: e.target.value })}
                          style={{ fontSize: '12px', padding: '4px 6px', minWidth: '140px' }}
                          placeholder="opcional"
                        />
                        {l.dupInfo && (
                          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: '#92400e', marginTop: '4px' }}>
                            <input
                              type="checkbox"
                              checked={l.confirmaDup}
                              onChange={(e) => updateLinha(l.id, { confirmaDup: e.target.checked })}
                            />
                            <span title={l.dupInfo.detalhe}>Importar mesmo assim ({l.dupInfo.detalhe})</span>
                          </label>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => removerLinha(l.id)}
                          className="btn btn-secondary"
                          style={{ fontSize: '11px', padding: '3px 8px' }}
                          disabled={saving}
                        >
                          remover
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modais */}
      {skuModal && linhaSelecionadaSku && produtoSelecionadoSku && (
        <ResolveSkuModal
          linha={linhaSelecionadaSku}
          produto={produtoSelecionadoSku}
          produtoIdx={skuModal.produtoIdx}
          allProducts={products}
          canCreateProduct={canCreateProduct}
          onClose={() => setSkuModal(null)}
          onVincular={(produtoEstoque) => vincularProdutoExistente(skuModal.linhaId, skuModal.produtoIdx, produtoEstoque)}
          onAbrirCadastro={(skuBuscado, descricao) => {
            setSkuModal(null);
            setNovoProdutoModal({ linhaId: linhaSelecionadaSku.id, produtoIdx: skuModal.produtoIdx, skuBuscado, descricao });
          }}
        />
      )}

      {editProdutosModal && linhaEditProdutos && (
        <EditProdutosModal
          linha={linhaEditProdutos}
          onClose={() => setEditProdutosModal(null)}
          onChangeProdutos={(novosProdutos) => updateLinha(linhaEditProdutos.id, { produtos: novosProdutos })}
        />
      )}

      {novoProdutoModal && (
        <NovoProdutoModal
          skuBuscado={novoProdutoModal.skuBuscado}
          descricao={novoProdutoModal.descricao}
          categories={categories}
          onAddCategory={onAddCategory}
          onClose={() => setNovoProdutoModal(null)}
          onSave={(dadosProduto) => handleCadastrarNovoProduto(novoProdutoModal.linhaId, novoProdutoModal.produtoIdx, dadosProduto)}
        />
      )}
    </div>
  );
}

// ─── Modal: Resolução de SKU ───────────────────────────────────────────────

function ResolveSkuModal({ linha, produto, allProducts, canCreateProduct, onClose, onVincular, onAbrirCadastro }) {
  const [termo, setTermo] = useState('');
  const matchesExatos = produto.matches;

  const sugestoesBusca = useMemo(() => {
    const t = termo.trim().toLowerCase();
    if (!t) return [];
    return allProducts
      .filter(p => {
        const sku = (p.sku || '').toLowerCase();
        const nome = (p.name || '').toLowerCase();
        return sku.includes(t) || nome.includes(t);
      })
      .slice(0, MAX_MATCHES_SKU);
  }, [termo, allProducts]);

  const opcoesExibidas = termo.trim() ? sugestoesBusca : matchesExatos;

  const temVariasMatches = matchesExatos.length > 1;
  const titulo = temVariasMatches
    ? `SKU "${produto.sku}" tem ${matchesExatos.length} correspondências`
    : `SKU "${produto.sku}" não encontrado no cadastro`;

  return (
    <ModalShell onClose={onClose}>
      <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>
        {titulo}
      </div>
      <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
        NF <strong>{linha.numeroNf}</strong> · Item: {produto.descricao} · Qtd {produto.quantidade}
      </div>

      <div style={{ marginBottom: '12px' }}>
        <label className="form-label" style={{ fontSize: '12px' }}>Buscar por SKU ou nome:</label>
        <input
          className="form-input"
          placeholder="digite para filtrar..."
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          autoFocus
        />
      </div>

      <div style={{ maxHeight: '350px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
        {opcoesExibidas.length === 0 && (
          <div style={{ padding: '16px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
            {termo.trim() ? 'Nenhum produto encontrado' : 'Digite acima para buscar ou escolha um match abaixo.'}
          </div>
        )}
        {opcoesExibidas.map((p) => (
          <div
            key={p.id}
            onClick={() => onVincular(p)}
            style={{
              padding: '10px 12px',
              borderBottom: '1px solid var(--border-color)',
              cursor: 'pointer',
              fontSize: '13px',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-secondary)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <div style={{ fontWeight: 600 }}>
              <span style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--text-muted)' }}>{p.sku || '—'}</span>
              {'  '}
              {p.name || '(sem nome)'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {p.category && <span>{p.category}</span>}
              {p.local && <span> · Local: {p.local}</span>}
              {p.nfOrigem && <span> · NF origem: {p.nfOrigem}</span>}
              {p.createdAt && <span> · Criado: {new Date(p.createdAt).toLocaleDateString('pt-BR')}</span>}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', gap: '8px' }}>
        <button
          className="btn btn-secondary"
          type="button"
          onClick={() => onAbrirCadastro(produto.sku, produto.descricao)}
          disabled={!canCreateProduct}
          title={canCreateProduct ? 'Cadastrar um novo produto com esses dados' : 'Apenas admin pode cadastrar novos produtos'}
        >
          Cadastrar novo produto
        </button>
        <button className="btn btn-secondary" type="button" onClick={onClose}>Cancelar</button>
      </div>
    </ModalShell>
  );
}

// ─── Modal: Edição de produtos da linha ────────────────────────────────────
//
// Edit-in-place: cada mudança no input/remoção propaga imediatamente para o
// state do pai via onChangeProdutos. Não há "Salvar" vs "Cancelar" — fechar
// de qualquer forma (botão Fechar, backdrop, Esc) preserva as alterações.
// Isso elimina a ambiguidade em que o usuário fechava sem clicar em "Salvar"
// e perdia edições silenciosamente.

function EditProdutosModal({ linha, onClose, onChangeProdutos }) {
  const produtos = linha.produtos;

  const updateProduto = (idx, updates) => {
    const next = produtos.map((p, i) => i === idx ? { ...p, ...updates } : p);
    onChangeProdutos(next);
  };
  const remover = (idx) => {
    const next = produtos.filter((_, i) => i !== idx);
    onChangeProdutos(next);
  };

  // Side-effect de desmarcar NOSSO via helper compartilhado (applyNossoToggle).
  // Mesma regra usada pelos toggles inline da tabela de preview.
  const toggleNosso = (idx, val) => {
    onChangeProdutos(applyNossoToggle(produtos, idx, val));
  };

  return (
    <ModalShell onClose={onClose} width="min(90vw, 1200px)">
      <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>
        Produtos — NF {linha.numeroNf}
      </div>
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
        Alterações são aplicadas automaticamente. "Baixa" só habilita com "NOSSO" marcado e produto vinculado ao cadastro.
      </div>

      {produtos.length === 0 ? (
        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
          Nenhum produto nesta linha.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
        <table className="table" style={{ fontSize: '12px', tableLayout: 'auto' }}>
          <thead>
            <tr>
              <th style={{ minWidth: '160px', maxWidth: '320px' }}>SKU XML</th>
              <th>Descrição</th>
              <th>Quantidade</th>
              <th>Vinculado</th>
              <th style={{ textAlign: 'center' }}>NOSSO</th>
              <th style={{ textAlign: 'center' }}>Baixa</th>
              <th style={{ width: '60px' }}></th>
            </tr>
          </thead>
          <tbody>
            {produtos.map((p, i) => {
              const baixaDisabled = !p.doNossoEstoque || !p.vinculado;
              return (
                <tr key={p.skuOriginal + '_' + i}>
                  <td style={{ fontFamily: 'monospace', wordBreak: 'break-all', maxWidth: '320px' }}>{p.skuOriginal}</td>
                  <td>{p.descricao}</td>
                  <td>
                    <input
                      type="number"
                      className="form-input"
                      min={1}
                      value={p.quantidade}
                      onChange={(e) => {
                        const n = Math.max(1, Math.round(Number(e.target.value) || 1));
                        updateProduto(i, { quantidade: n });
                      }}
                      style={{ width: '80px', padding: '4px 6px' }}
                    />
                  </td>
                  <td style={{ fontSize: '11px' }}>
                    {p.produtoEstoque
                      ? <span style={{ color: 'var(--success, #39845f)' }}>✓ {p.produtoEstoque.name}</span>
                      : p.matches.length === 0
                        ? <span style={{ color: 'var(--danger, #893030)' }}>sem match</span>
                        : <span style={{ color: '#92400e' }}>{p.matches.length} matches</span>}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={!!p.doNossoEstoque}
                      onChange={(e) => toggleNosso(i, e.target.checked)}
                      aria-label="Produto do nosso estoque"
                    />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={!!p.baixarEstoque}
                      disabled={baixaDisabled}
                      onChange={(e) => updateProduto(i, { baixarEstoque: e.target.checked })}
                      aria-label="Baixar do estoque ao despachar"
                      title={baixaDisabled ? 'Marque "NOSSO" e vincule ao cadastro para habilitar' : ''}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => remover(i)}
                      className="btn btn-secondary"
                      style={{ fontSize: '11px', padding: '3px 8px' }}
                    >
                      remover
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
        <button className="btn btn-primary" type="button" onClick={onClose}>Fechar</button>
      </div>
    </ModalShell>
  );
}

// ─── Modal: Cadastrar novo produto ─────────────────────────────────────────

function NovoProdutoModal({ skuBuscado, descricao, categories, onClose, onSave }) {
  const [form, setForm] = useState({
    name: descricao || '',
    sku: skuBuscado || '',
    ean: '',
    category: (categories?.[0]?.id) || '',
    observations: '',
  });
  const [err, setErr] = useState('');

  const handleSave = () => {
    if (!form.name.trim() || !form.sku.trim() || !form.category) {
      setErr('Preencha nome, SKU e categoria.');
      return;
    }
    setErr('');
    onSave(form);
  };

  return (
    <ModalShell onClose={onClose}>
      <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>
        Cadastrar novo produto
      </div>
      {err && <div className="alert alert-danger" style={{ marginBottom: '10px' }}>{err}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div>
          <label className="form-label">SKU *</label>
          <input className="form-input" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
        </div>
        <div>
          <label className="form-label">EAN</label>
          <input className="form-input" value={form.ean} onChange={(e) => setForm({ ...form, ean: e.target.value })} />
        </div>
      </div>

      <div style={{ marginTop: '10px' }}>
        <label className="form-label">Nome *</label>
        <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div>

      <div style={{ marginTop: '10px' }}>
        <label className="form-label">Categoria *</label>
        <select
          className="form-select"
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
        >
          <option value="">selecione...</option>
          {(categories || []).map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div style={{ marginTop: '10px' }}>
        <label className="form-label">Observações</label>
        <textarea
          className="form-input"
          rows={2}
          value={form.observations}
          onChange={(e) => setForm({ ...form, observations: e.target.value })}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' }}>
        <button className="btn btn-secondary" type="button" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" type="button" onClick={handleSave}>Cadastrar e vincular</button>
      </div>
    </ModalShell>
  );
}

// ─── Shell de modal reutilizável ───────────────────────────────────────────

function ModalShell({ children, onClose, width = '560px' }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 10000, padding: '16px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{
          background: '#fff',
          borderRadius: '8px',
          width,
          maxWidth: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '20px',
        }}
      >
        {children}
      </div>
    </div>
  );
}
