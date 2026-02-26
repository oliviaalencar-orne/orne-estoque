/**
 * StockView.jsx — Stock view with category groups, search, edit/delete
 *
 * Extracted from index-legacy.html L3831-4477
 */
import React, { useState, useEffect, useMemo } from 'react';
import { Icon, CategoryIcon } from '@/utils/icons';
import { formatBRL } from '@/utils/formatters';

export default function StockView({ stock, categories, onUpdate, onDelete, searchTerm, setSearchTerm, entries, exits, locaisOrigem }) {
    // Loading state enquanto produtos ainda nao carregaram
    if (stock.length === 0) {
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
    const [editingProduct, setEditingProduct] = useState(null);
    const [editForm, setEditForm] = useState({});
    const [successMsg, setSuccessMsg] = useState('');
    const [historyProduct, setHistoryProduct] = useState(null);

    // Busca com debounce
    const [searchInput, setSearchInput] = useState(searchTerm || '');
    const [debouncedSearch, setDebouncedSearch] = useState(searchTerm || '');
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchInput);
            setSearchTerm(searchInput);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchInput]);

    // Ordenacao e filtros
    const [sortBy, setSortBy] = useState('name');
    const [sortOrder, setSortOrder] = useState('asc');
    const [hideZeroStock, setHideZeroStock] = useState(true);

    // Categorias expandidas/recolhidas
    const [expandedCategories, setExpandedCategories] = useState(() => {
        const initial = {};
        categories.forEach(cat => { initial[cat.name] = true; });
        initial['Sem categoria'] = false;
        return initial;
    });

    const toggleCategory = (catName) => {
        setExpandedCategories(prev => ({ ...prev, [catName]: !prev[catName] }));
    };

    const getCategoryName = (catId) => {
        const cat = categories.find(c => c.id === catId);
        return cat ? cat.name : 'Sem categoria';
    };

    const getCategoryColor = (catId) => {
        const cat = categories.find(c => c.id === catId);
        return cat?.color || '#6b7280';
    };

    // Funcao de ordenacao
    const sortProducts = (prods, by, order) => {
        return [...prods].sort((a, b) => {
            let cmp = 0;
            switch (by) {
                case 'name': cmp = (a.name || '').localeCompare(b.name || ''); break;
                case 'date': cmp = new Date(a.createdAt || 0) - new Date(b.createdAt || 0); break;
                case 'price': cmp = (a.unitPrice || 0) - (b.unitPrice || 0); break;
                case 'quantity': cmp = (a.currentQuantity || 0) - (b.currentQuantity || 0); break;
                default: cmp = 0;
            }
            return order === 'desc' ? -cmp : cmp;
        });
    };

    // Busca ativa = mostrar tudo independente do toggle
    const hasSearch = debouncedSearch.trim() !== '';

    // Produtos agrupados por categoria (PERFORMANCE: useMemo)
    const groupedProducts = useMemo(() => {
        let filtered = stock;

        // Filtro de busca
        if (hasSearch) {
            const term = debouncedSearch.toLowerCase();
            filtered = filtered.filter(p =>
                (p.name || '').toLowerCase().includes(term) ||
                (p.sku || '').toLowerCase().includes(term) ||
                (p.ean || '').toLowerCase().includes(term) ||
                (p.nfOrigem || '').toLowerCase().includes(term)
            );
        }

        // Filtro de status (abas)
        if (filter !== 'all') {
            filtered = filtered.filter(p => p.status === filter);
        }

        // Ocultar zerados (exceto se busca ativa ou aba "Zerado")
        if (hideZeroStock && !hasSearch && filter !== 'empty') {
            filtered = filtered.filter(p => p.currentQuantity > 0);
        }

        // Agrupar por categoria
        const groups = {};
        categories.forEach(cat => { groups[cat.name] = []; });
        groups['Sem categoria'] = [];

        filtered.forEach(product => {
            const catName = getCategoryName(product.category);
            if (!groups[catName]) groups[catName] = [];
            groups[catName].push(product);
        });

        // Ordenar dentro de cada grupo
        Object.keys(groups).forEach(catName => {
            groups[catName] = sortProducts(groups[catName], sortBy, sortOrder);
        });

        return groups;
    }, [stock, categories, debouncedSearch, hideZeroStock, sortBy, sortOrder, filter]);

    // Contagem total de produtos filtrados
    const totalFiltered = useMemo(() => {
        return Object.values(groupedProducts).reduce((sum, arr) => sum + arr.length, 0);
    }, [groupedProducts]);

    // Contagens para as abas de status (sem filtro de status mas com busca e hideZeroStock)
    const statusCounts = useMemo(() => {
        let base = stock;
        if (hasSearch) {
            const term = debouncedSearch.toLowerCase();
            base = base.filter(p =>
                (p.name || '').toLowerCase().includes(term) ||
                (p.sku || '').toLowerCase().includes(term) ||
                (p.ean || '').toLowerCase().includes(term) ||
                (p.nfOrigem || '').toLowerCase().includes(term)
            );
        }
        const all = hideZeroStock && !hasSearch ? base.filter(p => p.currentQuantity > 0) : base;
        return {
            all: all.length,
            ok: base.filter(p => p.status === 'ok').length,
            low: base.filter(p => p.status === 'low').length,
            empty: base.filter(p => p.status === 'empty').length,
        };
    }, [stock, debouncedSearch, hideZeroStock]);

    // Quando busca ativa, expandir tudo automaticamente
    useEffect(() => {
        if (debouncedSearch.trim() !== '') {
            setExpandedCategories(prev => {
                const next = { ...prev };
                categories.forEach(cat => { next[cat.name] = true; });
                next['Sem categoria'] = true;
                return next;
            });
        }
    }, [debouncedSearch]);

    const openEditModal = (product) => {
        setEditForm({
            name: product.name || '',
            sku: product.sku || '',
            ean: product.ean || '',
            category: product.category || '',
            minStock: product.minStock || 3,
            observations: product.observations || '',
            nfOrigem: product.nfOrigem || '',
            local: product.local || '',
        });
        setEditingProduct(product);
    };

    // Obter historico de movimentacoes do produto
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

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">Estoque</h1>
                <p className="page-subtitle">Visualize e gerencie seus produtos</p>
            </div>

            {successMsg && <div className="alert alert-success">{successMsg}</div>}

            {/* Modal de Edicao */}
            {editingProduct && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h2 className="modal-title">Editar Produto</h2>
                        <p className="modal-subtitle">Atualize as informacoes do produto</p>

                        <div className="form-group">
                            <label className="form-label">Nome do Produto</label>
                            <input
                                type="text"
                                className="form-input"
                                value={editForm.name}
                                onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                            />
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">SKU</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={editForm.sku}
                                    onChange={(e) => setEditForm({...editForm, sku: e.target.value})}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">EAN</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={editForm.ean}
                                    onChange={(e) => setEditForm({...editForm, ean: e.target.value})}
                                />
                            </div>
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">Categoria</label>
                                <select
                                    className="form-select"
                                    value={editForm.category}
                                    onChange={(e) => setEditForm({...editForm, category: e.target.value})}
                                >
                                    <option value="">Sem categoria</option>
                                    {categories.map(cat => (
                                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Estoque Minimo</label>
                                <input
                                    type="number"
                                    className="form-input"
                                    value={editForm.minStock}
                                    onChange={(e) => setEditForm({...editForm, minStock: e.target.value})}
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Local</label>
                            <select
                                className="form-select"
                                value={editForm.local || ''}
                                onChange={(e) => setEditForm({...editForm, local: e.target.value})}
                            >
                                <option value="">Selecione o local</option>
                                {(locaisOrigem || []).map(l => (
                                    <option key={l} value={l}>{l}</option>
                                ))}
                            </select>
                        </div>

                        {editingProduct && editingProduct.unitPrice > 0 && (
                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">Preco Unitario</label>
                                    <div style={{padding: '8px 0', fontSize: '14px', color: 'var(--text-primary)'}}>
                                        R$ {formatBRL(editingProduct.unitPrice)}
                                    </div>
                                    <span style={{color: 'var(--text-tertiary)', fontSize: '11px'}}>Sincronizado via Tiny ERP</span>
                                </div>
                                <div className="form-group"></div>
                            </div>
                        )}

                        <div className="form-group">
                            <label className="form-label">NF de Origem</label>
                            <input
                                type="text"
                                className="form-input"
                                value={editForm.nfOrigem}
                                onChange={(e) => setEditForm({...editForm, nfOrigem: e.target.value})}
                                placeholder="Numero da NF para localizar no estoque"
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Observacoes</label>
                            <textarea
                                className="form-textarea"
                                value={editForm.observations}
                                onChange={(e) => setEditForm({...editForm, observations: e.target.value})}
                                placeholder="Informacoes adicionais sobre o produto..."
                            />
                        </div>

                        <div style={{background: 'var(--bg-primary)', padding: '12px', borderRadius: 'var(--radius)', marginBottom: '16px', fontSize: '13px'}}>
                            <strong>Estoque atual:</strong> {editingProduct.currentQuantity} unidades
                            <div style={{fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px'}}>
                                Para alterar quantidade, use Entrada ou Saida
                            </div>
                        </div>

                        <div className="btn-group">
                            <button className="btn btn-primary" onClick={handleSaveEdit}>Salvar</button>
                            <button className="btn btn-secondary" onClick={() => setEditingProduct(null)}>Cancelar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Historico de Movimentacoes */}
            {historyProduct && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{maxWidth: '800px'}}>
                        <h2 className="modal-title">Historico de Movimentacoes</h2>
                        <p className="modal-subtitle">{historyProduct.name}</p>

                        <div style={{background: 'var(--bg-primary)', padding: '12px', borderRadius: 'var(--radius)', marginBottom: '16px'}}>
                            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '13px'}}>
                                <div><strong>SKU:</strong> {historyProduct.sku}</div>
                                <div><strong>Estoque Atual:</strong> {historyProduct.currentQuantity} un.</div>
                            </div>
                        </div>

                        {(() => {
                            const history = getProductHistory(historyProduct.sku);
                            if (history.length === 0) {
                                return (
                                    <div style={{textAlign: 'center', padding: '24px', color: 'var(--text-muted)'}}>
                                        Nenhuma movimentacao registrada
                                    </div>
                                );
                            }
                            return (
                                <div className="table-container" style={{maxHeight: '350px', overflowY: 'auto'}}>
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
                                                            padding: '2px 8px',
                                                            borderRadius: '10px',
                                                            fontSize: '10px',
                                                            fontWeight: '600'
                                                        }}>
                                                            {mov.movimento}
                                                        </span>
                                                    </td>
                                                    <td style={{fontWeight: '600'}}>{mov.quantity}</td>
                                                    <td style={{fontSize: '11px'}}>
                                                        {mov.localEntrada && (
                                                            <span style={{
                                                                background: 'var(--accent-bg)',
                                                                color: 'var(--accent)',
                                                                padding: '2px 6px',
                                                                borderRadius: '8px',
                                                                fontSize: '10px'
                                                            }}>
                                                                {mov.localEntrada}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td style={{fontFamily: 'monospace', fontSize: '11px'}}>
                                                        {mov.movimento === 'ENTRADA' ? (mov.nf || '-') : (mov.nfOrigem || '-')}
                                                    </td>
                                                    <td style={{fontFamily: 'monospace', fontSize: '11px'}}>
                                                        {mov.movimento === 'SAIDA' ? (mov.nf || '-') : '-'}
                                                    </td>
                                                    <td style={{fontSize: '12px'}}>{mov.supplier || mov.client || '-'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            );
                        })()}

                        {/* Resumo por NF de entrada */}
                        {(() => {
                            const history = getProductHistory(historyProduct.sku);
                            const entradas = history.filter(h => h.movimento === 'ENTRADA');
                            const saidas = history.filter(h => h.movimento === 'SAIDA');

                            // Calcular saldo por NF incluindo local
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

                            const nfsComSaldo = Object.entries(saldoPorNF).filter(([nf, dados]) => dados.entradas - dados.saidas > 0);

                            if (nfsComSaldo.length === 0) return null;

                            return (
                                <div style={{marginTop: '16px', padding: '12px', background: 'var(--info-light)', borderRadius: 'var(--radius)'}}>
                                    <div style={{fontWeight: '600', marginBottom: '8px', fontSize: '13px'}}>Estoque por NF de Entrada:</div>
                                    <div style={{display: 'flex', flexWrap: 'wrap', gap: '8px'}}>
                                        {nfsComSaldo.map(([nf, dados]) => (
                                            <div key={nf} style={{
                                                background: 'white',
                                                padding: '6px 12px',
                                                borderRadius: 'var(--radius)',
                                                fontSize: '12px'
                                            }}>
                                                <strong>NF {nf === 'SEM_NF' ? '(sem NF)' : nf}:</strong> {dados.entradas - dados.saidas} un.
                                                {dados.local && dados.local !== '-' && (
                                                    <span style={{marginLeft: '6px', color: 'var(--accent)', fontSize: '11px'}}>
                                                        {dados.local}
                                                    </span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })()}

                        <div className="btn-group" style={{marginTop: '16px'}}>
                            <button className="btn btn-secondary" onClick={() => setHistoryProduct(null)}>Fechar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Barra de busca */}
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
                        <button onClick={() => { setSearchInput(''); setDebouncedSearch(''); setSearchTerm(''); }} style={{background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', color: '#999', fontSize: '16px'}} title="Limpar busca">&times;</button>
                    )}
                </div>

                {/* Abas de status */}
                <div className="filter-tabs">
                    <button className={`filter-tab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
                        Todos ({statusCounts.all})
                    </button>
                    <button className={`filter-tab ${filter === 'ok' ? 'active' : ''}`} onClick={() => setFilter('ok')}>
                        OK ({statusCounts.ok})
                    </button>
                    <button className={`filter-tab ${filter === 'low' ? 'active' : ''}`} onClick={() => setFilter('low')}>
                        Baixo ({statusCounts.low})
                    </button>
                    <button className={`filter-tab ${filter === 'empty' ? 'active' : ''}`} onClick={() => setFilter('empty')}>
                        Zerado ({statusCounts.empty})
                    </button>
                </div>
            </div>

            {/* Filtros: ocultar zerados + ordenacao */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 0', marginBottom: '16px', flexWrap: 'wrap', gap: '12px'
            }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#555', cursor: 'pointer' }}>
                    <input
                        type="checkbox"
                        checked={hideZeroStock}
                        onChange={e => setHideZeroStock(e.target.checked)}
                    />
                    Ocultar produtos zerados
                </label>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '13px', color: '#555' }}>Ordenar por:</span>
                    <select
                        value={sortBy}
                        onChange={e => setSortBy(e.target.value)}
                        className="form-select"
                        style={{ fontSize: '13px', padding: '4px 8px', minWidth: 'auto', width: 'auto' }}
                    >
                        <option value="name">Nome</option>
                        <option value="date">Mais recentes</option>
                        <option value="price">Preco</option>
                        <option value="quantity">Quantidade</option>
                    </select>
                    <button
                        onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                        className="btn btn-secondary"
                        style={{ padding: '4px 10px', fontSize: '13px', minWidth: 'auto' }}
                        title={sortOrder === 'asc' ? 'Crescente' : 'Decrescente'}
                    >
                        {sortOrder === 'asc' ? '\u2191' : '\u2193'}
                    </button>
                </div>
            </div>

            {/* Secoes agrupadas por categoria */}
            {totalFiltered === 0 ? (
                <div className="empty-state">
                    <div className="empty-state-icon"><Icon name="boxOpen" size={48} /></div>
                    <h3>Nenhum produto encontrado</h3>
                    <p>Tente ajustar os filtros ou a busca</p>
                </div>
            ) : (
                Object.entries(groupedProducts).map(([catName, prods]) => {
                    if (prods.length === 0) return null;
                    const catData = categories.find(c => c.name === catName);
                    const isExpanded = expandedCategories[catName] !== false;

                    return (
                        <div key={catName} style={{ marginBottom: '16px' }}>
                            {/* Header da secao */}
                            <div
                                onClick={() => toggleCategory(catName)}
                                style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '12px 16px', background: '#f8f8f8', borderRadius: '8px',
                                    cursor: 'pointer', userSelect: 'none',
                                    marginBottom: isExpanded ? '12px' : '0',
                                    border: '1px solid #eee'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{
                                        fontSize: '14px', transition: 'transform 0.2s',
                                        transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                        display: 'inline-block'
                                    }}>{'\u25B6'}</span>
                                    {catData ? (
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                            <span style={{
                                                background: catData.color || '#666', color: 'white',
                                                width: '24px', height: '24px', borderRadius: '50%',
                                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: '12px'
                                            }}>
                                                <CategoryIcon icon={catData.icon} size={12} />
                                            </span>
                                            <span style={{ fontWeight: 600, fontSize: '14px', color: '#333' }}>
                                                {catName}
                                            </span>
                                        </span>
                                    ) : (
                                        <span style={{ fontWeight: 600, fontSize: '14px', color: '#666' }}>{catName}</span>
                                    )}
                                    <span style={{ color: '#888', fontSize: '13px' }}>({prods.length})</span>
                                </div>
                            </div>

                            {/* Grid de cards — so renderiza se expandido */}
                            {isExpanded && (
                                <div className="products-grid">
                                    {prods.map(p => (
                                        <div key={p.id} className={`product-card ${p.status}`}>
                                            <div className="product-actions">
                                                <button className="btn btn-icon btn-secondary" onClick={() => setHistoryProduct(p)} title="Ver Historico"><Icon name="clipboard" size={14} /></button>
                                                <button className="btn btn-icon btn-secondary" onClick={() => openEditModal(p)} title="Editar"><Icon name="edit" size={14} /></button>
                                                <button className="btn btn-icon btn-secondary" onClick={() => handleDelete(p)} title="Excluir"><Icon name="delete" size={14} /></button>
                                            </div>

                                            <span className="product-category-badge" style={{color: getCategoryColor(p.category), background: getCategoryColor(p.category) + '10', border: '1px solid ' + getCategoryColor(p.category) + '20'}}>
                                                {getCategoryName(p.category)}
                                            </span>

                                            <div className="product-name">{p.name}</div>
                                            <div className="product-sku">SKU: {p.sku}</div>
                                            {p.ean && <div className="product-sku">EAN: {p.ean}</div>}
                                            <div className="product-price">{p.unitPrice > 0 ? `R$ ${formatBRL(p.unitPrice)}` : 'Preco: nao sincronizado'}</div>

                                            {p.local && p.local.trim() !== '' && (
                                                <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                                                    {'\uD83D\uDCCD'} {p.local}
                                                </div>
                                            )}

                                            {p.observations && p.observations.trim() !== '' && (
                                                <div style={{ fontSize: '12px', color: '#888', marginTop: '4px', fontStyle: 'italic' }}>
                                                    {'\uD83D\uDCAC'} {p.observations.length > 80 ? p.observations.substring(0, 80) + '...' : p.observations}
                                                </div>
                                            )}

                                            <div className="product-quantity">{p.currentQuantity}</div>
                                            {p.unitPrice > 0 && <div className="product-value">Valor: R$ {formatBRL(p.unitPrice * p.currentQuantity)}</div>}
                                            <span className={`product-status status-${p.status}`}>
                                                {p.status === 'ok' ? 'OK' : p.status === 'low' ? 'BAIXO' : 'ZERADO'}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })
            )}
        </div>
    );
}
