/**
 * ShippingBatchImport.jsx — Batch XML import for shipping
 *
 * Extracted from ShippingManager (index-legacy.html L6439-6604, L7686-7886)
 * Handles batch upload, selection, editing, and display of batch despachos
 */
import React, { useState } from 'react';
import { Icon } from '@/utils/icons';
import { processarXML } from './ShippingXMLImport';

export default function ShippingBatchImport({
    stock, locaisOrigem, transportadoras,
    batchDespachos, setBatchDespachos,
    batchFiles, setBatchFiles,
    processingBatch, setProcessingBatch,
    batchProgress, setBatchProgress,
    onSalvarLote, onSetSuccess, onSetError
}) {
    const [expandedRows, setExpandedRows] = useState(new Set());
    const toggleExpand = (idx) => setExpandedRows(prev => {
        const next = new Set(prev);
        if (next.has(idx)) next.delete(idx); else next.add(idx);
        return next;
    });

    // Edit a product field within a batch despacho
    const editarProdutoBatch = (despIdx, prodIdx, campo, valor) => {
        const newBatch = [...batchDespachos];
        const prods = [...(newBatch[despIdx].produtos || [])];
        prods[prodIdx] = { ...prods[prodIdx], [campo]: valor };
        newBatch[despIdx] = { ...newBatch[despIdx], produtos: prods };
        // Recalculate totals
        newBatch[despIdx].total = prods.length;
        newBatch[despIdx].vinculados = prods.filter(p => p.produtoEstoque).length;
        setBatchDespachos(newBatch);
    };

    const removerProdutoBatch = (despIdx, prodIdx) => {
        const newBatch = [...batchDespachos];
        const prods = [...(newBatch[despIdx].produtos || [])];
        prods.splice(prodIdx, 1);
        newBatch[despIdx] = { ...newBatch[despIdx], produtos: prods, total: prods.length, vinculados: prods.filter(p => p.produtoEstoque).length };
        setBatchDespachos(newBatch);
    };
    // Processar múltiplos arquivos
    const handleBatchUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        setBatchFiles(files);
        setProcessingBatch(true);
        setBatchProgress({ current: 0, total: files.length });
        onSetError('');

        const resultados = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            setBatchProgress({ current: i + 1, total: files.length });

            try {
                if (file.name.toLowerCase().endsWith('.xml')) {
                    const dados = await processarXML(file, stock, locaisOrigem);
                    resultados.push(dados);
                } else {
                    resultados.push({
                        fileName: file.name,
                        nfNumero: file.name.replace(/\.(xml|pdf)$/i, ''),
                        cliente: '',
                        destino: '',
                        produtos: [],
                        localOrigem: locaisOrigem[0] || 'Loja Principal',
                        transportadora: '',
                        error: 'PDF não suporta extração automática em lote',
                        selected: false,
                        vinculados: 0,
                        total: 0
                    });
                }
            } catch (err) {
                resultados.push({
                    fileName: file.name,
                    nfNumero: file.name.replace(/\.(xml|pdf)$/i, ''),
                    error: err.message,
                    selected: false,
                    vinculados: 0,
                    total: 0
                });
            }
        }

        setBatchDespachos(resultados);
        setProcessingBatch(false);

        const sucessos = resultados.filter(r => !r.error).length;
        const erros = resultados.filter(r => r.error).length;
        onSetSuccess(`${sucessos} arquivo(s) processado(s) com sucesso${erros > 0 ? `, ${erros} com erro` : ''}`);
    };

    // Toggle seleção de despacho em lote
    const toggleBatchSelection = (index) => {
        const newBatch = [...batchDespachos];
        newBatch[index].selected = !newBatch[index].selected;
        setBatchDespachos(newBatch);
    };

    // Selecionar/deselecionar todos
    const toggleSelectAll = () => {
        const todosValidos = batchDespachos.filter(d => !d.error);
        const todosSelecionados = todosValidos.every(d => d.selected);

        const newBatch = batchDespachos.map(d => ({
            ...d,
            selected: d.error ? false : !todosSelecionados
        }));
        setBatchDespachos(newBatch);
    };

    // Editar despacho em lote
    const editarDespachoBatch = (index, campo, valor) => {
        const newBatch = [...batchDespachos];
        newBatch[index][campo] = valor;
        setBatchDespachos(newBatch);
    };

    return (
        <>
            <p style={{color: 'var(--text-muted)', marginBottom: '20px', fontSize: '13px'}}>
                Selecione múltiplos arquivos XML para importar de uma vez. Os dados serão extraídos automaticamente.
            </p>

            {batchDespachos.length === 0 ? (
                <div style={{
                    border: '2px dashed var(--border)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '40px',
                    textAlign: 'center',
                    background: 'var(--bg-primary)'
                }}>
                    <input
                        type="file"
                        accept=".xml"
                        multiple
                        onChange={handleBatchUpload}
                        style={{display: 'none'}}
                        id="nf-batch-upload"
                    />
                    <label htmlFor="nf-batch-upload" style={{cursor: 'pointer'}}>
                        <div style={{marginBottom: '16px'}}><Icon name="file" size={48} /></div>
                        <div style={{fontWeight: '600', marginBottom: '8px'}}>Clique para selecionar múltiplos arquivos</div>
                        <div style={{fontSize: '12px', color: 'var(--text-muted)'}}>
                            Apenas XML • Segure Ctrl para selecionar vários
                        </div>
                    </label>
                </div>
            ) : (
                <>
                    {/* Resumo e ações */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '16px',
                        padding: '12px',
                        background: 'var(--bg-primary)',
                        borderRadius: 'var(--radius)'
                    }}>
                        <div>
                            <strong>{batchDespachos.filter(d => d.selected && !d.error).length}</strong> de {batchDespachos.filter(d => !d.error).length} selecionados
                            <span style={{marginLeft: '12px', fontSize: '12px', color: 'var(--text-muted)'}}>
                                ({batchDespachos.filter(d => d.error).length} com erro)
                            </span>
                        </div>
                        <div style={{display: 'flex', gap: '8px'}}>
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={toggleSelectAll}
                            >
                                {batchDespachos.filter(d => !d.error).every(d => d.selected) ? 'Desmarcar todos' : 'Selecionar todos'}
                            </button>
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => { setBatchDespachos([]); setBatchFiles([]); }}
                            >
                                <Icon name="delete" size={14} /> Limpar
                            </button>
                        </div>
                    </div>

                    {/* Tabela de despachos em lote */}
                    <div className="table-container" style={{maxHeight: '400px', overflow: 'auto'}}>
                        <table className="table">
                            <thead style={{position: 'sticky', top: 0, background: 'white', zIndex: 1}}>
                                <tr>
                                    <th style={{width: '40px'}}><Icon name="check" size={14} /></th>
                                    <th>NF / Arquivo</th>
                                    <th>Cliente</th>
                                    <th>Destino</th>
                                    <th>Origem</th>
                                    <th>Produtos</th>
                                    <th>Transportadora</th>
                                    <th>Obs</th>
                                    <th style={{width: '80px'}}>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {batchDespachos.map((d, idx) => (
                                <React.Fragment key={idx}>
                                    <tr style={{
                                        background: d.error ? 'var(--danger-light)' : (d.selected ? 'var(--success-light)' : 'white'),
                                        opacity: d.error ? 0.7 : 1
                                    }}>
                                        <td style={{textAlign: 'center'}}>
                                            <input
                                                type="checkbox"
                                                checked={d.selected}
                                                disabled={!!d.error}
                                                onChange={() => toggleBatchSelection(idx)}
                                                style={{width: '18px', height: '18px'}}
                                            />
                                        </td>
                                        <td>
                                            <input
                                                type="text"
                                                className="form-input"
                                                value={d.nfNumero || ''}
                                                onChange={(e) => editarDespachoBatch(idx, 'nfNumero', e.target.value)}
                                                disabled={!!d.error}
                                                style={{fontSize: '12px', padding: '4px 8px', marginBottom: '4px'}}
                                            />
                                            <div style={{fontSize: '10px', color: 'var(--text-muted)'}}>{d.fileName}</div>
                                        </td>
                                        <td>
                                            <input
                                                type="text"
                                                className="form-input"
                                                value={d.cliente || ''}
                                                onChange={(e) => editarDespachoBatch(idx, 'cliente', e.target.value)}
                                                disabled={!!d.error}
                                                style={{fontSize: '12px', padding: '4px 8px'}}
                                                placeholder="Nome do cliente"
                                            />
                                        </td>
                                        <td>
                                            <input
                                                type="text"
                                                className="form-input"
                                                value={d.destino || ''}
                                                onChange={(e) => editarDespachoBatch(idx, 'destino', e.target.value)}
                                                disabled={!!d.error}
                                                style={{fontSize: '11px', padding: '4px 8px', minWidth: '140px'}}
                                                placeholder="Endereço"
                                            />
                                        </td>
                                        <td>
                                            <select
                                                className="form-select"
                                                value={d.localOrigem || ''}
                                                onChange={(e) => editarDespachoBatch(idx, 'localOrigem', e.target.value)}
                                                disabled={!!d.error}
                                                style={{fontSize: '11px', padding: '4px', minWidth: '100px'}}
                                            >
                                                <option value="">Selecionar...</option>
                                                {locaisOrigem.map(l => <option key={l} value={l}>{l}</option>)}
                                            </select>
                                        </td>
                                        <td style={{fontSize: '12px'}}>
                                            {d.error ? (
                                                <span style={{color: 'var(--danger)'}}>{d.error}</span>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => toggleExpand(idx)}
                                                    style={{
                                                        background: 'none', border: '1px solid var(--border)',
                                                        borderRadius: '6px', padding: '3px 8px', cursor: 'pointer',
                                                        fontSize: '12px', color: 'var(--text-primary)', whiteSpace: 'nowrap',
                                                    }}
                                                    title="Expandir para editar produtos"
                                                >
                                                    {expandedRows.has(idx) ? '▼' : '▶'} {d.total} item(s)
                                                    {d.vinculados > 0 && (
                                                        <span style={{color: 'var(--success)', marginLeft: '4px'}}>
                                                            ({d.vinculados} vinc.)
                                                        </span>
                                                    )}
                                                </button>
                                            )}
                                        </td>
                                        <td>
                                            <select
                                                className="form-select"
                                                value={d.transportadora || ''}
                                                onChange={(e) => editarDespachoBatch(idx, 'transportadora', e.target.value)}
                                                disabled={!!d.error}
                                                style={{fontSize: '11px', padding: '4px'}}
                                            >
                                                <option value="">Selecionar...</option>
                                                {transportadoras.map(t => <option key={t} value={t}>{t}</option>)}
                                            </select>
                                        </td>
                                        <td>
                                            <textarea
                                                className="form-textarea"
                                                value={d.observacoes || ''}
                                                onChange={(e) => editarDespachoBatch(idx, 'observacoes', e.target.value)}
                                                disabled={!!d.error}
                                                style={{fontSize: '11px', padding: '4px 8px', minWidth: '140px', minHeight: '36px', resize: 'vertical'}}
                                                placeholder="Ex: TRANSPORTE LOCAL - São Paulo"
                                                rows={2}
                                            />
                                        </td>
                                        <td style={{textAlign: 'center'}}>
                                            {d.error ? (
                                                <span className="badge badge-danger">Erro</span>
                                            ) : d.selected ? (
                                                <span className="badge badge-success">Pronto</span>
                                            ) : (
                                                <span className="badge" style={{background: 'var(--border)'}}>—</span>
                                            )}
                                        </td>
                                    </tr>
                                    {/* Expandable product detail row */}
                                    {expandedRows.has(idx) && !d.error && (
                                        <tr>
                                            <td colSpan={9} style={{padding: '8px 12px', background: '#F9FAFB', borderTop: 'none'}}>
                                                <div style={{fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: '#374151'}}>
                                                    Produtos — NF {d.nfNumero || '-'}
                                                </div>
                                                {(d.produtos || []).length === 0 ? (
                                                    <div style={{fontSize: '12px', color: 'var(--text-muted)', padding: '8px 0'}}>Nenhum produto encontrado no XML</div>
                                                ) : (
                                                    <div style={{display: 'flex', flexDirection: 'column', gap: '4px'}}>
                                                        {(d.produtos || []).map((prod, pi) => (
                                                            <div key={pi} style={{
                                                                display: 'flex', alignItems: 'center', gap: '8px',
                                                                padding: '4px 8px', background: 'white', borderRadius: '6px',
                                                                border: '1px solid #E5E7EB',
                                                            }}>
                                                                <div style={{flex: 1, fontSize: '12px', minWidth: 0}}>
                                                                    <div style={{fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                                                                        {prod.descricao || prod.nome || prod.sku || '(sem nome)'}
                                                                    </div>
                                                                    <div style={{fontSize: '10px', color: '#6B7280'}}>
                                                                        SKU: {prod.sku || '-'}
                                                                        {prod.produtoEstoque && <span style={{color: '#059669', marginLeft: '6px'}}>✓ vinculado</span>}
                                                                        {!prod.produtoEstoque && <span style={{color: '#D97706', marginLeft: '6px'}}>⚠ não vinculado</span>}
                                                                    </div>
                                                                </div>
                                                                <div style={{display: 'flex', alignItems: 'center', gap: '4px'}}>
                                                                    <label style={{fontSize: '11px', color: '#6B7280', whiteSpace: 'nowrap'}}>Qtd:</label>
                                                                    <input
                                                                        type="number"
                                                                        min="1"
                                                                        value={prod.quantidade || 1}
                                                                        onChange={(e) => editarProdutoBatch(idx, pi, 'quantidade', Math.max(1, parseInt(e.target.value) || 1))}
                                                                        className="form-input"
                                                                        style={{width: '60px', fontSize: '12px', padding: '3px 6px', textAlign: 'center'}}
                                                                    />
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => removerProdutoBatch(idx, pi)}
                                                                    style={{
                                                                        background: 'none', border: 'none', cursor: 'pointer',
                                                                        color: '#EF4444', fontSize: '16px', padding: '2px 4px', flexShrink: 0,
                                                                    }}
                                                                    title="Remover produto"
                                                                >×</button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Botão salvar em lote */}
                    <div style={{marginTop: '20px', display: 'flex', gap: '12px', justifyContent: 'flex-end'}}>
                        <button
                            className="btn btn-secondary"
                            onClick={() => { setBatchDespachos([]); setBatchFiles([]); }}
                        >
                            Cancelar
                        </button>
                        <button
                            className="btn btn-primary"
                            onClick={onSalvarLote}
                            disabled={processingBatch || batchDespachos.filter(d => d.selected && !d.error).length === 0}
                        >
                            {processingBatch ? (
                                `Salvando ${batchProgress.current}/${batchProgress.total}...`
                            ) : (
                                `Salvar ${batchDespachos.filter(d => d.selected && !d.error).length} Despacho(s)`
                            )}
                        </button>
                    </div>
                </>
            )}

            {/* Progress bar durante processamento */}
            {processingBatch && (
                <div style={{marginTop: '16px'}}>
                    <div style={{
                        height: '8px',
                        background: 'var(--border)',
                        borderRadius: '4px',
                        overflow: 'hidden'
                    }}>
                        <div style={{
                            width: `${(batchProgress.current / batchProgress.total) * 100}%`,
                            height: '100%',
                            background: 'var(--accent)',
                            transition: 'width 0.3s'
                        }} />
                    </div>
                    <p style={{fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px', textAlign: 'center'}}>
                        Processando {batchProgress.current} de {batchProgress.total}...
                    </p>
                </div>
            )}
        </>
    );
}
