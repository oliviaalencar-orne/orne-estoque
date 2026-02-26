/**
 * ImportNFe.jsx — Import single NF-e XML file
 *
 * Extracted from index-legacy.html L8926-9197
 */
import React, { useState } from 'react';
import { Icon } from '@/utils/icons';
import LocaisModal from '@/components/ui/LocaisModal';

export default function ImportNFe({ products, onImport, onAddProduct, categories, locaisOrigem, onUpdateLocais }) {
    const [nfeData, setNfeData] = useState(null);
    const [productMapping, setProductMapping] = useState({});
    const [showNewProductModal, setShowNewProductModal] = useState(false);
    const [newProductIndex, setNewProductIndex] = useState(null);
    const [newProductData, setNewProductData] = useState({ name: '', sku: '', ean: '', category: '' });
    const [localEntrada, setLocalEntrada] = useState(locaisOrigem?.[0] || 'Loja Principal');
    const [showLocaisModal, setShowLocaisModal] = useState(false);

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const parser = new DOMParser();
                const xml = parser.parseFromString(event.target.result, 'text/xml');
                const ns = 'http://www.portalfiscal.inf.br/nfe';

                const getNsValue = (parent, tag) => {
                    const el = parent.getElementsByTagNameNS(ns, tag)[0] || parent.getElementsByTagName(tag)[0];
                    return el?.textContent || '';
                };

                const ide = xml.getElementsByTagNameNS(ns, 'ide')[0] || xml.getElementsByTagName('ide')[0];
                const emit = xml.getElementsByTagNameNS(ns, 'emit')[0] || xml.getElementsByTagName('emit')[0];
                const dets = xml.getElementsByTagNameNS(ns, 'det').length > 0
                    ? xml.getElementsByTagNameNS(ns, 'det')
                    : xml.getElementsByTagName('det');

                const items = [];
                for (let det of dets) {
                    const prod = det.getElementsByTagNameNS(ns, 'prod')[0] || det.getElementsByTagName('prod')[0];
                    items.push({
                        codigo: getNsValue(prod, 'cProd'),
                        ean: getNsValue(prod, 'cEAN'),
                        descricao: getNsValue(prod, 'xProd'),
                        quantidade: parseFloat(getNsValue(prod, 'qCom')) || 1
                    });
                }

                setNfeData({
                    numero: getNsValue(ide, 'nNF'),
                    fornecedor: getNsValue(emit, 'xNome'),
                    items
                });

                const mapping = {};
                items.forEach((item, idx) => {
                    const found = products.find(p => p.ean === item.ean || p.sku === item.codigo);
                    mapping[idx] = found?.sku || '';
                });
                setProductMapping(mapping);

            } catch (err) {
                alert('Erro ao ler XML: ' + err.message);
            }
        };
        reader.readAsText(file);
    };

    const updateProductMapping = (index, value) => {
        if (value === '__NEW__') {
            setNewProductIndex(index);
            setNewProductData({
                name: nfeData.items[index].descricao,
                sku: nfeData.items[index].codigo,
                ean: nfeData.items[index].ean,
                category: ''
            });
            setShowNewProductModal(true);
        } else {
            setProductMapping({...productMapping, [index]: value});
        }
    };

    const handleCreateNewProduct = async () => {
        if (!newProductData.name || !newProductData.sku || !newProductData.category) return;

        await onAddProduct({
            name: newProductData.name,
            sku: newProductData.sku,
            ean: newProductData.ean || '',
            category: newProductData.category,
            quantity: 0
        });

        setProductMapping({...productMapping, [newProductIndex]: newProductData.sku});
        setShowNewProductModal(false);
        setNewProductIndex(null);
    };

    const handleImport = async () => {
        for (let i = 0; i < nfeData.items.length; i++) {
            const item = nfeData.items[i];
            const sku = productMapping[i];
            if (!sku) continue;

            await onImport({
                type: 'COMPRA',
                sku,
                quantity: Math.round(item.quantidade),
                supplier: nfeData.fornecedor,
                nf: nfeData.numero,
                localEntrada: localEntrada
            });
        }
        alert('Importacao concluida!');
        setNfeData(null);
    };

    return (
        <div className="card">
            {/* Modal Novo Produto */}
            {showNewProductModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h2 className="modal-title">Cadastrar Novo Produto</h2>
                        <p className="modal-subtitle">Dados extraidos da NF-e</p>

                        <div className="form-group">
                            <label className="form-label">Nome</label>
                            <input
                                type="text"
                                className="form-input"
                                value={newProductData.name}
                                onChange={(e) => setNewProductData({...newProductData, name: e.target.value})}
                            />
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">SKU</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={newProductData.sku}
                                    onChange={(e) => setNewProductData({...newProductData, sku: e.target.value})}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">EAN</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={newProductData.ean}
                                    onChange={(e) => setNewProductData({...newProductData, ean: e.target.value})}
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Categoria *</label>
                            <select
                                className="form-select"
                                value={newProductData.category}
                                onChange={(e) => setNewProductData({...newProductData, category: e.target.value})}
                            >
                                <option value="">Selecione...</option>
                                {categories.map(cat => (
                                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="btn-group">
                            <button className="btn btn-success" onClick={handleCreateNewProduct}>Cadastrar</button>
                            <button className="btn btn-secondary" onClick={() => setShowNewProductModal(false)}>Cancelar</button>
                        </div>
                    </div>
                </div>
            )}

            <h2 className="card-title">
                <Icon name="file" size={16} className="card-title-icon" />
                Importar NF-e (XML)
            </h2>

            <div className="form-group">
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
                <span className="form-help">Selecione o deposito onde os produtos serao armazenados</span>
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
                <label className="form-label">Arquivo XML da NF-e</label>
                <input type="file" className="form-input" accept=".xml" onChange={handleFileUpload} />
            </div>

            {nfeData && (
                <div>
                    <div style={{background: 'var(--bg-primary)', padding: '12px', borderRadius: 'var(--radius)', marginBottom: '16px'}}>
                        <strong>NF:</strong> {nfeData.numero} | <strong>Fornecedor:</strong> {nfeData.fornecedor}
                    </div>

                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Produto NF-e</th>
                                    <th>Qtd</th>
                                    <th>Vincular a</th>
                                </tr>
                            </thead>
                            <tbody>
                                {nfeData.items.map((item, idx) => (
                                    <tr key={idx}>
                                        <td>
                                            <div style={{fontWeight: '500'}}>{item.descricao.substring(0, 40)}...</div>
                                            <div style={{fontSize: '11px', color: 'var(--text-muted)'}}>Codigo: {item.codigo}</div>
                                        </td>
                                        <td>{item.quantidade}</td>
                                        <td>
                                            <select
                                                className="form-select"
                                                value={productMapping[idx] || ''}
                                                onChange={(e) => updateProductMapping(idx, e.target.value)}
                                                style={{minWidth: '200px'}}
                                            >
                                                <option value="">Selecionar...</option>
                                                <option value="__NEW__" style={{fontWeight: '600'}}>+ Criar novo produto</option>
                                                <optgroup label="Produtos">
                                                    {products.map(p => <option key={p.id} value={p.sku}>{p.name}</option>)}
                                                </optgroup>
                                            </select>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="btn-group">
                        <button className="btn btn-success" onClick={handleImport}>Importar Entrada</button>
                        <button className="btn btn-secondary" onClick={() => setNfeData(null)}>Cancelar</button>
                    </div>
                </div>
            )}
        </div>
    );
}
