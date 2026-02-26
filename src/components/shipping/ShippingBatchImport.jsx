/**
 * ShippingBatchImport.jsx — Batch XML import for shipping
 *
 * Extracted from ShippingManager (index-legacy.html L6439-6604, L7686-7886)
 * Handles batch upload, selection, editing, and display of batch despachos
 */
import React from 'react';
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
                    <div className="table-container" style={{maxHeight: '400px', overflowY: 'auto'}}>
                        <table className="table">
                            <thead style={{position: 'sticky', top: 0, background: 'white'}}>
                                <tr>
                                    <th style={{width: '40px'}}><Icon name="check" size={14} /></th>
                                    <th>NF / Arquivo</th>
                                    <th>Cliente</th>
                                    <th>Produtos</th>
                                    <th>Transportadora</th>
                                    <th style={{width: '80px'}}>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {batchDespachos.map((d, idx) => (
                                    <tr key={idx} style={{
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
                                        <td style={{fontSize: '12px'}}>
                                            {d.error ? (
                                                <span style={{color: 'var(--danger)'}}>{d.error}</span>
                                            ) : (
                                                <span>
                                                    {d.total} item(s)
                                                    {d.vinculados > 0 && (
                                                        <span style={{color: 'var(--success)', marginLeft: '4px'}}>
                                                            ({d.vinculados})
                                                        </span>
                                                    )}
                                                </span>
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
