/**
 * History.jsx — Movement history with search, filters, edit/delete
 *
 * Extracted from index-legacy.html L10082-10434
 */
import React, { useState, useMemo } from 'react';
import { Icon } from '@/utils/icons';
import PeriodFilter, { filterByPeriod, formatUserEmail } from '@/components/ui/PeriodFilter';

export default function History({ entries, exits, products, onUpdateEntry, onDeleteEntry, onUpdateExit, onDeleteExit, isStockAdmin }) {
    const [filter, setFilter] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [editingItem, setEditingItem] = useState(null);
    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const [editForm, setEditForm] = useState({});
    const [saving, setSaving] = useState(false);
    const [periodFilter, setPeriodFilter] = useState('30');
    const [customMonth, setCustomMonth] = useState(new Date().getMonth());
    const [customYear, setCustomYear] = useState(new Date().getFullYear());

    const getProductName = (sku) => products.find(p => p.sku === sku)?.name || sku;

    const filtered = useMemo(() => {
        let items = [
            ...entries.map(e => ({...e, movType: 'entry'})),
            ...exits.map(e => ({...e, movType: 'exit'}))
        ];

        // Filtro por periodo
        items = filterByPeriod(items, periodFilter, customMonth, customYear, 'date');

        // Filtro por tipo
        if (filter !== 'all') {
            items = items.filter(m => m.movType === filter);
        }

        // Filtro por busca
        if (searchTerm) {
            const search = searchTerm.toLowerCase();
            items = items.filter(m => {
                const productName = getProductName(m.sku).toLowerCase();
                return productName.includes(search) ||
                    (m.sku || '').toLowerCase().includes(search) ||
                    (m.nf || '').toLowerCase().includes(search) ||
                    (m.nfOrigem || '').toLowerCase().includes(search) ||
                    (m.supplier || '').toLowerCase().includes(search) ||
                    (m.client || '').toLowerCase().includes(search) ||
                    (m.localEntrada || '').toLowerCase().includes(search) ||
                    (m.userId || '').toLowerCase().includes(search);
            });
        }

        items.sort((a, b) => new Date(b.date) - new Date(a.date));
        return items;
    }, [entries, exits, filter, searchTerm, periodFilter, customMonth, customYear]);

    const handleEdit = (m) => {
        setEditForm({
            sku: m.sku || '',
            quantity: m.quantity || 0,
            supplier: m.supplier || '',
            client: m.client || '',
            nf: m.nf || '',
            nfOrigem: m.nf_origem || m.nfOrigem || '',
            localEntrada: m.local_entrada || m.localEntrada || '',
            type: m.type || '',
            date: m.date ? new Date(m.date).toISOString().slice(0, 16) : '',
        });
        setEditingItem(m);
    };

    const handleSave = async () => {
        if (!editingItem) return;
        setSaving(true);
        try {
            if (editingItem.movType === 'entry') {
                await onUpdateEntry(editingItem.id, {
                    sku: editForm.sku,
                    quantity: parseInt(editForm.quantity),
                    supplier: editForm.supplier,
                    nf: editForm.nf,
                    localEntrada: editForm.localEntrada,
                    type: editForm.type,
                    date: editForm.date ? new Date(editForm.date).toISOString() : undefined,
                });
            } else {
                await onUpdateExit(editingItem.id, {
                    sku: editForm.sku,
                    quantity: parseInt(editForm.quantity),
                    client: editForm.client,
                    nf: editForm.nf,
                    nfOrigem: editForm.nfOrigem,
                    type: editForm.type,
                    date: editForm.date ? new Date(editForm.date).toISOString() : undefined,
                });
            }
            setEditingItem(null);
        } catch (e) {
            alert('Erro ao salvar: ' + e.message);
        }
        setSaving(false);
    };

    const handleDelete = async (m) => {
        try {
            if (m.movType === 'entry') {
                await onDeleteEntry(m.id);
            } else {
                await onDeleteExit(m.id);
            }
            setDeleteConfirm(null);
        } catch (e) {
            alert('Erro ao excluir: ' + e.message);
        }
    };

    const sortedProducts = [...products].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">Historico</h1>
                <p className="page-subtitle">Movimentacoes de estoque</p>
            </div>

            {/* Modal de Edicao */}
            {editingItem && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h2 className="modal-title">Editar {editingItem.movType === 'entry' ? 'Entrada' : 'Saida'}</h2>
                        <p className="modal-subtitle">{getProductName(editingItem.sku)}</p>

                        <div className="form-group">
                            <label className="form-label">Produto (SKU)</label>
                            <select className="form-select" value={editForm.sku} onChange={e => setEditForm({...editForm, sku: e.target.value})}>
                                <option value="">Selecione...</option>
                                {sortedProducts.map(p => (
                                    <option key={p.sku} value={p.sku}>{p.name} ({p.sku})</option>
                                ))}
                            </select>
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">Quantidade</label>
                                <input type="number" className="form-input" min="1" value={editForm.quantity} onChange={e => setEditForm({...editForm, quantity: e.target.value})} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Tipo</label>
                                <input type="text" className="form-input" value={editForm.type} onChange={e => setEditForm({...editForm, type: e.target.value})} />
                            </div>
                        </div>

                        <div className="form-row">
                            {editingItem.movType === 'entry' ? (
                                <div className="form-group">
                                    <label className="form-label">Fornecedor</label>
                                    <input type="text" className="form-input" value={editForm.supplier} onChange={e => setEditForm({...editForm, supplier: e.target.value})} />
                                </div>
                            ) : (
                                <div className="form-group">
                                    <label className="form-label">Cliente</label>
                                    <input type="text" className="form-input" value={editForm.client} onChange={e => setEditForm({...editForm, client: e.target.value})} />
                                </div>
                            )}
                            <div className="form-group">
                                <label className="form-label">NF</label>
                                <input type="text" className="form-input" value={editForm.nf} onChange={e => setEditForm({...editForm, nf: e.target.value})} />
                            </div>
                        </div>

                        {editingItem.movType === 'entry' && (
                            <div className="form-group">
                                <label className="form-label">Local de Entrada</label>
                                <input type="text" className="form-input" value={editForm.localEntrada} onChange={e => setEditForm({...editForm, localEntrada: e.target.value})} />
                            </div>
                        )}

                        {editingItem.movType === 'exit' && (
                            <div className="form-group">
                                <label className="form-label">NF Origem</label>
                                <input type="text" className="form-input" value={editForm.nfOrigem} onChange={e => setEditForm({...editForm, nfOrigem: e.target.value})} />
                            </div>
                        )}

                        <div className="form-group">
                            <label className="form-label">Data</label>
                            <input type="datetime-local" className="form-input" value={editForm.date} onChange={e => setEditForm({...editForm, date: e.target.value})} />
                        </div>

                        <div className="btn-group" style={{marginTop: '20px'}}>
                            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                                {saving ? 'Salvando...' : 'Salvar'}
                            </button>
                            <button className="btn btn-secondary" onClick={() => setEditingItem(null)}>Cancelar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Confirmacao de Exclusao */}
            {deleteConfirm && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{maxWidth: '400px'}}>
                        <h2 className="modal-title">Confirmar Exclusao</h2>
                        <p style={{margin: '16px 0', fontSize: '14px'}}>
                            Excluir esta {deleteConfirm.movType === 'entry' ? 'entrada' : 'saida'}?
                        </p>
                        <div style={{padding: '12px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', marginBottom: '16px', fontSize: '13px'}}>
                            <div><strong>{getProductName(deleteConfirm.sku)}</strong></div>
                            <div>Qtd: {deleteConfirm.quantity} | NF: {deleteConfirm.nf || '-'}</div>
                            <div>{new Date(deleteConfirm.date).toLocaleDateString('pt-BR')}</div>
                        </div>
                        <div className="btn-group">
                            <button className="btn" style={{background: 'var(--danger)', color: '#fff'}} onClick={() => handleDelete(deleteConfirm)}>Excluir</button>
                            <button className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>Cancelar</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="card">
                <div className="search-box" style={{marginBottom: '16px'}}>
                    <span className="search-icon"><Icon name="search" size={14} /></span>
                    <input
                        type="text"
                        className="search-input"
                        placeholder="Buscar por produto, SKU, NF, cliente, fornecedor ou local..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    {searchTerm && (
                        <button
                            onClick={() => setSearchTerm('')}
                            style={{
                                position: 'absolute',
                                right: '12px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: '16px',
                                color: 'var(--text-muted)'
                            }}
                        ><Icon name="close" size={12} /></button>
                    )}
                </div>

                <div className="filter-tabs" style={{marginBottom: '12px'}}>
                    <button className={`filter-tab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
                        Todas
                    </button>
                    <button className={`filter-tab ${filter === 'entry' ? 'active' : ''}`} onClick={() => setFilter('entry')}>
                        Entradas
                    </button>
                    <button className={`filter-tab ${filter === 'exit' ? 'active' : ''}`} onClick={() => setFilter('exit')}>
                        Saidas
                    </button>
                </div>

                <PeriodFilter
                    periodFilter={periodFilter} setPeriodFilter={setPeriodFilter}
                    customMonth={customMonth} setCustomMonth={setCustomMonth}
                    customYear={customYear} setCustomYear={setCustomYear}
                />

                {(searchTerm || periodFilter !== 'all') && (
                    <div style={{
                        padding: '8px 12px',
                        background: 'var(--accent-bg)',
                        borderRadius: 'var(--radius)',
                        marginBottom: '16px',
                        fontSize: '13px',
                        color: 'var(--accent)'
                    }}>
                        {filtered.length} resultado(s){searchTerm ? ` para "${searchTerm}"` : ''}
                    </div>
                )}

                {filtered.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon"><Icon name="clipboard" size={48} /></div>
                        <h3>{searchTerm ? 'Nenhuma movimentacao encontrada' : 'Nenhuma movimentacao'}</h3>
                        {searchTerm && <p>Tente buscar por outro termo</p>}
                    </div>
                ) : (
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Data</th>
                                    <th>Tipo</th>
                                    <th>Produto</th>
                                    <th>Qtd</th>
                                    <th>Local</th>
                                    <th>Info</th>
                                    <th>Usuario</th>
                                    {isStockAdmin && <th style={{width: '80px'}}></th>}
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.slice(0, 100).map((m, i) => (
                                    <tr key={m.id || i}>
                                        <td style={{whiteSpace: 'nowrap'}}>
                                            {new Date(m.date).toLocaleDateString('pt-BR')}
                                            <div style={{fontSize: '11px', color: 'var(--text-muted)'}}>
                                                {new Date(m.date).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})}
                                            </div>
                                        </td>
                                        <td>
                                            <span className={`badge ${m.movType === 'entry' ? 'badge-success' : 'badge-danger'}`}>
                                                {m.movType === 'entry' ? '\u2193 Entrada' : '\u2191 Saida'}
                                            </span>
                                        </td>
                                        <td style={{maxWidth: '300px'}}>
                                            <div style={{fontWeight: '500'}}>{getProductName(m.sku)}</div>
                                            <div style={{fontSize: '10px', color: 'var(--text-muted)'}}>SKU: {m.sku}</div>
                                        </td>
                                        <td style={{fontWeight: '600'}}>{m.quantity}</td>
                                        <td style={{fontSize: '12px'}}>
                                            {m.localEntrada && (
                                                <span style={{
                                                    background: 'var(--accent-bg)',
                                                    color: 'var(--accent)',
                                                    padding: '2px 8px',
                                                    borderRadius: '12px',
                                                    fontSize: '11px'
                                                }}>
                                                    {m.localEntrada}
                                                </span>
                                            )}
                                        </td>
                                        <td style={{fontSize: '12px', color: 'var(--text-muted)'}}>
                                            {m.supplier || m.client || '-'}
                                            {m.nf && <div style={{marginTop: '2px'}}><strong>NF: {m.nf}</strong></div>}
                                            {m.nfOrigem && <div style={{marginTop: '2px', color: 'var(--warning)'}}>Saida da NF: {m.nfOrigem}</div>}
                                        </td>
                                        <td style={{fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap'}}>
                                            {formatUserEmail(m.userId)}
                                        </td>
                                        {isStockAdmin && (<td>
                                            <div style={{display: 'flex', gap: '4px'}}>
                                                <button className="btn btn-icon btn-secondary" onClick={() => handleEdit(m)} title="Editar" style={{padding: '4px 6px'}}>
                                                    <Icon name="edit" size={13} />
                                                </button>
                                                <button className="btn btn-icon btn-secondary" onClick={() => setDeleteConfirm(m)} title="Excluir" style={{padding: '4px 6px'}}>
                                                    <Icon name="delete" size={13} />
                                                </button>
                                            </div>
                                        </td>)}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
