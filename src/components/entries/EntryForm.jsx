/**
 * EntryForm.jsx — Manual entry form + Tiny/CSV import tabs
 *
 * Extracted from index-legacy.html L5268-5593
 */
import React, { useState } from 'react';
import { Icon } from '@/utils/icons';
import CategorySelectInline from '@/components/ui/CategorySelectInline';
import LocaisModal from '@/components/ui/LocaisModal';
import TinyNFeImport from '@/components/import/TinyNFeImport';
import CSVImportTab from '@/components/import/CSVImportTab';

export default function EntryForm({ products, onSubmit, onAddProduct, categories, locaisOrigem, onUpdateLocais, entries, exits, stock, onAddCategory, onUpdateCategory, onDeleteCategory }) {
    const [entryMode, setEntryMode] = useState('manual'); // 'manual', 'tiny', or 'csv'
    const [type, setType] = useState('COMPRA');
    const [sku, setSku] = useState('');
    const [quantity, setQuantity] = useState('');
    const [supplier, setSupplier] = useState('');
    const [nf, setNf] = useState('');
    const [localEntrada, setLocalEntrada] = useState(locaisOrigem?.[0] || 'Loja Principal');
    const [category, setCategory] = useState('');
    const [success, setSuccess] = useState(false);
    const [showNewProductModal, setShowNewProductModal] = useState(false);
    const [newProductData, setNewProductData] = useState({ name: '', sku: '', ean: '', category: '', observations: '', nfOrigem: '' });
    const [productSearch, setProductSearch] = useState('');
    const [showLocaisModal, setShowLocaisModal] = useState(false);

    // Filtrar produtos pela busca
    const filteredProducts = [...products]
        .filter(p => {
            if (!productSearch) return true;
            const search = productSearch.toLowerCase();
            return (p.name || '').toLowerCase().includes(search) ||
                   (p.sku || '').toLowerCase().includes(search);
        })
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit({ type, sku, quantity: parseInt(quantity), supplier, nf, localEntrada, category });
        setSuccess(true);
        setSku('');
        setQuantity('');
        setSupplier('');
        setNf('');
        setCategory('');
        setProductSearch('');
        setTimeout(() => setSuccess(false), 3000);
    };

    const handleProductChange = (value) => {
        if (value === '__NEW__') {
            // Preenche automaticamente a NF de origem com a NF da entrada
            setNewProductData({...newProductData, nfOrigem: nf});
            setShowNewProductModal(true);
        } else {
            setSku(value);
            setProductSearch('');
            // Preencher categoria do produto selecionado
            const selectedProduct = products.find(p => p.sku === value);
            if (selectedProduct?.category) {
                setCategory(selectedProduct.category);
            }
        }
    };

    const handleCreateProduct = async () => {
        if (!newProductData.name || !newProductData.sku || !newProductData.category) return;

        await onAddProduct({
            name: newProductData.name.trim(),
            sku: newProductData.sku.trim(),
            ean: newProductData.ean?.trim() || '',
            category: newProductData.category,
            observations: newProductData.observations?.trim() || '',
            nfOrigem: newProductData.nfOrigem?.trim() || nf || '',
            quantity: 0,
            createdAt: new Date().toISOString()
        });

        setSku(newProductData.sku.trim());
        setShowNewProductModal(false);
        setNewProductData({ name: '', sku: '', ean: '', category: '', observations: '', nfOrigem: '' });
    };

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">Entrada</h1>
                <p className="page-subtitle">Registre entradas de produtos no estoque</p>
            </div>

            <div className="card" style={{marginBottom: '16px'}}>
                <div className="filter-tabs">
                    <button className={`filter-tab ${entryMode === 'manual' ? 'active' : ''}`} onClick={() => setEntryMode('manual')}>
                        Entrada Manual
                    </button>
                    <button className={`filter-tab ${entryMode === 'tiny' ? 'active' : ''}`} onClick={() => setEntryMode('tiny')}>
                        Importar do Tiny
                    </button>
                    <button className={`filter-tab ${entryMode === 'csv' ? 'active' : ''}`} onClick={() => setEntryMode('csv')}>
                        Importar CSV
                    </button>
                </div>
            </div>

            {entryMode === 'tiny' && (
                <TinyNFeImport
                    products={products}
                    onSubmitEntry={onSubmit}
                    onSubmitExit={() => {}}
                    onAddProduct={onAddProduct}
                    categories={categories}
                    locaisOrigem={locaisOrigem}
                    onUpdateLocais={onUpdateLocais}
                    entries={entries || []}
                    exits={exits || []}
                    stock={stock || []}
                    mode="entry"
                    onAddCategory={onAddCategory}
                    onUpdateCategory={onUpdateCategory}
                    onDeleteCategory={onDeleteCategory}
                />
            )}

            {entryMode === 'csv' && (
                <CSVImportTab
                    type="entry"
                    products={products}
                    onImport={onSubmit}
                    locaisOrigem={locaisOrigem}
                    onUpdateLocais={onUpdateLocais}
                    onAddProduct={onAddProduct}
                    categories={categories}
                    onAddCategory={onAddCategory}
                    onUpdateCategory={onUpdateCategory}
                    onDeleteCategory={onDeleteCategory}
                />
            )}

            {entryMode === 'manual' && (<React.Fragment>
            {success && <div className="alert alert-success">Entrada registrada!</div>}

            {/* Modal Novo Produto */}
            {showNewProductModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h2 className="modal-title">Cadastrar Novo Produto</h2>
                        <p className="modal-subtitle">Preencha os dados do produto</p>

                        <div className="form-group">
                            <label className="form-label">Nome do Produto *</label>
                            <input
                                type="text"
                                className="form-input"
                                value={newProductData.name}
                                onChange={(e) => setNewProductData({...newProductData, name: e.target.value})}
                                placeholder="Ex: Luminaria LED Moderna"
                            />
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">SKU *</label>
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

                        <CategorySelectInline
                            categories={categories}
                            value={newProductData.category}
                            onChange={(val) => setNewProductData({...newProductData, category: val})}
                            onAddCategory={onAddCategory}
                            onUpdateCategory={onUpdateCategory}
                            onDeleteCategory={onDeleteCategory}
                            products={stock}
                        />

                        <div className="form-group">
                            <label className="form-label">NF de Origem</label>
                            <input
                                type="text"
                                className="form-input"
                                value={newProductData.nfOrigem}
                                onChange={(e) => setNewProductData({...newProductData, nfOrigem: e.target.value})}
                                placeholder="Numero da NF para localizar no estoque"
                            />
                            <span className="form-help">Preenchido automaticamente com a NF da entrada</span>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Observacoes</label>
                            <textarea
                                className="form-textarea"
                                value={newProductData.observations}
                                onChange={(e) => setNewProductData({...newProductData, observations: e.target.value})}
                                placeholder="Informacoes adicionais..."
                            />
                        </div>

                        <div className="btn-group">
                            <button className="btn btn-success" onClick={handleCreateProduct}>Cadastrar</button>
                            <button className="btn btn-secondary" onClick={() => setShowNewProductModal(false)}>Cancelar</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="card">
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="form-label">Tipo</label>
                        <div className="form-radio-group">
                            <label className="form-radio-label">
                                <input type="radio" value="COMPRA" checked={type === 'COMPRA'} onChange={(e) => setType(e.target.value)} />
                                <span>Compra</span>
                            </label>
                            <label className="form-radio-label">
                                <input type="radio" value="DEVOLUCAO" checked={type === 'DEVOLUCAO'} onChange={(e) => setType(e.target.value)} />
                                <span>Devolucao</span>
                            </label>
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Produto ({products.length} cadastrados)</label>
                        <input
                            type="text"
                            className="form-input"
                            placeholder="Buscar produto por nome ou SKU..."
                            value={productSearch}
                            onChange={(e) => setProductSearch(e.target.value)}
                            style={{marginBottom: '8px'}}
                        />
                        <select className="form-select" value={sku} onChange={(e) => handleProductChange(e.target.value)} required>
                            <option value="">Selecione... ({filteredProducts.length} encontrados)</option>
                            <option value="__NEW__" style={{fontWeight: '600', color: 'var(--accent)'}}>+ Cadastrar novo produto</option>
                            {filteredProducts.length > 0 && (
                                <optgroup label="Produtos">
                                    {filteredProducts.map(p => (
                                        <option key={p.id} value={p.sku}>{p.name}</option>
                                    ))}
                                </optgroup>
                            )}
                        </select>
                        {products.length === 0 && (
                            <span className="form-help" style={{color: 'var(--warning)'}}>
                                Nenhum produto cadastrado. Clique em "+ Cadastrar novo produto".
                            </span>
                        )}
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">Quantidade</label>
                            <input type="number" className="form-input" value={quantity} onChange={(e) => setQuantity(e.target.value)} min="1" required />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Fornecedor</label>
                            <input type="text" className="form-input" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Nota Fiscal</label>
                        <input type="text" className="form-input" value={nf} onChange={(e) => setNf(e.target.value)} />
                    </div>

                    <div className="form-group">
                        <label className="form-label">Local de Entrada *</label>
                        <div style={{display: 'flex', gap: '8px'}}>
                            <select
                                className="form-select"
                                value={localEntrada}
                                onChange={(e) => setLocalEntrada(e.target.value)}
                                required
                                style={{flex: 1}}
                            >
                                {(locaisOrigem || ['Loja Principal', 'Deposito 1', 'Deposito 2']).map((local, idx) => (
                                    <option key={idx} value={local}>{local}</option>
                                ))}
                            </select>
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => setShowLocaisModal(true)}
                                title="Gerenciar locais/depositos"
                                style={{padding: '8px 12px'}}
                            >
                                <Icon name="settings" size={14} />
                            </button>
                        </div>
                        <span className="form-help">Selecione o deposito onde o produto esta sendo armazenado</span>
                    </div>

                    <CategorySelectInline
                        categories={categories}
                        value={category}
                        onChange={setCategory}
                        onAddCategory={onAddCategory}
                        onUpdateCategory={onUpdateCategory}
                        onDeleteCategory={onDeleteCategory}
                        products={products}
                    />

                    <div className="btn-group">
                        <button type="submit" className="btn btn-primary" disabled={!sku || sku === '__NEW__'}>Registrar Entrada</button>
                    </div>
                </form>
            </div>

            {/* Modal Gerenciar Locais - FORA DO FORM */}
            {showLocaisModal && (
                <LocaisModal
                    locaisOrigem={locaisOrigem}
                    onUpdateLocais={onUpdateLocais}
                    onClose={() => setShowLocaisModal(false)}
                />
            )}
            </React.Fragment>)}
        </div>
    );
}
