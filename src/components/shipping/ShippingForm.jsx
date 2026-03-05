/**
 * ShippingForm.jsx — Shipping registration form
 *
 * Extracted from ShippingManager (index-legacy.html L7923-8455)
 * Renders the form, product table with linking, NF origin selection.
 * Does NOT handle submit — that stays in ShippingManager.
 */
import React, { useState } from 'react';
import { Icon } from '@/utils/icons';
import { getEstoquePorNF } from '@/utils/fifo';
import CategorySelectInline from '@/components/ui/CategorySelectInline';

export default function ShippingForm({
    form, setForm, nfData, setNfData, nfFile, setNfFile,
    stock, products, entries, exits, locaisOrigem,
    categories, transportadoras, onAddProduct,
    onAddCategory, onUpdateCategory, onDeleteCategory,
    onSubmit, onCancel, gerarLinkRastreio
}) {
    const [showVincularModal, setShowVincularModal] = useState(null);
    const [vincularSearch, setVincularSearch] = useState('');
    const [showNewProductModal, setShowNewProductModal] = useState(null);
    const [newProductData, setNewProductData] = useState({
        name: '', sku: '', ean: '', category: '', minStock: 1, observations: ''
    });
    const [error, setError] = useState('');

    // Vincular produto da NF com estoque
    const handleVincularProduto = (index, skuEstoque) => {
        const newProdutos = [...form.produtos];
        const produtoEstoque = stock.find(p =>
            (p.sku || '').toLowerCase() === (skuEstoque || '').toLowerCase()
        );
        newProdutos[index] = {
            ...newProdutos[index],
            produtoEstoque: produtoEstoque || null,
            baixarEstoque: !!produtoEstoque
        };
        setForm({...form, produtos: newProdutos});

        if (produtoEstoque) {
            console.log('Produto vinculado manualmente:', produtoEstoque.name);
        }
    };

    // Abrir modal para cadastrar novo produto
    const handleOpenNewProduct = (index) => {
        const prod = form.produtos[index];
        setNewProductData({
            name: prod.nome || '',
            sku: prod.sku || '',
            ean: prod.ean || '',
            category: categories[0]?.id || '',
            minStock: 1,
            observations: `Cadastrado via NF ${form.nfNumero}`
        });
        setShowNewProductModal(index);
    };

    // Cadastrar novo produto e vincular
    const handleCreateAndLinkProduct = async () => {
        if (!newProductData.name || !newProductData.sku || !newProductData.category) {
            setError('Preencha nome, SKU e categoria');
            return;
        }

        try {
            const newProduct = await onAddProduct({
                ...newProductData,
                quantity: 0,
                createdAt: new Date().toISOString()
            });

            const newProdutos = [...form.produtos];
            newProdutos[showNewProductModal] = {
                ...newProdutos[showNewProductModal],
                produtoEstoque: { ...newProductData, id: newProduct.id, currentQuantity: 0 },
                baixarEstoque: false
            };
            setForm({...form, produtos: newProdutos});

            setShowNewProductModal(null);
            setNewProductData({ name: '', sku: '', ean: '', category: '', minStock: 1, observations: '' });
        } catch (err) {
            setError('Erro ao cadastrar: ' + err.message);
        }
    };

    return (
        <div className="card">
            <h2 className="card-title">
                <Icon name="edit" size={16} className="card-title-icon" />
                {nfData ? 'Confirmar Dados do Despacho' : 'Cadastrar Despacho Manual'}
            </h2>

            {error && <div className="alert alert-danger">{error}</div>}

            <form onSubmit={onSubmit}>
                <div className="form-row">
                    <div className="form-group">
                        <label className="form-label">Número da NF *</label>
                        <input
                            type="text"
                            className="form-input"
                            value={form.nfNumero}
                            onChange={(e) => setForm({...form, nfNumero: e.target.value})}
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Cliente</label>
                        <input
                            type="text"
                            className="form-input"
                            value={form.cliente}
                            onChange={(e) => setForm({...form, cliente: e.target.value})}
                        />
                    </div>
                </div>

                <div className="form-group">
                    <label className="form-label">Endereço de Destino</label>
                    <input
                        type="text"
                        className="form-input"
                        value={form.destino}
                        onChange={(e) => setForm({...form, destino: e.target.value})}
                        placeholder="Rua, número - Cidade/UF"
                    />
                </div>

                <div className="form-row">
                    <div className="form-group">
                        <label className="form-label">Local de Origem</label>
                        <select
                            className="form-select"
                            value={form.localOrigem}
                            onChange={(e) => setForm({...form, localOrigem: e.target.value})}
                        >
                            {locaisOrigem.map(l => <option key={l} value={l}>{l}</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label className="form-label">Transportadora</label>
                        <select
                            className="form-select"
                            value={form.transportadora}
                            onChange={(e) => setForm({...form, transportadora: e.target.value})}
                        >
                            <option value="">Selecione...</option>
                            {transportadoras.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                </div>

                <div className="form-row">
                    <div className="form-group">
                        <label className="form-label">Código de Rastreio</label>
                        <input
                            type="text"
                            className="form-input"
                            value={form.codigoRastreio}
                            onChange={(e) => {
                                const codigo = e.target.value;
                                const link = gerarLinkRastreio(form.transportadora, codigo);
                                setForm({...form, codigoRastreio: codigo, linkRastreio: link || form.linkRastreio});
                            }}
                            placeholder="Ex: AA123456789BR"
                        />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Link de Rastreio</label>
                        <input
                            type="url"
                            className="form-input"
                            value={form.linkRastreio}
                            onChange={(e) => setForm({...form, linkRastreio: e.target.value})}
                            placeholder="https://..."
                        />
                    </div>
                </div>

                {/* Campo ID Melhor Envio */}
                {form.transportadora === 'Melhor Envio' && (
                    <div className="form-group" style={{
                        background: 'var(--info-light)',
                        padding: '16px',
                        borderRadius: 'var(--radius)',
                        marginBottom: '16px'
                    }}>
                        <label className="form-label" style={{color: 'var(--info)'}}>
                            ID da Etiqueta (Melhor Envio)
                        </label>
                        <input
                            type="text"
                            className="form-input"
                            value={form.melhorEnvioId || ''}
                            onChange={(e) => setForm({...form, melhorEnvioId: e.target.value})}
                            placeholder="Ex: 9b3e8f7a-1234-5678-90ab-cdef12345678"
                        />
                        <p style={{fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px'}}>
                            Encontre o ID no painel do Melhor Envio → Envios → Copiar ID da etiqueta.
                            Com o ID, o sistema atualiza o status automaticamente!
                        </p>
                    </div>
                )}

                {/* Opção de baixar do estoque */}
                <div style={{
                    background: 'var(--bg-primary)',
                    padding: '16px',
                    borderRadius: 'var(--radius)',
                    marginBottom: '16px'
                }}>
                    <label style={{display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer'}}>
                        <input
                            type="checkbox"
                            checked={form.baixarEstoque}
                            onChange={(e) => setForm({...form, baixarEstoque: e.target.checked})}
                            style={{width: '18px', height: '18px'}}
                        />
                        <span style={{fontWeight: '500'}}>Baixar produtos do estoque</span>
                    </label>
                    <p style={{fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px', marginLeft: '28px'}}>
                        Se marcado, os produtos vinculados serão descontados do estoque automaticamente
                    </p>
                </div>

                {/* Produtos (se importados do XML) */}
                {form.produtos.length > 0 && (
                    <div style={{marginBottom: '16px'}}>
                        <h3 style={{fontSize: '14px', fontWeight: '600', marginBottom: '12px'}}>
                            Produtos da NF ({form.produtos.length})
                            <span style={{fontWeight: '400', fontSize: '12px', marginLeft: '12px', color: 'var(--text-muted)'}}>
                                {form.produtos.filter(p => p.produtoEstoque).length} vinculados |
                                {form.produtos.filter(p => !p.produtoEstoque).length} não encontrados
                            </span>
                        </h3>
                        <div className="table-container">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th style={{width: '50px'}}>Status</th>
                                        <th>Produto NF</th>
                                        <th style={{width: '60px'}}>Qtd</th>
                                        <th>Produto Vinculado</th>
                                        <th style={{width: '140px'}}>NF Origem</th>
                                        <th style={{width: '80px'}}>Ações</th>
                                        <th style={{width: '60px'}}>Baixar</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {form.produtos.map((prod, idx) => (
                                        <tr key={idx} style={{
                                            background: prod.produtoEstoque ? 'var(--success-light)' : 'var(--warning-light)'
                                        }}>
                                            <td style={{textAlign: 'center', fontSize: '18px'}}>
                                                {prod.produtoEstoque ? (
                                                    <span title="Vinculado ao estoque" style={{color: 'var(--success)'}}><Icon name="success" size={14} /></span>
                                                ) : (
                                                    <span title="Não encontrado no estoque" style={{color: 'var(--warning)'}}><Icon name="warning" size={14} /></span>
                                                )}
                                            </td>
                                            <td>
                                                <div style={{fontWeight: '500', fontSize: '12px'}}>{prod.nome}</div>
                                                <div style={{fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px'}}>
                                                    SKU: <strong>{prod.sku}</strong> {prod.ean && `| EAN: ${prod.ean}`}
                                                </div>
                                            </td>
                                            <td style={{fontWeight: '600', textAlign: 'center'}}>{prod.quantidade}</td>
                                            <td>
                                                {prod.produtoEstoque ? (
                                                    <div style={{fontSize: '12px'}}>
                                                        <div style={{fontWeight: '500', color: 'var(--success)'}}>{prod.produtoEstoque.name}</div>
                                                        <div style={{fontSize: '10px', color: 'var(--text-muted)'}}>
                                                            SKU: {prod.produtoEstoque.sku} | Estoque: {prod.produtoEstoque.currentQuantity || 0} un.
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <span style={{fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic'}}>
                                                        Nenhum produto vinculado
                                                    </span>
                                                )}
                                            </td>
                                            {/* Coluna NF Origem */}
                                            <td>
                                                {prod.produtoEstoque && (() => {
                                                    const nfsDisponiveis = getEstoquePorNF(prod.produtoEstoque.sku, entries, exits);
                                                    return nfsDisponiveis.length > 0 ? (
                                                        <select
                                                            className="form-select"
                                                            value={prod.nfOrigem || ''}
                                                            onChange={(e) => {
                                                                const newProdutos = [...form.produtos];
                                                                newProdutos[idx].nfOrigem = e.target.value;
                                                                setForm({...form, produtos: newProdutos});
                                                            }}
                                                            style={{
                                                                fontSize: '10px',
                                                                padding: '4px 6px',
                                                                minWidth: '100px',
                                                                background: prod.nfOrigem ? 'var(--accent-bg)' : 'white'
                                                            }}
                                                        >
                                                            <option value="">Selecionar...</option>
                                                            {nfsDisponiveis.map((nf, nfIdx) => (
                                                                <option
                                                                    key={nfIdx}
                                                                    value={nf.nf}
                                                                    disabled={nf.quantidade < prod.quantidade}
                                                                >
                                                                    {nf.nf} ({nf.quantidade}un)
                                                                </option>
                                                            ))}
                                                        </select>
                                                    ) : (
                                                        <span style={{fontSize: '10px', color: 'var(--danger)'}}>Sem estoque</span>
                                                    );
                                                })()}
                                            </td>
                                            <td style={{textAlign: 'center'}}>
                                                <div style={{display: 'flex', gap: '4px', justifyContent: 'center'}}>
                                                    <button
                                                        type="button"
                                                        className="btn btn-secondary btn-sm"
                                                        style={{fontSize: '10px', padding: '4px 6px'}}
                                                        onClick={() => {
                                                            setShowVincularModal(idx);
                                                            setVincularSearch(prod.sku || prod.nome?.substring(0, 20) || '');
                                                        }}
                                                        title="Buscar e vincular produto"
                                                    >
                                                        <Icon name="search" size={12} />
                                                    </button>
                                                    {!prod.produtoEstoque && (
                                                        <button
                                                            type="button"
                                                            className="btn btn-primary btn-sm"
                                                            style={{fontSize: '10px', padding: '4px 6px'}}
                                                            onClick={() => handleOpenNewProduct(idx)}
                                                            title="Cadastrar novo produto"
                                                        >
                                                            <Icon name="add" size={12} />
                                                        </button>
                                                    )}
                                                    {prod.produtoEstoque && (
                                                        <button
                                                            type="button"
                                                            className="btn btn-secondary btn-sm"
                                                            style={{fontSize: '10px', padding: '4px 6px'}}
                                                            onClick={() => handleVincularProduto(idx, '')}
                                                            title="Desvincular"
                                                        >
                                                            <Icon name="close" size={12} />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                            <td style={{textAlign: 'center'}}>
                                                {prod.produtoEstoque && (
                                                    <input
                                                        type="checkbox"
                                                        checked={prod.baixarEstoque}
                                                        onChange={(e) => {
                                                            const newProdutos = [...form.produtos];
                                                            newProdutos[idx].baixarEstoque = e.target.checked;
                                                            setForm({...form, produtos: newProdutos});
                                                        }}
                                                        title={prod.produtoEstoque.currentQuantity >= prod.quantidade ?
                                                            'Baixar do estoque' :
                                                            'Estoque insuficiente!'}
                                                        style={{
                                                            width: '18px',
                                                            height: '18px',
                                                            accentColor: prod.produtoEstoque.currentQuantity >= prod.quantidade ? 'var(--accent)' : 'var(--danger)'
                                                        }}
                                                    />
                                                )}
                                                {prod.produtoEstoque && prod.produtoEstoque.currentQuantity < prod.quantidade && (
                                                    <div style={{fontSize: '9px', color: 'var(--danger)'}}>
                                                        Insuficiente!
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Modal Buscar e Vincular Produto */}
                {showVincularModal !== null && (
                    <div className="modal-overlay">
                        <div className="modal-content" style={{maxWidth: '600px'}}>
                            <h2 className="modal-title">Vincular Produto do Estoque</h2>
                            <p className="modal-subtitle">
                                Produto da NF: <strong>{form.produtos[showVincularModal]?.nome}</strong>
                            </p>
                            <div style={{fontSize: '11px', color: 'var(--text-muted)', marginBottom: '16px'}}>
                                SKU da NF: <code>{form.produtos[showVincularModal]?.sku}</code>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Buscar no estoque</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="Digite nome, SKU ou EAN..."
                                    value={vincularSearch}
                                    onChange={(e) => setVincularSearch(e.target.value)}
                                    autoFocus
                                />
                            </div>

                            <div style={{
                                maxHeight: '300px',
                                overflowY: 'auto',
                                border: '1px solid var(--border)',
                                borderRadius: 'var(--radius)',
                                marginBottom: '16px'
                            }}>
                                {stock
                                    .filter(s => {
                                        if (!vincularSearch) return true;
                                        const search = vincularSearch.toLowerCase();
                                        return (s.name || '').toLowerCase().includes(search) ||
                                               (s.sku || '').toLowerCase().includes(search) ||
                                               (s.ean || '').toLowerCase().includes(search);
                                    })
                                    .map(s => (
                                        <div
                                            key={s.id}
                                            onClick={() => {
                                                handleVincularProduto(showVincularModal, s.sku);
                                                setShowVincularModal(null);
                                                setVincularSearch('');
                                            }}
                                            style={{
                                                padding: '12px',
                                                borderBottom: '1px solid var(--border)',
                                                cursor: 'pointer',
                                                transition: 'background 0.2s'
                                            }}
                                            onMouseEnter={(e) => e.target.style.background = 'var(--bg-primary)'}
                                            onMouseLeave={(e) => e.target.style.background = 'white'}
                                        >
                                            <div style={{fontWeight: '500', marginBottom: '4px'}}>{s.name}</div>
                                            <div style={{fontSize: '11px', color: 'var(--text-muted)'}}>
                                                SKU: <strong>{s.sku}</strong>
                                                {s.ean && ` | EAN: ${s.ean}`}
                                                {' | '}
                                                <span style={{
                                                    color: s.currentQuantity > 0 ? 'var(--success)' : 'var(--danger)'
                                                }}>
                                                    Estoque: {s.currentQuantity || 0} un.
                                                </span>
                                            </div>
                                        </div>
                                    ))
                                }
                                {stock.filter(s => {
                                    if (!vincularSearch) return true;
                                    const search = vincularSearch.toLowerCase();
                                    return (s.name || '').toLowerCase().includes(search) ||
                                           (s.sku || '').toLowerCase().includes(search);
                                }).length === 0 && (
                                    <div style={{padding: '20px', textAlign: 'center', color: 'var(--text-muted)'}}>
                                        Nenhum produto encontrado
                                    </div>
                                )}
                            </div>

                            <div className="btn-group">
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => {
                                        setShowVincularModal(null);
                                        setVincularSearch('');
                                    }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={() => {
                                        handleOpenNewProduct(showVincularModal);
                                        setShowVincularModal(null);
                                        setVincularSearch('');
                                    }}
                                >
                                    Cadastrar Novo Produto
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Modal Cadastrar Novo Produto */}
                {showNewProductModal !== null && (
                    <div className="modal-overlay">
                        <div className="modal-content">
                            <h2 className="modal-title">Cadastrar Novo Produto</h2>
                            <p className="modal-subtitle">
                                Produto da NF: {form.produtos[showNewProductModal]?.nome?.substring(0, 50)}
                            </p>

                            <div className="form-group">
                                <label className="form-label">Nome do Produto *</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={newProductData.name}
                                    onChange={(e) => setNewProductData({...newProductData, name: e.target.value})}
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

                            <div className="form-row">
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
                                    <label className="form-label">Estoque Mínimo</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        value={newProductData.minStock}
                                        onChange={(e) => setNewProductData({...newProductData, minStock: parseInt(e.target.value) || 1})}
                                        min="0"
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Observações</label>
                                <textarea
                                    className="form-textarea"
                                    value={newProductData.observations}
                                    onChange={(e) => setNewProductData({...newProductData, observations: e.target.value})}
                                />
                            </div>

                            <div style={{
                                background: 'var(--warning-light)',
                                padding: '12px',
                                borderRadius: 'var(--radius)',
                                marginBottom: '16px',
                                fontSize: '12px'
                            }}>
                                O produto será cadastrado com <strong>estoque zerado</strong>.
                                Para dar entrada, use a aba "Entrada" após o cadastro.
                            </div>

                            <div className="btn-group">
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={handleCreateAndLinkProduct}
                                >
                                    Cadastrar e Vincular
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => setShowNewProductModal(null)}
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <div className="form-group">
                    <label className="form-label">Observações</label>
                    <textarea
                        className="form-textarea"
                        value={form.observacoes}
                        onChange={(e) => setForm({...form, observacoes: e.target.value})}
                        placeholder="Informações adicionais..."
                    />
                </div>

                <div className="btn-group">
                    <button type="submit" className="btn btn-primary">Registrar Despacho</button>
                    <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancelar</button>
                </div>
            </form>
        </div>
    );
}
