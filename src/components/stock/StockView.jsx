/**
 * StockView.jsx — Stock view with accordion categories and list rows
 *
 * Products grouped by category in collapsible sections.
 * Each section contains a sortable table of product rows.
 */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Icon, CategoryIcon } from '@/utils/icons';
import { formatBRL } from '@/utils/formatters';
import CategorySelectInline from '@/components/ui/CategorySelectInline';

export default function StockView({ stock, categories, onUpdate, onDelete, searchTerm, setSearchTerm, entries, exits, locaisOrigem, onAddCategory, onUpdateCategory, onDeleteCategory, products, isEquipe, equipeProducts, equipeLoading, equipeHasMore, onEquipeLoadMore, onEquipeSearch, equipeTotalCount }) {
    // Loading state
    const showInitialLoading = isEquipe
        ? ((equipeProducts || []).length === 0 && equipeLoading)
        : (stock.length === 0);

    if (showInitialLoading) {
        return (
            <div style={{ padding: '60px 20px', textAlign: 'center' }}>
                <div style={{
                    width: '28px', height: '28px',
                    border: '2.5px solid var(--border-default)',
                    borderTopColor: 'var(--accent-primary)',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                    margin: '0 auto 12px'
                }} />
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: 0 }}>Carregando estoque...</p>
            </div>
        );
    }

    const [filter, setFilter] = useState('all');
    const [detailProduct, setDetailProduct] = useState(null);
    const [editingProduct, setEditingProduct] = useState(null);
    const [editForm, setEditForm] = useState({});
    const [successMsg, setSuccessMsg] = useState('');
    const [hideZeroStock, setHideZeroStock] = useState(true);

    // Accordion state — all collapsed by default
    const [expandedCategories, setExpandedCategories] = useState(new Set());
    const [categoryVisibleCount, setCategoryVisibleCount] = useState({});

    const toggleCategory = (catId) => {
        setExpandedCategories(prev => {
            const next = new Set(prev);
            if (next.has(catId)) next.delete(catId); else next.add(catId);
            return next;
        });
    };

    const getVisibleCount = (catId) => categoryVisibleCount[catId] || 50;
    const showMoreInCategory = (catId) => {
        setCategoryVisibleCount(prev => ({ ...prev, [catId]: (prev[catId] || 50) + 50 }));
    };

    // Search with debounce
    const [searchInput, setSearchInput] = useState(searchTerm || '');
    const [debouncedSearch, setDebouncedSearch] = useState(searchTerm || '');
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchInput);
            setSearchTerm(searchInput);
            if (isEquipe && onEquipeSearch) onEquipeSearch(searchInput);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchInput]); // eslint-disable-line react-hooks/exhaustive-deps

    // Sort state
    const [sortBy, setSortBy] = useState('name');
    const [sortOrder, setSortOrder] = useState('asc');

    const handleSortClick = (field) => {
        if (sortBy === field) {
            setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(field);
            setSortOrder('asc');
        }
    };

    const SortHeader = ({ field, children, className }) => (
        <th
            onClick={() => handleSortClick(field)}
            style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
            className={className || ''}
        >
            {children} {sortBy === field ? (sortOrder === 'asc' ? '\u2191' : '\u2193') : ''}
        </th>
    );

    const getCategoryName = (catId) => {
        const cat = categories.find(c => c.id === catId);
        return cat ? cat.name : 'Sem categoria';
    };

    const getCategoryColor = (catId) => {
        const cat = categories.find(c => c.id === catId);
        return cat?.color || '#6b7280';
    };

    // Sort function
    const sortProducts = (prods, by, order) => {
        return [...prods].sort((a, b) => {
            let cmp = 0;
            switch (by) {
                case 'name': cmp = (a.name || '').localeCompare(b.name || ''); break;
                case 'sku': cmp = (a.sku || '').localeCompare(b.sku || ''); break;
                case 'category': cmp = getCategoryName(a.category).localeCompare(getCategoryName(b.category)); break;
                case 'price': cmp = (a.unitPrice || 0) - (b.unitPrice || 0); break;
                case 'quantity': cmp = (a.currentQuantity || 0) - (b.currentQuantity || 0); break;
                default: cmp = 0;
            }
            return order === 'desc' ? -cmp : cmp;
        });
    };

    const hasSearch = debouncedSearch.trim() !== '';

    // Filtered + sorted flat list
    const filteredProducts = useMemo(() => {
        let filtered = isEquipe ? (equipeProducts || []) : stock;

        // Search filter — admin only (equipe uses server-side search)
        if (!isEquipe && hasSearch) {
            const term = debouncedSearch.toLowerCase();
            filtered = filtered.filter(p =>
                (p.name || '').toLowerCase().includes(term) ||
                (p.sku || '').toLowerCase().includes(term) ||
                (p.ean || '').toLowerCase().includes(term) ||
                (p.nfOrigem || '').toLowerCase().includes(term)
            );
        }

        // Status filter
        if (filter !== 'all') {
            filtered = filtered.filter(p => p.status === filter);
        }

        // Hide zero stock
        if (hideZeroStock && filter !== 'empty') {
            filtered = filtered.filter(p => p.currentQuantity > 0);
        }

        return sortProducts(filtered, sortBy, sortOrder);
    }, [stock, equipeProducts, isEquipe, categories, debouncedSearch, hideZeroStock, sortBy, sortOrder, filter]);

    // Group filtered products by category
    const groupedProducts = useMemo(() => {
        const groups = new Map();
        for (const p of filteredProducts) {
            const catId = p.category || '__none__';
            if (!groups.has(catId)) groups.set(catId, []);
            groups.get(catId).push(p);
        }
        // Sort categories alphabetically, "Sem categoria" last
        const sorted = [...groups.entries()].sort((a, b) => {
            if (a[0] === '__none__') return 1;
            if (b[0] === '__none__') return -1;
            return getCategoryName(a[0]).localeCompare(getCategoryName(b[0]));
        });
        return sorted.map(([catId, prods]) => ({
            categoryId: catId,
            categoryName: getCategoryName(catId === '__none__' ? null : catId),
            categoryColor: getCategoryColor(catId === '__none__' ? null : catId),
            categoryIcon: categories.find(c => c.id === catId)?.icon || null,
            products: prods,
        }));
    }, [filteredProducts, categories]);

    // Status counts
    const statusCounts = useMemo(() => {
        let base = isEquipe ? (equipeProducts || []) : stock;
        if (!isEquipe && hasSearch) {
            const term = debouncedSearch.toLowerCase();
            base = base.filter(p =>
                (p.name || '').toLowerCase().includes(term) ||
                (p.sku || '').toLowerCase().includes(term) ||
                (p.ean || '').toLowerCase().includes(term) ||
                (p.nfOrigem || '').toLowerCase().includes(term)
            );
        }
        const all = hideZeroStock ? base.filter(p => p.currentQuantity > 0) : base;
        return {
            all: all.length,
            ok: base.filter(p => p.status === 'ok').length,
            empty: base.filter(p => p.status === 'empty').length,
        };
    }, [stock, equipeProducts, isEquipe, debouncedSearch, hideZeroStock]);

    // Product NFs for detail/edit modal
    const getProductNFs = (sku) => {
        const productEntries = (entries || []).filter(e => e.sku === sku && e.nf && e.nf.trim() !== '');
        const nfMap = {};
        productEntries.forEach(e => {
            if (!nfMap[e.nf]) {
                nfMap[e.nf] = { nf: e.nf, date: e.date, quantity: e.quantity };
            } else {
                nfMap[e.nf].quantity += e.quantity;
                if (new Date(e.date) > new Date(nfMap[e.nf].date)) nfMap[e.nf].date = e.date;
            }
        });
        return Object.values(nfMap).sort((a, b) => new Date(b.date) - new Date(a.date));
    };

    // Product history
    const getProductHistory = (sku) => {
        const productEntries = (entries || []).filter(e => e.sku === sku).map(e => ({...e, movimento: 'ENTRADA'}));
        const productExits = (exits || []).filter(e => e.sku === sku).map(e => ({...e, movimento: 'SAIDA'}));
        return [...productEntries, ...productExits].sort((a, b) => new Date(b.date) - new Date(a.date));
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        return date.toLocaleDateString('pt-BR') + ' ' + date.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'});
    };

    const openEditModal = (product) => {
        setEditForm({
            name: product.name || '',
            sku: product.sku || '',
            ean: product.ean || '',
            category: product.category || '',
            minStock: product.minStock || 3,
            observations: product.observations || '',
            local: product.local || '',
        });
        setEditingProduct(product);
    };

    const handleSaveEdit = async () => {
        if (!editForm.name || !editForm.sku) return;
        await onUpdate(editingProduct.id, { ...editForm });
        setEditingProduct(null);
        setSuccessMsg('Produto atualizado!');
        setTimeout(() => setSuccessMsg(''), 3000);
    };

    const handleDelete = (product) => {
        if (window.confirm(`Excluir "${product.name}"?`)) {
            onDelete(product.id);
        }
    };

    // Equipe infinite scroll
    const sentinelRef = useRef(null);
    useEffect(() => {
        if (!isEquipe || !equipeHasMore) return;
        const obs = new IntersectionObserver(([e]) => {
            if (e.isIntersecting && !equipeLoading) onEquipeLoadMore();
        }, { threshold: 0.1 });
        if (sentinelRef.current) obs.observe(sentinelRef.current);
        return () => obs.disconnect();
    }, [isEquipe, equipeHasMore, equipeLoading, onEquipeLoadMore]);

    // NF balance calculation for detail modal
    const getNfBalance = (sku) => {
        const history = getProductHistory(sku);
        const entradas = history.filter(h => h.movimento === 'ENTRADA');
        const saidas = history.filter(h => h.movimento === 'SAIDA');
        const saldoPorNF = {};
        entradas.forEach(e => {
            const nfKey = e.nf || 'SEM_NF';
            if (!saldoPorNF[nfKey]) saldoPorNF[nfKey] = { entradas: 0, saidas: 0, local: e.localEntrada || '-' };
            saldoPorNF[nfKey].entradas += e.quantity;
        });
        saidas.forEach(s => {
            const nfKey = s.nfOrigem || 'SEM_NF';
            if (!saldoPorNF[nfKey]) saldoPorNF[nfKey] = { entradas: 0, saidas: 0, local: '-' };
            saldoPorNF[nfKey].saidas += s.quantity;
        });
        return Object.entries(saldoPorNF).filter(([, dados]) => dados.entradas - dados.saidas > 0);
    };

    // Render a product row
    const renderProductRow = (p) => (
        <tr
            key={p.id}
            onClick={() => setDetailProduct(p)}
            style={{cursor: 'pointer'}}
            className="stock-row"
        >
            <td style={{width: '48px', padding: '6px 8px'}}>
                {p.imagemUrl && p.imagemUrl !== 'sem-imagem' ? (
                    <img
                        src={p.imagemUrl}
                        alt=""
                        loading="lazy"
                        width={48}
                        height={48}
                        style={{width: '48px', height: '48px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border-default)', background: '#fff'}}
                        onError={(e) => { e.target.style.display = 'none'; e.target.nextElementSibling && (e.target.nextElementSibling.style.display = 'flex'); }}
                    />
                ) : null}
                <div style={{width: '48px', height: '48px', borderRadius: '8px', background: '#f3f4f6', display: (p.imagemUrl && p.imagemUrl !== 'sem-imagem') ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center'}}>
                    <Icon name="boxOpen" size={18} style={{opacity: 0.3}} />
                </div>
            </td>
            <td>
                <div className="product-name">{p.name}</div>
                {p.local && <div className="product-local">{'\uD83D\uDCCD'} {p.local}</div>}
            </td>
            <td className="hide-mobile product-sku">{p.sku}</td>
            <td>
                <span style={{
                    fontWeight: 600, fontSize: '14px',
                    color: p.currentQuantity > 0 ? '#059669' : '#d1d5db',
                }}>
                    {p.currentQuantity}
                </span>
            </td>
            <td className="hide-mobile" style={{fontSize: '12px', color: 'var(--text-secondary)'}}>
                {p.unitPrice > 0 ? `R$ ${formatBRL(p.unitPrice)}` : '\u2014'}
            </td>
            <td style={{width: '32px', padding: '6px'}}>
                {p.observations && p.observations.trim() && (
                    <span
                        title={p.observations}
                        style={{color: '#d97706', cursor: 'help'}}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {'\u26A0\uFE0F'}
                    </span>
                )}
            </td>
        </tr>
    );

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">Estoque</h1>
                <p className="page-subtitle">Visualize e gerencie seus produtos</p>
            </div>

            {successMsg && <div className="alert alert-success">{successMsg}</div>}

            {/* Detail Modal — read-only info + history */}
            {detailProduct && !editingProduct && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{maxWidth: '800px'}}>
                        <h2 className="modal-title">Detalhes do Produto</h2>

                        {/* Product info */}
                        <div style={{display: 'flex', gap: '16px', marginBottom: '16px', flexWrap: 'wrap'}}>
                            {detailProduct.imagemUrl && detailProduct.imagemUrl !== 'sem-imagem' && (
                                <img src={detailProduct.imagemUrl} alt={detailProduct.name} loading="lazy" style={{width: '80px', height: '80px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border-default)', background: '#fff'}} />
                            )}
                            <div style={{flex: 1, minWidth: '200px'}}>
                                <div style={{fontWeight: 600, fontSize: '16px', marginBottom: '4px'}}>{detailProduct.name}</div>
                                <div style={{display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '13px', color: 'var(--text-secondary)'}}>
                                    <span>SKU: <strong>{detailProduct.sku}</strong></span>
                                    {detailProduct.ean && <span>EAN: {detailProduct.ean}</span>}
                                    {detailProduct.local && <span>{'\uD83D\uDCCD'} {detailProduct.local}</span>}
                                    {detailProduct.unitPrice > 0 && <span>R$ {formatBRL(detailProduct.unitPrice)}</span>}
                                </div>
                                <div style={{marginTop: '8px'}}>
                                    <span style={{
                                        background: getCategoryColor(detailProduct.category) + '15',
                                        color: getCategoryColor(detailProduct.category),
                                        border: '1px solid ' + getCategoryColor(detailProduct.category) + '30',
                                        padding: '2px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 500,
                                    }}>
                                        {getCategoryName(detailProduct.category)}
                                    </span>
                                    <span style={{
                                        marginLeft: '8px',
                                        padding: '2px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 600,
                                        background: detailProduct.currentQuantity > 0 ? 'var(--accent-success-subtle)' : 'var(--accent-error-subtle)',
                                        color: detailProduct.currentQuantity > 0 ? 'var(--accent-success)' : 'var(--accent-error)',
                                    }}>
                                        {detailProduct.currentQuantity} un.
                                    </span>
                                </div>
                                {detailProduct.observations && (
                                    <div style={{marginTop: '8px', fontSize: '13px', color: 'var(--text-secondary)', fontStyle: 'italic'}}>
                                        {detailProduct.observations}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* History table */}
                        {!isEquipe && (() => {
                            const history = getProductHistory(detailProduct.sku);
                            if (history.length === 0) {
                                return <div style={{textAlign: 'center', padding: '16px', color: 'var(--text-muted)', fontSize: '13px'}}>Nenhuma movimentacao registrada</div>;
                            }
                            return (
                                <div className="table-container" style={{maxHeight: '280px', overflowY: 'auto', marginBottom: '12px'}}>
                                    <table className="table">
                                        <thead>
                                            <tr>
                                                <th>Data</th>
                                                <th>Tipo</th>
                                                <th>Qtd</th>
                                                <th>Local</th>
                                                <th>NF Entrada</th>
                                                <th>NF Saida</th>
                                                <th>Fornecedor/Cliente</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {history.map((mov, idx) => (
                                                <tr key={idx}>
                                                    <td style={{fontSize: '11px', whiteSpace: 'nowrap'}}>{formatDate(mov.date)}</td>
                                                    <td>
                                                        <span style={{
                                                            background: mov.movimento === 'ENTRADA' ? 'var(--success-light)' : 'var(--danger-light)',
                                                            color: mov.movimento === 'ENTRADA' ? 'var(--success)' : 'var(--danger)',
                                                            padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: '600'
                                                        }}>
                                                            {mov.movimento}
                                                        </span>
                                                    </td>
                                                    <td style={{fontWeight: '600'}}>{mov.quantity}</td>
                                                    <td style={{fontSize: '11px'}}>
                                                        {mov.localEntrada && (
                                                            <span style={{background: 'var(--accent-bg)', color: 'var(--accent)', padding: '2px 6px', borderRadius: '8px', fontSize: '10px'}}>
                                                                {mov.localEntrada}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td style={{fontFamily: 'monospace', fontSize: '11px'}}>{mov.movimento === 'ENTRADA' ? (mov.nf || '-') : (mov.nfOrigem || '-')}</td>
                                                    <td style={{fontFamily: 'monospace', fontSize: '11px'}}>{mov.movimento === 'SAIDA' ? (mov.nf || '-') : '-'}</td>
                                                    <td style={{fontSize: '12px'}}>{mov.supplier || mov.client || '-'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            );
                        })()}

                        {/* NF balance */}
                        {!isEquipe && (() => {
                            const nfsComSaldo = getNfBalance(detailProduct.sku);
                            if (nfsComSaldo.length === 0) return null;
                            return (
                                <div style={{padding: '12px', background: 'var(--info-light)', borderRadius: 'var(--radius)', marginBottom: '12px'}}>
                                    <div style={{fontWeight: '600', marginBottom: '8px', fontSize: '13px'}}>Estoque por NF de Entrada:</div>
                                    <div style={{display: 'flex', flexWrap: 'wrap', gap: '8px'}}>
                                        {nfsComSaldo.map(([nf, dados]) => (
                                            <div key={nf} style={{background: 'white', padding: '6px 12px', borderRadius: 'var(--radius)', fontSize: '12px'}}>
                                                <strong>NF {nf === 'SEM_NF' ? '(sem NF)' : nf}:</strong> {dados.entradas - dados.saidas} un.
                                                {dados.local && dados.local !== '-' && (
                                                    <span style={{marginLeft: '6px', color: 'var(--accent)', fontSize: '11px'}}>{dados.local}</span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })()}

                        <div className="btn-group" style={{gap: '8px'}}>
                            {!isEquipe && (
                                <>
                                    <button className="btn btn-primary" onClick={() => { openEditModal(detailProduct); }}>Editar</button>
                                    <button className="btn btn-secondary" onClick={() => { handleDelete(detailProduct); setDetailProduct(null); }} style={{color: 'var(--accent-error)', borderColor: 'var(--accent-error)'}}>Excluir</button>
                                </>
                            )}
                            <button className="btn btn-secondary" onClick={() => setDetailProduct(null)}>Fechar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {editingProduct && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h2 className="modal-title">Editar Produto</h2>
                        <p className="modal-subtitle">Atualize as informacoes do produto</p>

                        <div className="form-group">
                            <label className="form-label">Nome do Produto</label>
                            <input type="text" className="form-input" value={editForm.name} onChange={(e) => setEditForm({...editForm, name: e.target.value})} />
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">SKU</label>
                                <input type="text" className="form-input" value={editForm.sku} onChange={(e) => setEditForm({...editForm, sku: e.target.value})} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">EAN</label>
                                <input type="text" className="form-input" value={editForm.ean} onChange={(e) => setEditForm({...editForm, ean: e.target.value})} />
                            </div>
                        </div>

                        <CategorySelectInline
                            categories={categories}
                            value={editForm.category}
                            onChange={(val) => setEditForm({...editForm, category: val})}
                            onAddCategory={onAddCategory}
                            onUpdateCategory={onUpdateCategory}
                            onDeleteCategory={onDeleteCategory}
                            products={products || stock}
                        />

                        <div className="form-group">
                            <label className="form-label">Estoque Minimo</label>
                            <input type="number" className="form-input" value={editForm.minStock} onChange={(e) => setEditForm({...editForm, minStock: e.target.value})} />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Local</label>
                            <select className="form-select" value={editForm.local || ''} onChange={(e) => setEditForm({...editForm, local: e.target.value})}>
                                <option value="">Selecione o local</option>
                                {(locaisOrigem || []).map(l => (<option key={l} value={l}>{l}</option>))}
                            </select>
                        </div>

                        {editingProduct.unitPrice > 0 && (
                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">Preço Unitário</label>
                                    <div style={{padding: '8px 0', fontSize: '14px', color: 'var(--text-primary)'}}>R$ {formatBRL(editingProduct.unitPrice)}</div>
                                    <span style={{color: 'var(--text-tertiary)', fontSize: '11px'}}>Sincronizado via Tiny ERP</span>
                                </div>
                                <div className="form-group"></div>
                            </div>
                        )}

                        <div className="form-group">
                            <label className="form-label">Notas Fiscais de Entrada</label>
                            {(() => {
                                const nfs = getProductNFs(editingProduct.sku);
                                if (nfs.length === 0) {
                                    return <div style={{ padding: '8px 12px', fontSize: '13px', color: 'var(--text-muted)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>Nenhuma NF registrada para este produto</div>;
                                }
                                return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        {nfs.map((nfInfo, idx) => (
                                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', fontSize: '13px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                                                <span style={{ fontWeight: 500 }}>NF {nfInfo.nf}</span>
                                                <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{nfInfo.quantity} un. — {new Date(nfInfo.date).toLocaleDateString('pt-BR')}</span>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })()}
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>NFs registradas via Entradas de estoque</span>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Observacoes</label>
                            <textarea className="form-textarea" value={editForm.observations} onChange={(e) => setEditForm({...editForm, observations: e.target.value})} placeholder="Informacoes adicionais sobre o produto..." />
                        </div>

                        <div style={{background: 'var(--bg-primary)', padding: '12px', borderRadius: 'var(--radius)', marginBottom: '16px', fontSize: '13px'}}>
                            <strong>Estoque atual:</strong> {editingProduct.currentQuantity} unidades
                            <div style={{fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px'}}>Para alterar quantidade, use Entrada ou Saida</div>
                        </div>

                        <div className="btn-group">
                            <button className="btn btn-primary" onClick={handleSaveEdit}>Salvar</button>
                            <button className="btn btn-secondary" onClick={() => setEditingProduct(null)}>Cancelar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Search bar */}
            <div className="card" style={{marginBottom: '12px'}}>
                <div className="search-box">
                    <span className="search-icon"><Icon name="search" size={14} /></span>
                    <input
                        type="text"
                        className="search-input"
                        placeholder="Buscar por nome, SKU, EAN ou NF..."
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                    />
                    {searchInput && (
                        <button className="search-clear" onClick={() => { setSearchInput(''); setDebouncedSearch(''); setSearchTerm(''); if (isEquipe && onEquipeSearch) onEquipeSearch(''); }} title="Limpar busca">&times;</button>
                    )}
                </div>

                {/* Status tabs */}
                <div className="filter-tabs">
                    <button className={`filter-tab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
                        Todos ({statusCounts.all})
                    </button>
                    <button className={`filter-tab ${filter === 'ok' ? 'active' : ''}`} onClick={() => setFilter('ok')}>
                        OK ({statusCounts.ok})
                    </button>
                    <button className={`filter-tab ${filter === 'empty' ? 'active' : ''}`} onClick={() => setFilter('empty')}>
                        Zerado ({statusCounts.empty})
                    </button>
                </div>
            </div>

            {/* Equipe: server-side count */}
            {isEquipe && equipeTotalCount > 0 && (
                <div style={{ textAlign: 'center', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                    Mostrando {(equipeProducts || []).length} de {equipeTotalCount} produtos
                </div>
            )}

            {/* Hide zero stock toggle */}
            <div style={{ display: 'flex', alignItems: 'center', padding: '8px 0', marginBottom: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={hideZeroStock} onChange={e => setHideZeroStock(e.target.checked)} />
                    Ocultar produtos zerados
                </label>
            </div>

            {/* Accordion categories with product list rows */}
            {groupedProducts.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-state-icon"><Icon name="boxOpen" size={48} /></div>
                    <h3>Nenhum produto encontrado</h3>
                    <p>Tente ajustar os filtros ou a busca</p>
                </div>
            ) : (
                <div className="stock-accordion">
                    {groupedProducts.map(group => (
                        <div key={group.categoryId} className="stock-category-section">
                            {/* Category header */}
                            <div className="stock-category-header" onClick={() => toggleCategory(group.categoryId)}>
                                <span className="stock-category-arrow">
                                    {(hasSearch || expandedCategories.has(group.categoryId)) ? '\u25BC' : '\u25B6'}
                                </span>
                                <CategoryIcon icon={group.categoryIcon} size={18} color={group.categoryColor} />
                                <span style={{fontWeight: 600, color: group.categoryColor}}>
                                    {group.categoryName}
                                </span>
                                <span className="stock-category-count">
                                    {group.products.length} produto{group.products.length !== 1 ? 's' : ''}
                                </span>
                            </div>

                            {/* Product rows — only rendered when expanded */}
                            {(hasSearch || expandedCategories.has(group.categoryId)) && (
                                <div className="stock-category-body">
                                    <table className="table">
                                        <thead>
                                            <tr>
                                                <th style={{width: '48px'}}></th>
                                                <SortHeader field="name">Produto</SortHeader>
                                                <SortHeader field="sku" className="hide-mobile">SKU</SortHeader>
                                                <SortHeader field="quantity">Estoque</SortHeader>
                                                <SortHeader field="price" className="hide-mobile">Preço</SortHeader>
                                                <th style={{width: '32px'}}></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {group.products.slice(0, getVisibleCount(group.categoryId)).map(renderProductRow)}
                                        </tbody>
                                    </table>
                                    {/* Show more within category */}
                                    {group.products.length > getVisibleCount(group.categoryId) && (
                                        <div style={{textAlign: 'center', padding: '12px', borderTop: '1px solid var(--border-default)'}}>
                                            <button className="btn btn-secondary btn-sm" onClick={() => showMoreInCategory(group.categoryId)}>
                                                Mostrar mais ({group.products.length - getVisibleCount(group.categoryId)} restantes)
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Equipe: infinite scroll sentinel */}
            {isEquipe && equipeHasMore && (
                <div ref={sentinelRef} style={{height: '1px'}} />
            )}

            {/* Equipe: loading indicator */}
            {isEquipe && equipeLoading && (equipeProducts || []).length > 0 && (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                    <div style={{
                        width: '24px', height: '24px',
                        border: '2px solid var(--border-default)',
                        borderTopColor: 'var(--accent-primary)',
                        borderRadius: '50%',
                        animation: 'spin 0.8s linear infinite',
                        margin: '0 auto'
                    }} />
                </div>
            )}

            <style>{`
                .hide-mobile {}
                @media (max-width: 768px) {
                    .hide-mobile { display: none !important; }
                }
                .stock-row:hover { background: #fafafa; }
                .stock-row td { border-bottom: 1px solid #f0f0f0; }
                .stock-category-section { margin-bottom: 2px; }
                .stock-category-header {
                    display: flex; align-items: center; gap: 10px;
                    padding: 12px 16px;
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-default);
                    border-radius: var(--radius);
                    cursor: pointer; user-select: none;
                    font-size: 14px;
                    transition: background 0.15s;
                }
                .stock-category-header:hover { background: var(--bg-hover, #f0f0f0); }
                .stock-category-arrow {
                    font-size: 10px; width: 16px; text-align: center;
                    color: var(--text-tertiary);
                }
                .stock-category-count {
                    margin-left: auto; font-size: 12px; font-weight: 500;
                    color: var(--text-secondary); background: var(--bg-tertiary);
                    padding: 2px 8px; border-radius: 10px;
                }
                .stock-category-body {
                    border: 1px solid var(--border-default); border-top: none;
                    border-radius: 0 0 var(--radius) var(--radius);
                    overflow: hidden;
                }
                .stock-category-body .table { margin-bottom: 0; }
                .product-name { font-weight: 600; font-size: 14px; color: #1a1a2e; line-height: 1.3; }
                .product-local { font-size: 12px; color: #9ca3af; margin-top: 2px; }
                .product-sku { font-family: monospace; font-size: 12px; color: #9ca3af; }
            `}</style>
        </div>
    );
}
