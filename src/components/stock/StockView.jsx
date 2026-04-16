/**
 * StockView.jsx — Stock view with horizontal category chips and in-page detail panel
 *
 * Fase 2.2: chips horizontais de categorias (UMA ativa), sub-filtros por status,
 * painel in-page expandindo abaixo da linha do produto clicado.
 */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Icon, CategoryIcon } from '@/utils/icons';
import { formatBRL } from '@/utils/formatters';
import CategorySelectInline from '@/components/ui/CategorySelectInline';
import CategoryManager from '@/components/categories/CategoryManager';
import { callTinyFunction } from '@/services/tinyService';
import { supabaseClient } from '@/config/supabase';

export default function StockView({ stock, categories, onUpdate, onDelete, searchTerm, setSearchTerm, entries, exits, locaisOrigem, onAddCategory, onUpdateCategory, onDeleteCategory, products, isEquipe, isStockAdmin, equipeProducts, equipeLoading, equipeHasMore, onEquipeLoadMore, onEquipeSearch, equipeTotalCount }) {
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
    const [selectedCategoryId, setSelectedCategoryId] = useState(null); // null = all categories
    const [showCategoryManager, setShowCategoryManager] = useState(false);
    const [detailProduct, setDetailProduct] = useState(null); // product with inline panel expanded
    const [editingProduct, setEditingProduct] = useState(null);
    const [editForm, setEditForm] = useState({});
    const [successMsg, setSuccessMsg] = useState('');
    const [hideZeroStock, setHideZeroStock] = useState(true);
    const [tinySyncLoading, setTinySyncLoading] = useState(null); // product id being synced

    const handleTinySync = async (product) => {
        if (!product.sku || tinySyncLoading) return;
        setTinySyncLoading(product.id);
        try {
            const payload = product.tinyId
                ? { tiny_id: product.tinyId, sku: product.sku }
                : { sku: product.sku };
            const data = await callTinyFunction('tiny-sync-product-single', payload);
            if (!data.success) {
                alert(data.error || 'Erro ao atualizar do Tiny');
                return;
            }
            const prod = data.product;
            const updateData = {};
            if (prod.name) updateData.name = prod.name;
            if (prod.ean !== undefined) updateData.ean = prod.ean;
            if (prod.category) updateData.category = prod.category;
            if (prod.unit_price !== undefined) updateData.unitPrice = prod.unit_price;
            if (prod.observations !== undefined) updateData.observations = prod.observations;
            if (prod.imagem_url) updateData.imagemUrl = prod.imagem_url;

            // Update via Supabase directly for fields not covered by onUpdate
            const dbUpdate = {};
            if (prod.name) dbUpdate.name = prod.name;
            if (prod.ean !== undefined) dbUpdate.ean = prod.ean;
            if (prod.category) dbUpdate.category = prod.category;
            if (prod.unit_price !== undefined) dbUpdate.unit_price = prod.unit_price;
            if (prod.observations !== undefined) dbUpdate.observations = prod.observations;
            if (prod.imagem_url) dbUpdate.imagem_url = prod.imagem_url;
            if (prod.tiny_id) dbUpdate.tiny_id = prod.tiny_id;

            await supabaseClient.from('products').update(dbUpdate).eq('id', product.id);

            // Update local state via onUpdate callback pattern
            if (onUpdate) {
                await onUpdate(product.id, updateData);
            }

            // Update detail modal if open
            if (detailProduct?.id === product.id) {
                setDetailProduct(prev => ({ ...prev, ...updateData }));
            }

            setSuccessMsg('Produto atualizado do Tiny');
            setTimeout(() => setSuccessMsg(''), 3000);
        } catch (err) {
            alert(normalizeTinyError(err.message));
        } finally {
            setTinySyncLoading(null);
        }
    };

    // Pagination — flat list limit (no more accordion)
    const [visibleLimit, setVisibleLimit] = useState(100);
    useEffect(() => { setVisibleLimit(100); }, [selectedCategoryId, filter, hideZeroStock]);

    // Toggle product expansion (click same = close, click other = switch)
    const toggleProductPanel = (product) => {
        setDetailProduct(prev => (prev?.id === product.id ? null : product));
    };

    // Toggle category chip (click active = clear filter)
    const toggleCategoryChip = (catId) => {
        setSelectedCategoryId(prev => (prev === catId ? null : catId));
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
                (p.nfOrigem || '').toLowerCase().includes(term) ||
                (p.defeitoDescricao || '').toLowerCase().includes(term)
            );
        }

        // Category chip filter
        if (selectedCategoryId) {
            filtered = filtered.filter(p => (p.category || '__none__') === selectedCategoryId);
        }

        // Status filter
        if (filter === 'ok') {
            filtered = filtered.filter(p => p.status === 'ok');
        } else if (filter === 'empty') {
            filtered = filtered.filter(p => p.status === 'empty');
        } else if (filter === 'defeito') {
            filtered = filtered.filter(p => p.defeito);
        }

        // Hide zero stock (not applicable when showing empty/defeito filter)
        if (hideZeroStock && filter !== 'empty' && filter !== 'defeito') {
            filtered = filtered.filter(p => p.currentQuantity > 0);
        }

        return sortProducts(filtered, sortBy, sortOrder);
    }, [stock, equipeProducts, isEquipe, categories, debouncedSearch, hideZeroStock, sortBy, sortOrder, filter, selectedCategoryId]);

    // Category chips — count per category (respects search but not status/category filter)
    const categoryChips = useMemo(() => {
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
        const counts = {};
        base.forEach(p => {
            const key = p.category || '__none__';
            counts[key] = (counts[key] || 0) + 1;
        });
        const chips = (categories || []).map(c => ({
            id: c.id,
            name: c.name,
            color: c.color || '#6B7280',
            icon: c.icon,
            count: counts[c.id] || 0,
        }));
        if (counts['__none__']) {
            chips.push({ id: '__none__', name: 'Sem categoria', color: '#9CA3AF', icon: null, count: counts['__none__'] });
        }
        return chips.sort((a, b) => a.name.localeCompare(b.name));
    }, [stock, equipeProducts, isEquipe, debouncedSearch, categories]);

    // Status counts (respects search + category chip)
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
        if (selectedCategoryId) {
            base = base.filter(p => (p.category || '__none__') === selectedCategoryId);
        }
        const all = hideZeroStock ? base.filter(p => p.currentQuantity > 0) : base;
        return {
            all: all.length,
            ok: base.filter(p => p.status === 'ok').length,
            empty: base.filter(p => p.status === 'empty').length,
            defeito: base.filter(p => p.defeito).length,
        };
    }, [stock, equipeProducts, isEquipe, debouncedSearch, hideZeroStock, selectedCategoryId]);

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
            defeito: product.defeito || false,
            defeitoDescricao: product.defeitoDescricao || '',
        });
        setEditingProduct(product);
    };

    const handleSaveEdit = async () => {
        if (!editForm.name || !editForm.sku) return;
        const saveData = { ...editForm };
        // Set defeito_data on first mark, preserve on unmark
        if (saveData.defeito && !editingProduct.defeitoData) {
            saveData.defeitoData = new Date().toISOString();
        }
        await onUpdate(editingProduct.id, saveData);
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

    // Observation tooltip state
    const [obsTooltip, setObsTooltip] = React.useState(null);

    const showObsTooltip = (e, text) => {
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const openUp = spaceBelow < 120;
        setObsTooltip({
            text,
            left: rect.left + rect.width / 2,
            top: openUp ? rect.top - 8 : rect.bottom + 8,
            openUp,
        });
    };

    const hideObsTooltip = () => setObsTooltip(null);

    // Render a product row + optional expanded detail panel below
    const renderProductRow = (p) => {
        const isExpanded = detailProduct?.id === p.id;
        return (
            <React.Fragment key={p.id}>
                <tr
                    onClick={() => toggleProductPanel(p)}
                    style={{cursor: 'pointer'}}
                    className={`stock-row ${isExpanded ? 'stock-row--expanded' : ''}`}
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
                        <div className="product-name" style={{display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap'}}>
                            {p.name}
                            {p.defeito && (
                                <span style={{
                                    fontSize: '10px', fontWeight: 600, color: '#893030',
                                    background: '#FCE7E7', padding: '1px 6px', borderRadius: '4px',
                                    whiteSpace: 'nowrap', flexShrink: 0,
                                }}>Defeito</span>
                            )}
                            {p.observations && p.observations.trim() && (
                                <span
                                    style={{display: 'inline-flex', alignItems: 'center', cursor: 'help', flexShrink: 0}}
                                    onMouseEnter={(e) => showObsTooltip(e, p.observations)}
                                    onMouseLeave={hideObsTooltip}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{opacity: 0.75}}>
                                        <circle cx="12" cy="12" r="10" />
                                        <line x1="12" y1="8" x2="12" y2="12" />
                                        <line x1="12" y1="16" x2="12.01" y2="16" />
                                    </svg>
                                </span>
                            )}
                        </div>
                        {p.local && <div className="product-local">{'\uD83D\uDCCD'} {p.local}</div>}
                        {p.defeito && p.defeitoDescricao && (
                            <div style={{fontSize: '11px', color: '#893030', marginTop: '2px', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                                {p.defeitoDescricao}
                            </div>
                        )}
                    </td>
                    <td className="hide-mobile product-sku col-center">{p.sku}</td>
                    <td className="col-center">
                        <span style={{
                            fontWeight: 600, fontSize: '14px',
                            color: p.currentQuantity > 0 ? '#39845f' : '#893030',
                        }}>
                            {p.currentQuantity}
                        </span>
                    </td>
                    <td className="hide-mobile col-center" style={{fontSize: '12px', color: 'var(--text-secondary)'}}>
                        {p.unitPrice > 0 ? `R$ ${formatBRL(p.unitPrice)}` : '\u2014'}
                    </td>
                </tr>
                {isExpanded && renderDetailPanel(p)}
            </React.Fragment>
        );
    };

    // Render the inline detail panel (inserted as a spanning <tr> below the product row)
    const renderDetailPanel = (p) => {
        const history = !isEquipe ? getProductHistory(p.sku) : [];
        const nfsComSaldo = !isEquipe ? getNfBalance(p.sku) : [];
        return (
            <tr className="stock-detail-row">
                <td colSpan={5} style={{padding: 0, borderBottom: '1px solid var(--border-default)'}}>
                    <div className="stock-detail-panel">
                        <div className="stock-detail-left">
                            <div className="stock-detail-image">
                                {p.imagemUrl && p.imagemUrl !== 'sem-imagem' ? (
                                    <img src={p.imagemUrl} alt={p.name} loading="lazy" />
                                ) : (
                                    <div className="stock-detail-image-fallback">
                                        <Icon name="boxOpen" size={48} style={{opacity: 0.25}} />
                                    </div>
                                )}
                            </div>

                            <div className="stock-detail-actions">
                                {isStockAdmin && p.sku && (
                                    <button
                                        className="btn btn-secondary btn-sm"
                                        onClick={(e) => { e.stopPropagation(); handleTinySync(p); }}
                                        disabled={tinySyncLoading === p.id}
                                        title="Atualizar dados do Tiny ERP"
                                    >
                                        {tinySyncLoading === p.id ? (
                                            <><Icon name="spinner" size={12} style={{animation: 'spin 1s linear infinite'}} /> Atualizando...</>
                                        ) : (
                                            <><Icon name="sync" size={12} /> Atualizar do Tiny</>
                                        )}
                                    </button>
                                )}
                                {!isEquipe && isStockAdmin && (
                                    <>
                                        <button className="btn btn-primary btn-sm" onClick={(e) => { e.stopPropagation(); openEditModal(p); }}>Editar</button>
                                        <button className="btn btn-sm stock-detail-delete" onClick={(e) => { e.stopPropagation(); handleDelete(p); setDetailProduct(null); }}>Excluir</button>
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="stock-detail-right">
                            <div className="stock-detail-category-header">
                                {(getCategoryName(p.category) || 'SEM CATEGORIA').toUpperCase()} — {p.currentQuantity} UN.
                            </div>
                            {!isEquipe && history.length > 0 ? (
                                <div className="stock-detail-history">
                                    <table className="table">
                                        <thead>
                                            <tr>
                                                <th>Data</th>
                                                <th>Tipo</th>
                                                <th>Qtd.</th>
                                                <th>Local</th>
                                                <th>NF Entrada</th>
                                                <th>NF Saída</th>
                                                <th>Fornecedor/Cliente</th>
                                                <th>Obs.:</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {history.map((mov, idx) => {
                                                const isEntrada = mov.movimento === 'ENTRADA';
                                                const isDefeitoObs = mov.defeito || (mov.observations || '').toLowerCase().includes('defeito');
                                                const nfEntrada = isEntrada ? (mov.nf || '-') : (mov.nfOrigem || '-');
                                                const isNfDefeito = p.defeito && nfsComSaldo.some(([nfKey]) => nfKey === nfEntrada);
                                                return (
                                                    <tr key={idx}>
                                                        <td style={{fontSize: '11px', whiteSpace: 'nowrap'}}>{formatDate(mov.date)}</td>
                                                        <td>
                                                            <span className="stock-history-badge" style={{
                                                                color: isEntrada ? '#39845f' : '#893030',
                                                            }}>
                                                                {mov.movimento}
                                                            </span>
                                                        </td>
                                                        <td style={{fontWeight: 600, color: isEntrada ? '#39845f' : '#893030'}}>
                                                            {isEntrada ? '+' : '-'}{mov.quantity}
                                                        </td>
                                                        <td style={{fontSize: '11px'}}>{mov.localEntrada || '-'}</td>
                                                        <td style={{fontFamily: 'monospace', fontSize: '11px'}}>
                                                            {nfEntrada}
                                                            {isEntrada && isNfDefeito && (
                                                                <span title="Produto com defeito" style={{color: '#893030', marginLeft: 3}}>&#9888;</span>
                                                            )}
                                                        </td>
                                                        <td style={{fontFamily: 'monospace', fontSize: '11px'}}>{!isEntrada ? (mov.nf || '-') : '-'}</td>
                                                        <td style={{fontSize: '12px'}}>{mov.supplier || mov.client || '-'}</td>
                                                        <td style={{fontSize: '11px', color: isDefeitoObs ? '#893030' : 'var(--text-muted)', fontWeight: isDefeitoObs ? 700 : 400, maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                                                            {mov.observations || mov.defeitoDescricao || '-'}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                        {nfsComSaldo.length > 0 && (() => {
                                            // Consolidar locais (únicos) e NFs com saldo
                                            const locais = Array.from(new Set(
                                                nfsComSaldo.map(([, d]) => d.local).filter(l => l && l !== '-')
                                            )).join(', ');
                                            return (
                                                <tfoot>
                                                    <tr className="stock-saldo-row">
                                                        <td colSpan={2} style={{fontWeight: 700, letterSpacing: '0.04em'}}>SALDO</td>
                                                        <td style={{fontWeight: 700, color: '#39845f'}}>
                                                            {p.currentQuantity} un
                                                        </td>
                                                        <td style={{fontSize: '11px'}}>{locais || '-'}</td>
                                                        <td style={{fontFamily: 'monospace', fontSize: '11px'}}>
                                                            {nfsComSaldo.map(([nf], i) => (
                                                                <span key={nf}>
                                                                    {i > 0 && ', '}
                                                                    {nf === 'SEM_NF' ? '(s/ NF)' : nf}
                                                                    {p.defeito && (
                                                                        <span title="Produto com defeito" style={{color: '#893030', marginLeft: 2}}>&#9888;</span>
                                                                    )}
                                                                </span>
                                                            ))}
                                                        </td>
                                                        <td colSpan={3}></td>
                                                    </tr>
                                                </tfoot>
                                            );
                                        })()}
                                    </table>
                                </div>
                            ) : (
                                <div className="stock-detail-history-empty">
                                    Nenhuma movimentação registrada
                                </div>
                            )}

                            <div className="stock-detail-close">
                                <button className="btn-close-panel" onClick={(e) => { e.stopPropagation(); setDetailProduct(null); }}>
                                    Fechar
                                </button>
                            </div>
                        </div>
                    </div>
                </td>
            </tr>
        );
    };

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">Estoque</h1>
            </div>

            {successMsg && <div className="alert alert-success">{successMsg}</div>}

            {/* Category Manager Modal — opened by gear icon next to "Categoria" title */}
            {showCategoryManager && (
                <div className="modal-overlay" onClick={() => setShowCategoryManager(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: '600px', maxHeight: '85vh', overflow: 'auto'}}>
                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px'}}>
                            <h3 style={{margin: 0}}>Gerenciar Categorias</h3>
                            <button className="btn btn-icon btn-secondary" onClick={() => setShowCategoryManager(false)}>
                                <Icon name="close" size={16} />
                            </button>
                        </div>
                        <CategoryManager
                            categories={categories}
                            onAdd={onAddCategory}
                            onUpdate={onUpdateCategory}
                            onDelete={onDeleteCategory}
                            products={products || stock}
                        />
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

                        {/* Defeito */}
                        <div style={{
                            border: editForm.defeito ? '1px solid #FCA5A5' : '1px solid var(--border)',
                            background: editForm.defeito ? '#FEF2F2' : 'transparent',
                            borderRadius: 'var(--radius)', padding: '12px', marginBottom: '16px',
                        }}>
                            <label style={{display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 500}}>
                                <input
                                    type="checkbox"
                                    checked={editForm.defeito}
                                    onChange={(e) => setEditForm({...editForm, defeito: e.target.checked})}
                                    style={{width: '18px', height: '18px', accentColor: '#DC2626'}}
                                />
                                Produto com defeito
                            </label>
                            {editForm.defeito && (
                                <div className="form-group" style={{marginTop: '10px', marginBottom: 0}}>
                                    <label className="form-label">Descrição do defeito</label>
                                    <textarea
                                        className="form-textarea"
                                        value={editForm.defeitoDescricao}
                                        onChange={(e) => setEditForm({...editForm, defeitoDescricao: e.target.value})}
                                        placeholder="Ex: Risco na base, LED queimado, peça faltante..."
                                        rows={2}
                                    />
                                </div>
                            )}
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

            {/* CATEGORIA — chips horizontais (+ gear para gerenciar) */}
            <div className="stock-category-section-wrap">
                <div className="stock-category-title-row">
                    <Icon name="folder" size={16} className="stock-category-title-icon" />
                    <h3 className="stock-category-title">Categoria</h3>
                    {isStockAdmin && (
                        <button
                            type="button"
                            className="stock-category-gear"
                            onClick={() => setShowCategoryManager(true)}
                            title="Gerenciar categorias"
                            aria-label="Gerenciar categorias"
                        >
                            <Icon name="settings" size={16} />
                        </button>
                    )}
                </div>
                <div className="stock-chips-row">
                    {categoryChips.length === 0 ? (
                        <span style={{fontSize: '12px', color: 'var(--text-muted)'}}>Nenhuma categoria cadastrada</span>
                    ) : categoryChips.map(chip => (
                        <button
                            key={chip.id}
                            type="button"
                            className={`stock-chip ${selectedCategoryId === chip.id ? 'active' : ''}`}
                            onClick={() => toggleCategoryChip(chip.id)}
                        >
                            <span className="stock-chip-name">{chip.name}</span>
                            <span className="stock-chip-count">({String(chip.count).padStart(2, '0')})</span>
                        </button>
                    ))}
                </div>

                {/* Sub-filtros + busca (mesma largura dos chips, sem card extra) */}
                <div className="stock-subfilter-row">
                    <div className="filter-tabs stock-filter-tabs">
                        <button className={`filter-tab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
                            Todos ({String(statusCounts.all).padStart(3, '0')})
                        </button>
                        <button className={`filter-tab ${filter === 'ok' ? 'active' : ''}`} onClick={() => setFilter('ok')}>
                            OK ({String(statusCounts.ok).padStart(3, '0')})
                        </button>
                        <button className={`filter-tab ${filter === 'empty' ? 'active' : ''}`} onClick={() => setFilter('empty')}>
                            S/ Estoque ({String(statusCounts.empty).padStart(3, '0')})
                        </button>
                        <button
                            className={`filter-tab stock-filter-tab--defeito ${filter === 'defeito' ? 'active' : ''}`}
                            onClick={() => setFilter('defeito')}
                        >
                            Produtos com defeito ({String(statusCounts.defeito).padStart(3, '0')})
                        </button>
                    </div>
                    <div className="search-box stock-search-box">
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
                </div>

                {/* Hide zero stock toggle — abaixo dos sub-filtros, alinhado à esquerda */}
                <div className="stock-hide-zero-row">
                    <label>
                        <input type="checkbox" checked={hideZeroStock} onChange={e => setHideZeroStock(e.target.checked)} />
                        Ocultar produtos zerados
                    </label>
                </div>
            </div>

            {/* Equipe: server-side count */}
            {isEquipe && equipeTotalCount > 0 && (
                <div style={{ textAlign: 'center', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                    Mostrando {(equipeProducts || []).length} de {equipeTotalCount} produtos
                </div>
            )}

            {/* Flat product table with inline expansion panel */}
            {filteredProducts.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-state-icon"><Icon name="boxOpen" size={48} /></div>
                    <h3>Nenhum produto encontrado</h3>
                    <p>Tente ajustar os filtros ou a busca</p>
                </div>
            ) : (
                <div className="card stock-flat-list" style={{padding: 0}}>
                    <table className="table stock-main-table">
                        <thead>
                            <tr>
                                <th style={{width: '48px'}}></th>
                                <SortHeader field="name">Produto</SortHeader>
                                <SortHeader field="sku" className="hide-mobile col-center">SKU</SortHeader>
                                <SortHeader field="quantity" className="col-center">Estoque</SortHeader>
                                <SortHeader field="price" className="hide-mobile col-center">Preço</SortHeader>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredProducts.slice(0, visibleLimit).map(renderProductRow)}
                        </tbody>
                    </table>
                    {filteredProducts.length > visibleLimit && (
                        <div style={{textAlign: 'center', padding: '12px', borderTop: '1px solid var(--border-default)'}}>
                            <button className="btn btn-secondary btn-sm" onClick={() => setVisibleLimit(v => v + 100)}>
                                Mostrar mais ({filteredProducts.length - visibleLimit} restantes)
                            </button>
                        </div>
                    )}
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

            {obsTooltip && (
                <div style={{
                    position: 'fixed',
                    left: obsTooltip.left,
                    top: obsTooltip.openUp ? 'auto' : obsTooltip.top,
                    bottom: obsTooltip.openUp ? (window.innerHeight - obsTooltip.top) + 'px' : 'auto',
                    transform: 'translateX(-50%)',
                    maxWidth: '300px',
                    minWidth: '120px',
                    background: '#1f2937',
                    color: '#fff',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 400,
                    lineHeight: 1.4,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    zIndex: 9999,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                    pointerEvents: 'none',
                    textAlign: 'left',
                }}>{obsTooltip.text}</div>
            )}

            <style>{`
                .hide-mobile {}
                @media (max-width: 768px) {
                    .hide-mobile { display: none !important; }
                }
                .stock-row:hover { background: #fafafa; }
                .stock-row td { border-bottom: 1px solid #f0f0f0; }
                .stock-row--expanded { background: #f9fafb; }
                .stock-row--expanded td { border-bottom-color: transparent; }
                .product-name { font-weight: 600; font-size: 14px; color: #1a1a2e; line-height: 1.3; }
                .product-local { font-size: 12px; color: #9ca3af; margin-top: 2px; }
                .product-sku { font-family: monospace; font-size: 12px; color: #9ca3af; }
            `}</style>
        </div>
    );
}
