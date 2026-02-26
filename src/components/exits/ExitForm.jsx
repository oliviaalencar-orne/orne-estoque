/**
 * ExitForm.jsx — Manual exit form + Tiny/CSV import tabs
 *
 * Extracted from index-legacy.html L5748-6107
 * CRITICAL: Uses normalizeNfKey/getEstoquePorNF from @/utils/fifo (NOT duplicated)
 */
import React, { useState } from 'react';
import { normalizeNfKey, getEstoquePorNF } from '@/utils/fifo';
import TinyNFeImport from '@/components/import/TinyNFeImport';
import CSVImportTab from '@/components/import/CSVImportTab';

export default function ExitForm({ products, stock, onSubmit, entries, exits, onAddProduct, categories, locaisOrigem, onUpdateLocais, onAddCategory, onUpdateCategory, onDeleteCategory }) {
    const [exitMode, setExitMode] = useState('manual'); // 'manual', 'tiny', or 'csv'
    const [type, setType] = useState('VENDA');
    const [sku, setSku] = useState('');
    const [nfOrigem, setNfOrigem] = useState(''); // NF de onde esta saindo
    const [quantity, setQuantity] = useState('');
    const [client, setClient] = useState('');
    const [nf, setNf] = useState(''); // NF de venda/saida
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState('');
    const [productSearch, setProductSearch] = useState('');

    // Filtrar produtos pela busca
    const filteredProducts = [...stock]
        .filter(p => {
            if (!productSearch) return true;
            const search = productSearch.toLowerCase();
            return (p.name || '').toLowerCase().includes(search) ||
                   (p.sku || '').toLowerCase().includes(search) ||
                   (p.nfOrigem || '').toLowerCase().includes(search);
        })
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    const selectedProduct = stock.find(p => p.sku === sku);

    // Calcular estoque disponivel por NF de entrada para o produto selecionado
    // Usa getEstoquePorNF importado de @/utils/fifo (params: produtoSku, entries, exits)
    const estoquePorNF = getEstoquePorNF(sku, entries, exits);
    const nfSelecionada = estoquePorNF.find(e => e.nf === nfOrigem);
    const availableFromNF = nfSelecionada?.quantidade || 0;
    const totalAvailable = selectedProduct?.currentQuantity || 0;

    const handleSubmit = (e) => {
        e.preventDefault();

        // Se selecionou uma NF especifica, validar quantidade
        if (nfOrigem && parseInt(quantity) > availableFromNF) {
            setError(`Quantidade insuficiente na NF ${nfOrigem}! Disponivel: ${availableFromNF}`);
            return;
        }

        if (parseInt(quantity) > totalAvailable) {
            setError(`Quantidade insuficiente! Disponivel total: ${totalAvailable}`);
            return;
        }

        onSubmit({
            type,
            sku,
            quantity: parseInt(quantity),
            client,
            nf,
            nfOrigem: (nfOrigem && nfOrigem !== 'Sem NF' && nfOrigem !== 'SEM_NF') ? nfOrigem : null
        });
        setSuccess(true);
        setError('');
        setSku('');
        setNfOrigem('');
        setQuantity('');
        setClient('');
        setNf('');
        setProductSearch('');
        setTimeout(() => setSuccess(false), 3000);
    };

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">Saida</h1>
                <p className="page-subtitle">Registre saidas de produtos do estoque</p>
            </div>

            <div className="card" style={{marginBottom: '16px'}}>
                <div className="filter-tabs">
                    <button className={`filter-tab ${exitMode === 'manual' ? 'active' : ''}`} onClick={() => setExitMode('manual')}>
                        Saida Manual
                    </button>
                    <button className={`filter-tab ${exitMode === 'tiny' ? 'active' : ''}`} onClick={() => setExitMode('tiny')}>
                        Importar do Tiny
                    </button>
                    <button className={`filter-tab ${exitMode === 'csv' ? 'active' : ''}`} onClick={() => setExitMode('csv')}>
                        Importar CSV
                    </button>
                </div>
            </div>

            {exitMode === 'tiny' && (
                <TinyNFeImport
                    products={products}
                    onSubmitEntry={() => {}}
                    onSubmitExit={onSubmit}
                    onAddProduct={onAddProduct}
                    categories={categories}
                    locaisOrigem={locaisOrigem || []}
                    onUpdateLocais={onUpdateLocais}
                    entries={entries || []}
                    exits={exits || []}
                    stock={stock || []}
                    mode="exit"
                    onAddCategory={onAddCategory}
                    onUpdateCategory={onUpdateCategory}
                    onDeleteCategory={onDeleteCategory}
                />
            )}

            {exitMode === 'csv' && (
                <CSVImportTab
                    type="exit"
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

            {exitMode === 'manual' && (<React.Fragment>
            {success && <div className="alert alert-success">Saida registrada!</div>}
            {error && <div className="alert alert-danger">{error}</div>}

            <div className="card">
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="form-label">Tipo</label>
                        <div className="form-radio-group">
                            <label className="form-radio-label">
                                <input type="radio" value="VENDA" checked={type === 'VENDA'} onChange={(e) => setType(e.target.value)} />
                                <span>Venda</span>
                            </label>
                            <label className="form-radio-label">
                                <input type="radio" value="PERDA" checked={type === 'PERDA'} onChange={(e) => setType(e.target.value)} />
                                <span>Perda</span>
                            </label>
                            <label className="form-radio-label">
                                <input type="radio" value="DEVOLUCAO_FORNECEDOR" checked={type === 'DEVOLUCAO_FORNECEDOR'} onChange={(e) => setType(e.target.value)} />
                                <span>Devolucao ao Fornecedor</span>
                            </label>
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Produto ({stock.length} em estoque)</label>
                        <input
                            type="text"
                            className="form-input"
                            placeholder="Buscar por nome, SKU ou NF..."
                            value={productSearch}
                            onChange={(e) => setProductSearch(e.target.value)}
                            style={{marginBottom: '8px'}}
                        />
                        <select className="form-select" value={sku} onChange={(e) => { setSku(e.target.value); setNfOrigem(''); setProductSearch(''); }} required>
                            <option value="">Selecione... ({filteredProducts.length} encontrados)</option>
                            {filteredProducts.map(p => (
                                <option key={p.id} value={p.sku}>
                                    {p.name} ({p.currentQuantity} un.)
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Selecao de NF de origem */}
                    {selectedProduct && estoquePorNF.length > 0 && (
                        <div className="form-group">
                            <label className="form-label">Retirar do estoque da NF:</label>
                            <div style={{
                                border: '1px solid var(--border)',
                                borderRadius: 'var(--radius)',
                                maxHeight: '200px',
                                overflowY: 'auto'
                            }}>
                                {estoquePorNF.map((item, idx) => (
                                    <label
                                        key={idx}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            padding: '12px',
                                            borderBottom: idx < estoquePorNF.length - 1 ? '1px solid var(--border)' : 'none',
                                            cursor: 'pointer',
                                            background: nfOrigem === item.nf ? 'var(--accent-bg)' : 'white',
                                            transition: 'background 0.2s'
                                        }}
                                    >
                                        <input
                                            type="radio"
                                            name="nfOrigem"
                                            value={item.nf}
                                            checked={nfOrigem === item.nf}
                                            onChange={(e) => setNfOrigem(e.target.value)}
                                            style={{marginRight: '12px', width: '18px', height: '18px'}}
                                        />
                                        <div style={{flex: 1}}>
                                            <div style={{fontWeight: '600', color: 'var(--text-primary)'}}>
                                                NF: {item.nf}
                                            </div>
                                            <div style={{fontSize: '12px', color: 'var(--text-muted)'}}>
                                                {item.quantidade} unidade(s) disponivel(is)
                                                {item.localEntrada && item.localEntrada !== '-' && <span style={{marginLeft: '8px', color: 'var(--accent)'}}>{item.localEntrada}</span>}
                                                {item.data && ` \u2022 Entrada: ${new Date(item.data).toLocaleDateString('pt-BR')}`}
                                            </div>
                                        </div>
                                        <div style={{
                                            background: 'var(--success-light)',
                                            color: 'var(--success)',
                                            padding: '4px 12px',
                                            borderRadius: '20px',
                                            fontSize: '12px',
                                            fontWeight: '600'
                                        }}>
                                            {item.quantidade} un.
                                        </div>
                                    </label>
                                ))}
                            </div>
                            {!nfOrigem && (
                                <div style={{fontSize: '11px', color: 'var(--warning)', marginTop: '6px'}}>
                                    Selecione a NF de onde o produto sera retirado
                                </div>
                            )}
                        </div>
                    )}

                    {selectedProduct && (
                        <div style={{marginBottom: '16px', padding: '12px', background: 'var(--bg-primary)', borderRadius: 'var(--radius)', fontSize: '13px'}}>
                            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                                <div>
                                    <strong>Estoque total: {totalAvailable} un.</strong>
                                </div>
                                {nfOrigem && (
                                    <div style={{color: 'var(--accent)', fontWeight: '500'}}>
                                        Selecionado: NF {nfOrigem} ({availableFromNF} un.)
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">Quantidade *</label>
                            <input
                                type="number"
                                className="form-input"
                                value={quantity}
                                onChange={(e) => setQuantity(e.target.value)}
                                min="1"
                                max={nfOrigem ? availableFromNF : totalAvailable}
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Cliente</label>
                            <input type="text" className="form-input" value={client} onChange={(e) => setClient(e.target.value)} />
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">NF de Saida/Venda</label>
                        <input
                            type="text"
                            className="form-input"
                            value={nf}
                            onChange={(e) => setNf(e.target.value)}
                            placeholder="Numero da nota fiscal de venda"
                        />
                    </div>

                    <div className="btn-group">
                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={selectedProduct && estoquePorNF.length > 0 && !nfOrigem}
                        >
                            Registrar Saida
                        </button>
                    </div>
                </form>
            </div>
            </React.Fragment>)}
        </div>
    );
}
