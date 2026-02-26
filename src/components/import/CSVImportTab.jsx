/**
 * CSVImportTab.jsx — Import entries/exits/shippings via CSV/Excel
 *
 * Extracted from index-legacy.html L4974-5264
 * Uses PapaParse for CSV and SheetJS for Excel parsing
 */
import React, { useState } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { Icon } from '@/utils/icons';
import LocaisModal from '@/components/ui/LocaisModal';
import CategorySelectInline from '@/components/ui/CategorySelectInline';

export default function CSVImportTab({ type, products, onImport, onImportShipping, locaisOrigem, onUpdateLocais, onAddProduct, categories, onAddCategory, onUpdateCategory, onDeleteCategory }) {
    const [csvData, setCsvData] = useState(null);
    const [csvFile, setCsvFile] = useState(null);
    const [localEntrada, setLocalEntrada] = useState(locaisOrigem?.[0] || 'Loja Principal');
    const [showLocaisModal, setShowLocaisModal] = useState(false);
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState(null);
    const [showNewProductModal, setShowNewProductModal] = useState(null); // SKU string
    const [newProductData, setNewProductData] = useState({ name: '', sku: '', ean: '', category: '' });

    const isEntry = type === 'entry';
    const isExit = type === 'exit';
    const isShipping = type === 'shipping';

    const columnInfo = isEntry
        ? { required: 'sku, quantidade', optional: 'fornecedor, nf, local' }
        : isExit
        ? { required: 'sku, quantidade', optional: 'cliente, nf, nf_origem, local' }
        : { required: 'nf_numero', optional: 'cliente, destino, local_origem, transportadora, codigo_rastreio, link_rastreio, observacoes' };

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setCsvFile(file.name);
        setImportResult(null);

        if (file.name.endsWith('.csv')) {
            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => setCsvData(results.data.filter(r => isShipping ? r.nf_numero : r.sku))
            });
        } else {
            const reader = new FileReader();
            reader.onload = (event) => {
                const wb = XLSX.read(event.target.result, {type: 'binary'});
                const ws = wb.Sheets[wb.SheetNames[0]];
                const json = XLSX.utils.sheet_to_json(ws);
                setCsvData(json.filter(r => isShipping ? r.nf_numero : r.sku));
            };
            reader.readAsBinaryString(file);
        }
    };

    const handleImport = async () => {
        if (!csvData || csvData.length === 0) return;
        setImporting(true);
        let imported = 0, skipped = 0;

        try {
            if (isEntry) {
                for (let row of csvData) {
                    if (!row.sku || !row.quantidade) { skipped++; continue; }
                    if (!products.find(p => p.sku === row.sku)) { skipped++; continue; }
                    await onImport({
                        type: 'COMPRA',
                        sku: row.sku,
                        quantity: parseInt(row.quantidade),
                        supplier: row.fornecedor || '',
                        nf: row.nf || '',
                        localEntrada: row.local || localEntrada
                    });
                    imported++;
                }
            } else if (isExit) {
                for (let row of csvData) {
                    if (!row.sku || !row.quantidade) { skipped++; continue; }
                    if (!products.find(p => p.sku === row.sku)) { skipped++; continue; }
                    await onImport({
                        type: 'VENDA',
                        sku: row.sku,
                        quantity: parseInt(row.quantidade),
                        client: row.cliente || '',
                        nf: row.nf || '',
                        nfOrigem: row.nf_origem || null
                    });
                    imported++;
                }
            } else if (isShipping) {
                for (let row of csvData) {
                    if (!row.nf_numero) { skipped++; continue; }
                    await onImportShipping({
                        nfNumero: row.nf_numero,
                        cliente: row.cliente || '',
                        destino: row.destino || '',
                        localOrigem: row.local_origem || localEntrada,
                        transportadora: row.transportadora || '',
                        codigoRastreio: row.codigo_rastreio || '',
                        linkRastreio: row.link_rastreio || '',
                        produtos: [],
                        status: 'preparando',
                        observacoes: row.observacoes || ''
                    });
                    imported++;
                }
            }

            setImportResult({ imported, skipped });
            if (imported > 0) setCsvData(null);
        } catch (err) {
            setImportResult({ error: err.message });
        } finally {
            setImporting(false);
        }
    };

    const previewColumns = csvData && csvData.length > 0 ? Object.keys(csvData[0]) : [];

    // Count missing products in CSV
    const missingSKUs = !isShipping && csvData ? csvData.filter(r => r.sku && !products.find(p => p.sku === r.sku)).map(r => r.sku) : [];
    const uniqueMissingSKUs = [...new Set(missingSKUs)];

    const handleCreateProduct = async () => {
        if (!newProductData.name || !newProductData.sku || !newProductData.category) return;
        await onAddProduct({
            name: newProductData.name,
            sku: newProductData.sku,
            ean: newProductData.ean || '',
            category: newProductData.category,
            minStock: 3
        });
        setShowNewProductModal(null);
        setNewProductData({ name: '', sku: '', ean: '', category: '' });
    };

    return (
        <div className="card">
            <h2 className="card-title" style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                <Icon name="import" size={16} />
                Importar {isEntry ? 'Entradas' : isExit ? 'Saidas' : 'Despachos'} via CSV
            </h2>

            <div style={{background: 'var(--bg-primary)', padding: '12px', borderRadius: 'var(--radius)', marginBottom: '16px', fontSize: '12px'}}>
                <strong>Colunas obrigatorias:</strong> {columnInfo.required}<br/>
                <strong>Colunas opcionais:</strong> {columnInfo.optional}
            </div>

            {(isEntry || isShipping) && (
                <div className="form-group">
                    <label className="form-label">Local {isEntry ? 'de Entrada' : 'de Origem'} Padrao</label>
                    <div style={{display: 'flex', gap: '8px'}}>
                        <select className="form-select" value={localEntrada} onChange={(e) => setLocalEntrada(e.target.value)} style={{flex: 1}}>
                            {(locaisOrigem || ['Loja Principal']).map((local, idx) => (
                                <option key={idx} value={local}>{local}</option>
                            ))}
                        </select>
                        <button type="button" className="btn btn-secondary" onClick={() => setShowLocaisModal(true)} title="Gerenciar locais" style={{padding: '8px 12px'}}>
                            <Icon name="settings" size={14} />
                        </button>
                    </div>
                    <span className="form-help">Usado quando a planilha nao tiver coluna "{isEntry ? 'local' : 'local_origem'}"</span>
                </div>
            )}

            {showLocaisModal && (
                <LocaisModal locaisOrigem={locaisOrigem} onUpdateLocais={onUpdateLocais} onClose={() => setShowLocaisModal(false)} />
            )}

            <div className="form-group">
                <label className="form-label">Arquivo Excel ou CSV</label>
                <input type="file" className="form-input" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} />
            </div>

            {importResult && (
                <div className={`alert ${importResult.error ? 'alert-danger' : 'alert-success'}`} style={{marginBottom: '16px'}}>
                    {importResult.error
                        ? `Erro na importacao: ${importResult.error}`
                        : `Importacao concluida! ${importResult.imported} registro(s) importado(s)${importResult.skipped > 0 ? `, ${importResult.skipped} pulado(s)` : ''}.`
                    }
                </div>
            )}

            {csvData && csvData.length > 0 && (
                <div>
                    <div style={{marginBottom: '12px', fontSize: '13px', fontWeight: '500'}}>
                        {csvData.length} linha(s) encontrada(s) {csvFile && <span style={{color: 'var(--text-muted)'}}>&mdash; {csvFile}</span>}
                    </div>

                    {!isShipping && uniqueMissingSKUs.length > 0 && (
                        <div className="alert alert-warning" style={{marginBottom: '16px'}}>
                            <strong>{uniqueMissingSKUs.length} SKU(s) nao encontrado(s) no sistema</strong> &mdash; serao pulados na importacao.
                            <div style={{marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '4px'}}>
                                {uniqueMissingSKUs.slice(0, 10).map(sku => (
                                    <span key={sku} style={{display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--bg-primary)', padding: '2px 8px', borderRadius: '4px', fontSize: '11px'}}>
                                        {sku}
                                        {onAddProduct && (
                                            <button type="button" onClick={() => { setNewProductData({ name: '', sku, ean: '', category: '' }); setShowNewProductModal(sku); }} style={{background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', fontSize: '11px', padding: '0 2px', fontWeight: '600'}}>
                                                + cadastrar
                                            </button>
                                        )}
                                    </span>
                                ))}
                                {uniqueMissingSKUs.length > 10 && <span style={{fontSize: '11px', color: 'var(--text-muted)'}}>... e mais {uniqueMissingSKUs.length - 10}</span>}
                            </div>
                        </div>
                    )}

                    <div className="table-container" style={{border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', marginBottom: '16px', maxHeight: '300px', overflowY: 'auto'}}>
                        <table className="table" style={{fontSize: '12px'}}>
                            <thead>
                                <tr>
                                    {!isShipping && <th>Status</th>}
                                    {previewColumns.map(col => <th key={col}>{col}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {csvData.slice(0, 10).map((row, i) => {
                                    const found = isShipping || products.find(p => p.sku === row.sku);
                                    return (
                                        <tr key={i} style={!found ? {background: 'var(--danger-bg, #fff5f5)'} : undefined}>
                                            {!isShipping && (
                                                <td>
                                                    {found
                                                        ? <span className="badge badge-success" style={{fontSize: '10px'}}>OK</span>
                                                        : <span className="badge badge-danger" style={{fontSize: '10px'}}>Nao encontrado</span>
                                                    }
                                                </td>
                                            )}
                                            {previewColumns.map(col => (
                                                <td key={col} style={{maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{row[col] || ''}</td>
                                            ))}
                                        </tr>
                                    );
                                })}
                                {csvData.length > 10 && (
                                    <tr><td colSpan={previewColumns.length + (isShipping ? 0 : 1)} style={{textAlign: 'center', color: 'var(--text-muted)', fontStyle: 'italic'}}>... e mais {csvData.length - 10} linha(s)</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="btn-group">
                        <button className="btn btn-primary" onClick={handleImport} disabled={importing}>
                            {importing ? 'Importando...' : `Importar ${csvData.length - missingSKUs.length} registro(s)`}
                        </button>
                        <button className="btn btn-secondary" onClick={() => { setCsvData(null); setCsvFile(null); setImportResult(null); }}>
                            Cancelar
                        </button>
                    </div>
                </div>
            )}

            {/* Modal Cadastrar Produto */}
            {showNewProductModal && onAddProduct && (
                <div className="modal-overlay" onClick={() => setShowNewProductModal(null)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: '500px'}}>
                        <h3 style={{margin: '0 0 16px'}}>Cadastrar Produto</h3>
                        <div className="form-group">
                            <label className="form-label">Nome *</label>
                            <input className="form-input" value={newProductData.name} onChange={e => setNewProductData({...newProductData, name: e.target.value})} />
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">SKU *</label>
                                <input className="form-input" value={newProductData.sku} onChange={e => setNewProductData({...newProductData, sku: e.target.value})} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">EAN</label>
                                <input className="form-input" value={newProductData.ean} onChange={e => setNewProductData({...newProductData, ean: e.target.value})} />
                            </div>
                        </div>
                        {onAddCategory ? (
                            <CategorySelectInline
                                categories={categories}
                                value={newProductData.category}
                                onChange={(val) => setNewProductData({...newProductData, category: val})}
                                onAddCategory={onAddCategory}
                                onUpdateCategory={onUpdateCategory}
                                onDeleteCategory={onDeleteCategory}
                                products={products}
                            />
                        ) : (
                            <div className="form-group">
                                <label className="form-label">Categoria *</label>
                                <select className="form-select" value={newProductData.category} onChange={e => setNewProductData({...newProductData, category: e.target.value})}>
                                    <option value="">Selecione...</option>
                                    {(categories || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                        )}
                        <div className="btn-group" style={{marginTop: '16px'}}>
                            <button className="btn btn-primary" onClick={handleCreateProduct} disabled={!newProductData.name || !newProductData.sku || !newProductData.category}>Cadastrar</button>
                            <button className="btn btn-secondary" onClick={() => setShowNewProductModal(null)}>Cancelar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
