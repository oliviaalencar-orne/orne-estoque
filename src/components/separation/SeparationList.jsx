/**
 * SeparationList.jsx — List of separations with filters, status actions, and share
 */
import React, { useState, useMemo, useCallback } from 'react';
import { Icon } from '@/utils/icons';
import { buildSeparationMessage, openWhatsAppWithMessage, copyToClipboard } from '@/utils/separationMessage';

const STATUS_CONFIG = {
  pendente: { label: 'Pendente', color: '#6b7280', bg: '#f3f4f6' },
  separado: { label: 'Separado', color: '#3b82f6', bg: '#dbeafe' },
  embalado: { label: 'Embalado', color: '#f59e0b', bg: '#fef3c7' },
  despachado: { label: 'Despachado', color: '#10b981', bg: '#d1fae5' },
};

const NEXT_STATUS = {
  pendente: 'separado',
  separado: 'embalado',
};

export default function SeparationList({
  separations, onUpdate, onDelete, onEdit, onSendToDispatch,
  hubs, showHubBadge
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loadingId, setLoadingId] = useState(null);
  const [successId, setSuccessId] = useState(null);
  const [shareMenuId, setShareMenuId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

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
    if (loadingId) return;
    setLoadingId(sep.id);
    try {
      if (sep.status === 'embalado') {
        await onSendToDispatch(sep);
      } else {
        const nextStatus = NEXT_STATUS[sep.status];
        if (nextStatus) {
          await onUpdate(sep.id, { status: nextStatus });
          setSuccessId(sep.id);
          setTimeout(() => setSuccessId(null), 2000);
        }
      }
    } catch (err) {
      console.error('Erro ao atualizar status:', err);
      alert('Erro ao atualizar status: ' + (err.message || err));
    } finally {
      setLoadingId(null);
    }
  };

  const getActionButton = (sep) => {
    if (sep.status === 'pendente') return { label: 'Marcar Separado', icon: 'check' };
    if (sep.status === 'separado') return { label: 'Marcar Embalado', icon: 'package' };
    if (sep.status === 'embalado') return { label: 'Enviar p/ Despacho', icon: 'shipping' };
    return null;
  };

  // Build message for individual separation
  const buildIndividualMessage = useCallback((sep) => {
    const hub = (hubs || []).find(h => h.id === sep.hubId);
    return buildSeparationMessage({
      hubName: hub?.name || '-',
      separations: [sep],
    });
  }, [hubs]);

  const handleWhatsAppIndividual = useCallback((sep) => {
    const msg = buildIndividualMessage(sep);
    openWhatsAppWithMessage(msg);
    setShareMenuId(null);
  }, [buildIndividualMessage]);

  const handleCopyIndividual = useCallback(async (sep) => {
    const msg = buildIndividualMessage(sep);
    await copyToClipboard(msg);
    setCopiedId(sep.id);
    setTimeout(() => setCopiedId(null), 2000);
    setShareMenuId(null);
  }, [buildIndividualMessage]);

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
            const isLoading = loadingId === sep.id;
            const isSuccess = successId === sep.id;
            const isCopied = copiedId === sep.id;
            return (
              <div key={sep.id} className="card" style={{
                padding: '16px',
                borderLeft: isSuccess ? '3px solid var(--success)' : undefined,
                transition: 'border-left 0.3s',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      {sep.nfNumero && (
                        <span style={{ fontWeight: 600, fontSize: '14px' }}>NF {sep.nfNumero}</span>
                      )}
                      <span className="badge" style={{ background: cfg.bg, color: cfg.color, fontSize: '11px' }}>
                        {cfg.label}
                      </span>
                      {showHubBadge && sep.hubId && (() => {
                        const hub = (hubs || []).find(h => h.id === sep.hubId);
                        return hub ? (
                          <span className="badge" style={{ background: '#e0e7ff', color: '#3730a3', fontSize: '10px' }}>
                            {hub.name}
                          </span>
                        ) : null;
                      })()}
                      {isSuccess && (
                        <span style={{ color: 'var(--success)', fontSize: '12px', fontWeight: 500 }}>
                          ✓ Atualizado
                        </span>
                      )}
                      {isCopied && (
                        <span style={{ color: 'var(--success)', fontSize: '12px', fontWeight: 500 }}>
                          ✓ Copiado!
                        </span>
                      )}
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
                        style={{ fontSize: '12px', padding: '6px 12px', opacity: isLoading ? 0.7 : 1 }}
                        onClick={() => handleStatusAdvance(sep)}
                        disabled={isLoading}
                      >
                        {isLoading ? 'Atualizando...' : (
                          <><Icon name={action.icon} size={14} /> {action.label}</>
                        )}
                      </button>
                    )}
                    {/* Individual share button */}
                    {sep.status !== 'despachado' && (
                      <div style={{ position: 'relative' }}>
                        <button
                          className="btn btn-secondary"
                          style={{
                            fontSize: '12px',
                            padding: '6px 10px',
                            color: '#25D366',
                            borderColor: '#25D366',
                          }}
                          onClick={() => setShareMenuId(shareMenuId === sep.id ? null : sep.id)}
                          title="Compartilhar separação"
                          disabled={isLoading}
                        >
                          <Icon name="whatsapp" size={14} style={{ color: '#25D366' }} />
                        </button>

                        {/* Individual share dropdown */}
                        {shareMenuId === sep.id && (
                          <>
                            <div
                              style={{ position: 'fixed', inset: 0, zIndex: 998 }}
                              onClick={() => setShareMenuId(null)}
                            />
                            <div style={{
                              position: 'absolute',
                              top: 'calc(100% + 4px)',
                              right: 0,
                              zIndex: 999,
                              background: '#fff',
                              border: '1px solid var(--border-color)',
                              borderRadius: '8px',
                              boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                              padding: '4px',
                              minWidth: '190px',
                            }}>
                              <button
                                onClick={() => handleWhatsAppIndividual(sep)}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  width: '100%',
                                  padding: '8px 12px',
                                  border: 'none',
                                  background: 'transparent',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  fontSize: '12px',
                                  fontWeight: 500,
                                  color: '#25D366',
                                  textAlign: 'left',
                                  transition: 'background 0.12s',
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = '#f0fdf4'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                              >
                                <Icon name="whatsapp" size={14} style={{ color: '#25D366' }} />
                                Enviar via WhatsApp
                              </button>
                              <button
                                onClick={() => handleCopyIndividual(sep)}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  width: '100%',
                                  padding: '8px 12px',
                                  border: 'none',
                                  background: 'transparent',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  fontSize: '12px',
                                  fontWeight: 500,
                                  color: 'var(--text-primary)',
                                  textAlign: 'left',
                                  transition: 'background 0.12s',
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-secondary)'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                              >
                                <Icon name="copy" size={14} />
                                Copiar mensagem
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                    {sep.status !== 'despachado' && (
                      <>
                        <button
                          className="btn btn-secondary"
                          style={{ fontSize: '12px', padding: '6px 10px' }}
                          onClick={() => onEdit(sep)}
                          title="Editar"
                          disabled={isLoading}
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
                          disabled={isLoading}
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
