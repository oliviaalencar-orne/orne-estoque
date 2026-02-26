/**
 * ImportNFeBatch.jsx — Batch import multiple NF-e XML files
 *
 * Extracted from index-legacy.html L8517-8925
 */
import React, { useState } from 'react';
import { Icon } from '@/utils/icons';
import LocaisModal from '@/components/ui/LocaisModal';

export default function ImportNFeBatch({ products, onImport, onAddProduct, categories, locaisOrigem, onUpdateLocais }) {
    const [batchFiles, setBatchFiles] = useState([]);
    const [batchData, setBatchData] = useState([]);
    const [processing, setProcessing] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0 });
    const [localEntrada, setLocalEntrada] = useState(locaisOrigem?.[0] || 'Loja Principal');
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');
    const [showLocaisModal, setShowLocaisModal] = useState(false);

    // Processar arquivo XML
    const processarXML = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const parser = new DOMParser();
                    const xml = parser.parseFromString(event.target.result, 'text/xml');
                    const ns = 'http://www.portalfiscal.inf.br/nfe';

                    const getNsValue = (parent, tag) => {
                        const el = parent?.getElementsByTagNameNS(ns, tag)[0] || parent?.getElementsByTagName(tag)[0];
                        return el?.textContent || '';
                    };

                    const ide = xml.getElementsByTagNameNS(ns, 'ide')[0] || xml.getElementsByTagName('ide')[0];
                    const emit = xml.getElementsByTagNameNS(ns, 'emit')[0] || xml.getElementsByTagName('emit')[0];
                    const dets = xml.getElementsByTagNameNS(ns, 'det').length > 0
                        ? xml.getElementsByTagNameNS(ns, 'det')
                        : xml.getElementsByTagName('det');

                    const nfNumero = getNsValue(ide, 'nNF');
                    const fornecedor = getNsValue(emit, 'xNome');

                    const items = [];
                    for (let det of dets) {
                        const prod = det.getElementsByTagNameNS(ns, 'prod')[0] || det.getElementsByTagName('prod')[0];
                        const codigo = getNsValue(prod, 'cProd');
                        const ean = getNsValue(prod, 'cEAN');
                        const descricao = getNsValue(prod, 'xProd');
                        const quantidade = parseFloat(getNsValue(prod, 'qCom')) || 1;

                        // Tentar vincular automaticamente
                        const produtoEstoque = products.find(p =>
                            p.sku?.toLowerCase() === codigo?.toLowerCase() ||
                            (ean && p.ean === ean)
                        );

                        items.push({
                            codigo,
                            ean: (ean && ean !== 'SEM GTIN') ? ean : '',
                            descricao,
                            quantidade: Math.round(quantidade),
                            vinculado: produtoEstoque?.sku || '',
                            produtoEstoque,
                            autoVinculado: !!produtoEstoque
                        });
                    }

                    resolve({
                        fileName: file.name,
                        nfNumero,
                        fornecedor,
                        items,
                        selected: true,
                        vinculados: items.filter(i => i.autoVinculado).length,
                        total: items.length
                    });
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
            reader.readAsText(file, 'UTF-8');
        });
    };

    // Upload de multiplos arquivos
    const handleBatchUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        setBatchFiles(files);
        setProcessing(true);
        setProgress({ current: 0, total: files.length });
        setError('');
        setSuccess('');

        const resultados = [];

        for (let i = 0; i < files.length; i++) {
            setProgress({ current: i + 1, total: files.length });

            try {
                if (files[i].name.toLowerCase().endsWith('.xml')) {
                    const dados = await processarXML(files[i]);
                    resultados.push(dados);
                } else {
                    resultados.push({
                        fileName: files[i].name,
                        error: 'Formato nao suportado (use XML)',
                        selected: false
                    });
                }
            } catch (err) {
                resultados.push({
                    fileName: files[i].name,
                    error: err.message,
                    selected: false
                });
            }
        }

        setBatchData(resultados);
        setProcessing(false);

        const sucessos = resultados.filter(r => !r.error).length;
        const erros = resultados.filter(r => r.error).length;
        setSuccess(`${sucessos} arquivo(s) processado(s)${erros > 0 ? `, ${erros} com erro` : ''}`);
    };

    // Toggle selecao
    const toggleSelection = (idx) => {
        const newData = [...batchData];
        newData[idx].selected = !newData[idx].selected;
        setBatchData(newData);
    };

    // Selecionar todos
    const toggleSelectAll = () => {
        const allSelected = batchData.filter(d => !d.error).every(d => d.selected);
        setBatchData(batchData.map(d => d.error ? d : { ...d, selected: !allSelected }));
    };

    // Atualizar vinculacao
    const updateVinculo = (nfIdx, itemIdx, sku) => {
        const newData = [...batchData];
        const produtoEstoque = products.find(p => p.sku === sku);
        newData[nfIdx].items[itemIdx].vinculado = sku;
        newData[nfIdx].items[itemIdx].produtoEstoque = produtoEstoque;
        newData[nfIdx].vinculados = newData[nfIdx].items.filter(i => i.vinculado).length;
        setBatchData(newData);
    };

    // Importar todas selecionadas
    const handleImportAll = async () => {
        const selecionadas = batchData.filter(d => d.selected && !d.error);
        if (selecionadas.length === 0) {
            setError('Selecione ao menos uma NF para importar');
            return;
        }

        setProcessing(true);
        setProgress({ current: 0, total: selecionadas.length });

        let importados = 0;
        let erros = 0;

        for (let i = 0; i < selecionadas.length; i++) {
            const nf = selecionadas[i];
            setProgress({ current: i + 1, total: selecionadas.length });

            for (const item of nf.items) {
                if (!item.vinculado) continue;

                try {
                    await onImport({
                        type: 'COMPRA',
                        sku: item.vinculado,
                        quantity: item.quantidade,
                        supplier: nf.fornecedor,
                        nf: nf.nfNumero,
                        localEntrada: localEntrada
                    });
                    importados++;
                } catch (err) {
                    erros++;
                }
            }
        }

        setProcessing(false);
        setSuccess(`Importacao concluida! ${importados} entrada(s) registrada(s)${erros > 0 ? `, ${erros} erro(s)` : ''}`);
        setBatchData([]);
        setBatchFiles([]);
    };

    return (
        <div className="card">
            <h2 className="card-title">
                <Icon name="clipboard" size={16} className="card-title-icon" />
                Importar NF-e em Lote
            </h2>

            {success && <div className="alert alert-success">{success}</div>}
            {error && <div className="alert alert-danger">{error}</div>}

            {/* Selecao de local */}
            <div className="form-group" style={{marginBottom: '20px'}}>
                <label className="form-label">Local de Entrada *</label>
                <div style={{display: 'flex', gap: '8px'}}>
                    <select
                        className="form-select"
                        value={localEntrada}
                        onChange={(e) => setLocalEntrada(e.target.value)}
                        style={{flex: 1}}
                    >
                        {(locaisOrigem || ['Loja Principal']).map((local, idx) => (
                            <option key={idx} value={local}>{local}</option>
                        ))}
                    </select>
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setShowLocaisModal(true)}
                        title="Gerenciar depositos"
                        style={{padding: '8px 12px'}}
                    >
                        <Icon name="settings" size={14} />
                    </button>
                </div>
                <span className="form-help">Todos os produtos importados serao registrados neste local</span>
            </div>

            {/* Modal Gerenciar Locais */}
            {showLocaisModal && (
                <LocaisModal
                    locaisOrigem={locaisOrigem}
                    onUpdateLocais={onUpdateLocais}
                    onClose={() => setShowLocaisModal(false)}
                />
            )}

            {batchData.length === 0 ? (
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
                        id="nf-batch-import"
                    />
                    <label htmlFor="nf-batch-import" style={{cursor: 'pointer'}}>
                        <div style={{marginBottom: '16px'}}><Icon name="file" size={48} /></div>
                        <div style={{fontWeight: '600', marginBottom: '8px'}}>Clique para selecionar multiplos arquivos XML</div>
                        <div style={{fontSize: '12px', color: 'var(--text-muted)'}}>
                            Segure Ctrl para selecionar varios arquivos
                        </div>
                    </label>
                </div>
            ) : (
                <>
                    {/* Barra de progresso */}
                    {processing && (
                        <div style={{marginBottom: '16px'}}>
                            <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '8px'}}>
                                <span>Processando...</span>
                                <span>{progress.current} de {progress.total}</span>
                            </div>
                            <div style={{background: 'var(--border)', borderRadius: '10px', height: '8px'}}>
                                <div style={{
                                    background: 'var(--accent)',
                                    borderRadius: '10px',
                                    height: '100%',
                                    width: `${(progress.current / progress.total) * 100}%`,
                                    transition: 'width 0.3s'
                                }}></div>
                            </div>
                        </div>
                    )}

                    {/* Resumo */}
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
                            <strong>{batchData.filter(d => d.selected && !d.error).length}</strong> de {batchData.filter(d => !d.error).length} selecionadas
                        </div>
                        <div style={{display: 'flex', gap: '8px'}}>
                            <button className="btn btn-secondary btn-sm" onClick={toggleSelectAll}>
                                {batchData.filter(d => !d.error).every(d => d.selected) ? 'Desmarcar' : 'Selecionar'} todas
                            </button>
                            <button className="btn btn-secondary btn-sm" onClick={() => { setBatchData([]); setBatchFiles([]); }}>
                                <Icon name="delete" size={14} /> Limpar
                            </button>
                        </div>
                    </div>

                    {/* Lista de NFs */}
                    <div style={{maxHeight: '500px', overflowY: 'auto', marginBottom: '16px'}}>
                        {batchData.map((nf, nfIdx) => (
                            <div key={nfIdx} style={{
                                border: '1px solid var(--border)',
                                borderRadius: 'var(--radius)',
                                marginBottom: '12px',
                                background: nf.error ? 'var(--danger-light)' : nf.selected ? 'var(--success-light)' : 'white',
                                opacity: nf.error ? 0.7 : 1
                            }}>
                                {/* Header da NF */}
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    padding: '12px',
                                    borderBottom: nf.error ? 'none' : '1px solid var(--border)',
                                    gap: '12px'
                                }}>
                                    <input
                                        type="checkbox"
                                        checked={nf.selected}
                                        disabled={!!nf.error}
                                        onChange={() => toggleSelection(nfIdx)}
                                        style={{width: '18px', height: '18px'}}
                                    />
                                    <div style={{flex: 1}}>
                                        <div style={{fontWeight: '600'}}>
                                            {nf.error ? 'Erro -' : ''} NF: {nf.nfNumero || nf.fileName}
                                        </div>
                                        <div style={{fontSize: '12px', color: 'var(--text-muted)'}}>
                                            {nf.error ? nf.error : `${nf.fornecedor} \u2022 ${nf.vinculados}/${nf.total} vinculados`}
                                        </div>
                                    </div>
                                    {!nf.error && (
                                        <span style={{
                                            background: nf.vinculados === nf.total ? 'var(--success-light)' : 'var(--warning-light)',
                                            color: nf.vinculados === nf.total ? 'var(--success)' : 'var(--warning)',
                                            padding: '4px 10px',
                                            borderRadius: '12px',
                                            fontSize: '11px',
                                            fontWeight: '600'
                                        }}>
                                            {nf.vinculados}/{nf.total}
                                        </span>
                                    )}
                                </div>

                                {/* Items da NF */}
                                {!nf.error && nf.selected && (
                                    <div style={{padding: '12px'}}>
                                        <table className="table" style={{marginBottom: 0}}>
                                            <thead>
                                                <tr>
                                                    <th>Produto NF</th>
                                                    <th style={{width: '60px'}}>Qtd</th>
                                                    <th style={{width: '250px'}}>Vincular a</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {nf.items.map((item, itemIdx) => (
                                                    <tr key={itemIdx}>
                                                        <td>
                                                            <div style={{fontWeight: '500'}}>{item.descricao?.substring(0, 40)}</div>
                                                            <div style={{fontSize: '10px', color: 'var(--text-muted)'}}>Cod: {item.codigo}</div>
                                                        </td>
                                                        <td>{item.quantidade}</td>
                                                        <td>
                                                            <select
                                                                className="form-select"
                                                                value={item.vinculado}
                                                                onChange={(e) => updateVinculo(nfIdx, itemIdx, e.target.value)}
                                                                style={{
                                                                    fontSize: '12px',
                                                                    background: item.vinculado ? 'var(--success-light)' : 'white'
                                                                }}
                                                            >
                                                                <option value="">Selecionar...</option>
                                                                {products.map(p => (
                                                                    <option key={p.id} value={p.sku}>{p.name}</option>
                                                                ))}
                                                            </select>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Botao de importar */}
                    <div className="btn-group">
                        <button
                            className="btn btn-success"
                            onClick={handleImportAll}
                            disabled={processing || batchData.filter(d => d.selected && !d.error).length === 0}
                        >
                            {processing ? 'Importando...' : 'Importar Selecionadas'}
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
