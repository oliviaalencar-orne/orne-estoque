/**
 * SeparationList.jsx — List of separations with filters and status actions
 */
import React, { useState, useMemo } from 'react';
import { Icon } from '@/utils/icons';

const STATUS_CONFIG = {
  pendente: { label: 'Pendente', color: '#6b7280', bg: '#f3f4f6' },
  separado: { label: 'Separado', color: '#3b82f6', bg: '#dbeafe' },
  embalado: { label: 'Embalado', color: '#f59e0b', bg: '#fef3c7' },
  despachado: { label: 'Despachado', color: '#10b981', bg: '#d1fae5' },
};

export default function SeparationList({
  separations, onUpdate, onDelete, onEdit, onSendToDispatch
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  const filtered = useMemo(() => {
    let items = [...separations];
    if (statusFilter !== 'all') {
      items = items.filter(s => s.status === statusFilter);
    }
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      items = items.filter(s =>
        (s.nfNumero || '').toLowerCase().includes(q) ||
        (s.cliente || '').toLowerCase().includes(q) ||
        (s.destino || '').toLowerCase().includes(q)
      );
    }
    return items.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [separations, searchTerm, statusFilter]);

  const counts = useMemo(() => {
    const c = { all: separations.length, pendente: 0, separado: 0, embalado: 0, despachado: 0 };
    separations.forEach(s => { if (c[s.status] !== undefined) c[s.status]++; });
    return c;
  }, [separations]);

  const handleStatusAdvance = async (sep) => {
    if (sep.status === 'pendente') await onUpdate(sep.id, { status: 'separado' });
    else if (sep.status === 'separado') await onUpdate(sep.id, { status: 'embalado' });
    else if (sep.status === 'embalado') onSendToDispatch(sep);
  };

  const getActionButton = (sep) => {
    if (sep.status === 'pendente') return { label: 'Marcar Separado', icon: 'check' };
    if (sep.status === 'separado') return { label: 'Marcar Embalado', icon: 'package' };
    if (sep.status === 'embalado') return { label: 'Enviar p/ Despacho', icon: 'shipping' };
    return null;
  };

  return (
    <div>
      {/* Search + Filters */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div style={{ position: 'relative', marginBottom: '12px' }}>
          <Icon name="search" size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            className="form-input search-input"
            placeholder="Buscar por NF, cliente ou destino..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ paddingLeft: '32px' }}
          />
          {searchTerm && (
            <button className="search-clear" onClick={() => setSearchTerm('')}>&times;</button>
          )}
        </div>
        <div className="filter-tabs">
          {[
            { key: 'all', label: `Todos (${counts.all})` },
            { key: 'pendente', label: `Pendente (${counts.pendente})` },
            { key: 'separado', label: `Separado (${counts.separado})` },
            { key: 'embalado', label: `Embalado (${counts.embalado})` },
            { key: 'despachado', label: `Despachado (${counts.despachado})` },
          ].map(f => (
            <button
              key={f.key}
              className={`filter-tab ${statusFilter === f.key ? 'active' : ''}`}
              onClick={() => setStatusFilter(f.key)}
            >{f.label}</button>
          ))}
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
          Nenhuma separação encontrada
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filtered.map(sep => {
            const cfg = STATUS_CONFIG[sep.status] || STATUS_CONFIG.pendente;
            const action = getActionButton(sep);
            const prodCount = (sep.produtos || []).length;
            return (
              <div key={sep.id} className="card" style={{ padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      {sep.nfNumero && (
                        <span style={{ fontWeight: 600, fontSize: '14px' }}>NF {sep.nfNumero}</span>
                      )}
                      <span className="badge" style={{ background: cfg.bg, color: cfg.color, fontSize: '11px' }}>
                        {cfg.label}
                      </span>
                    </div>
                    {sep.cliente && (
                      <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '2px' }}>
                        {sep.cliente}
                      </div>
                    )}
                    {sep.destino && (
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {sep.destino}
                      </div>
                    )}
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      {prodCount} produto{prodCount !== 1 ? 's' : ''} &middot; {formatDate(sep.date)}
                    </div>
                    {sep.observacoes && (
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', fontStyle: 'italic' }}>
                        {sep.observacoes.length > 80 ? sep.observacoes.slice(0, 80) + '...' : sep.observacoes}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {action && (
                      <button
                        className="btn btn-primary"
                        style={{ fontSize: '12px', padding: '6px 12px' }}
                        onClick={() => handleStatusAdvance(sep)}
                      >
                        <Icon name={action.icon} size={14} /> {action.label}
                      </button>
                    )}
                    {sep.status !== 'despachado' && (
                      <>
                        <button
                          className="btn btn-secondary"
                          style={{ fontSize: '12px', padding: '6px 10px' }}
                          onClick={() => onEdit(sep)}
                          title="Editar"
                        >
                          <Icon name="edit" size={14} />
                        </button>
                        <button
                          className="btn btn-secondary"
                          style={{ fontSize: '12px', padding: '6px 10px', color: 'var(--danger)' }}
                          onClick={() => {
                            if (confirm('Excluir esta separação?')) onDelete(sep.id);
                          }}
                          title="Excluir"
                        >
                          <Icon name="delete" size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
