/**
 * ImportExcel.jsx — Import entries from Excel/CSV files
 *
 * Extracted from index-legacy.html L9198-9306
 * Uses Papa (PapaParse) and XLSX (SheetJS) from CDN globals
 */
import React, { useState } from 'react';
import { Icon } from '@/utils/icons';
import LocaisModal from '@/components/ui/LocaisModal';

export default function ImportExcel({ products, onImport, locaisOrigem, onUpdateLocais }) {
    const [data, setData] = useState(null);
    const [localEntrada, setLocalEntrada] = useState(locaisOrigem?.[0] || 'Loja Principal');
    const [showLocaisModal, setShowLocaisModal] = useState(false);

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.name.endsWith('.csv')) {
            Papa.parse(file, {
                header: true,
                complete: (results) => setData(results.data.filter(r => r.sku))
            });
        } else {
            const reader = new FileReader();
            reader.onload = (event) => {
                const wb = XLSX.read(event.target.result, {type: 'binary'});
                const ws = wb.Sheets[wb.SheetNames[0]];
                const json = XLSX.utils.sheet_to_json(ws);
                setData(json.filter(r => r.sku));
            };
            reader.readAsBinaryString(file);
        }
    };

    const handleImport = async () => {
        for (let row of data) {
            if (!row.sku || !row.quantidade) continue;
            if (!products.find(p => p.sku === row.sku)) continue;

            await onImport({
                type: 'COMPRA',
                sku: row.sku,
                quantity: parseInt(row.quantidade),
                supplier: row.fornecedor || '',
                nf: row.nf || '',
                localEntrada: row.local || localEntrada
            });
        }
        alert('Importacao concluida!');
        setData(null);
    };

    return (
        <div className="card">
            <h2 className="card-title">
                <Icon name="chart" size={16} className="card-title-icon" />
                Importar Excel/CSV
            </h2>

            <div style={{background: 'var(--bg-primary)', padding: '12px', borderRadius: 'var(--radius)', marginBottom: '16px', fontSize: '12px'}}>
                <strong>Colunas obrigatorias:</strong> sku, quantidade<br/>
                <strong>Colunas opcionais:</strong> fornecedor, nf, local
            </div>

            <div className="form-group">
                <label className="form-label">Local de Entrada Padrao *</label>
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
                <span className="form-help">Usado quando a planilha nao tiver coluna "local"</span>
            </div>

            {/* Modal Gerenciar Locais */}
            {showLocaisModal && (
                <LocaisModal
                    locaisOrigem={locaisOrigem}
                    onUpdateLocais={onUpdateLocais}
                    onClose={() => setShowLocaisModal(false)}
                />
            )}

            <div className="form-group">
                <label className="form-label">Arquivo Excel ou CSV</label>
                <input type="file" className="form-input" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} />
            </div>

            {data && data.length > 0 && (
                <div>
                    <p style={{marginBottom: '12px', fontSize: '13px'}}>{data.length} linha(s) encontrada(s)</p>
                    <div className="btn-group">
                        <button className="btn btn-success" onClick={handleImport}>Importar</button>
                        <button className="btn btn-secondary" onClick={() => setData(null)}>Cancelar</button>
                    </div>
                </div>
            )}
        </div>
    );
}
