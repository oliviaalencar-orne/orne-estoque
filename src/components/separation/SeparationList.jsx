/**
 * SeparationList.jsx — List of separations with filters, batch selection, status actions, and share
 */
import React, { useState, useMemo, useCallback, useRef } from 'react';
import { Icon } from '@/utils/icons';
import { buildSeparationMessage, openWhatsAppWithMessage, copyToClipboard } from '@/utils/separationMessage';
import { useEscapeDeselect } from '@/hooks/useEscapeDeselect';
import { classificarTransporte } from '@/utils/transportadora';
import { formatHubName, hubColor } from '@/utils/hubs';

// Paleta aplicada (20% opacity bg, cor pura no texto)
const STATUS_CONFIG = {
  pendente:   { label: 'Pendente',   color: '#6B7280', bg: 'rgba(180,180,180,0.20)' },
  separado:   { label: 'Separado',   color: '#004aad', bg: 'rgba(0,74,173,0.15)' },
  embalado:   { label: 'Embalado',   color: '#8c52ff', bg: 'rgba(140,82,255,0.15)' },
  despachado: { label: 'Despachado', color: '#39845f', bg: 'rgba(57,132,95,0.15)' },
};

// Equipe sees simplified labels: pendente/separado → "Em separação", embalado → "Embalando"
const EQUIPE_STATUS_CONFIG = {
  pendente:   { label: 'Em separação', color: '#004aad', bg: 'rgba(0,74,173,0.15)' },
  separado:   { label: 'Em separação', color: '#004aad', bg: 'rgba(0,74,173,0.15)' },
  embalado:   { label: 'Embalando',    color: '#8c52ff', bg: 'rgba(140,82,255,0.15)' },
  despachado: { label: 'Despachado',   color: '#39845f', bg: 'rgba(57,132,95,0.15)' },
};

// Ícones e cores por tipo de transporte
const TRANSPORT_ICON = { local: 'car', loggi: 'truck', correios: 'mail', outras: 'truck' };

const NEXT_STATUS = {
  pendente: 'separado',
  separado: 'embalado',
};

const ALL_STATUSES = ['pendente', 'separado', 'embalado', 'despachado'];

export default function SeparationList({
  separations, onUpdate, onDelete, onEdit, onSendToDispatch,
  onBatchStatusChange, onBatchDispatch, onGerarLinkEntregador,
  onReverter, onBatchReverter,
  hubs, showHubBadge, isStockAdmin, isOperador = false
}) {
  const canEditSep = isStockAdmin || isOperador;
  const canDeleteSep = isStockAdmin;
  const canCreateSep = isStockAdmin;
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [filtroTransporte, setFiltroTransporte] = useState('all'); // all|local|loggi|correios|outras
  const [showEntregadorModal, setShowEntregadorModal] = useState(false);
  const [entregadorNome, setEntregadorNome] = useState('');
  const [entregadorTelefone, setEntregadorTelefone] = useState('');
  const [gerandoLink, setGerandoLink] = useState(false);
  const [loadingId, setLoadingId] = useState(null);
  const [successId, setSuccessId] = useState(null);
  const [shareMenuId, setShareMenuId] = useState(null);
  const [shareMenuPos, setShareMenuPos] = useState({ top: 0, right: 0 });
  const [copiedId, setCopiedId] = useState(null);
  const [batchEntregaLocal, setBatchEntregaLocal] = useState(false);
  const [revertMenuId, setRevertMenuId] = useState(null);
  const [revertMenuPos, setRevertMenuPos] = useState({ top: 0, right: 0 });
  const [revertConfirm, setRevertConfirm] = useState(null); // { sep, targetStatus } | { batch, targetStatus, seps }
  const [revertLoading, setRevertLoading] = useState(false);
  const [showBatchRevertMenu, setShowBatchRevertMenu] = useState(false);

  const shareMenuSepRef = useRef(null);
  const revertMenuSepRef = useRef(null);

  // Use equipe labels when not admin/operador
  const displayConfig = (isStockAdmin || isOperador) ? STATUS_CONFIG : EQUIPE_STATUS_CONFIG;

  // Batch selection state (admin/operador)
  const [selectedIds, setSelectedIds] = useState(new Set());

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  const filtered = useMemo(() => {
    let items = [...separations];
    if (statusFilter !== 'all') {
      if (!isStockAdmin && !isOperador && statusFilter === 'em_separacao') {
        // Equipe merged filter: "Em separação" = pendente + separado
        items = items.filter(s => s.status === 'pendente' || s.status === 'separado');
      } else {
        items = items.filter(s => s.status === statusFilter);
      }
    }
    if (filtroTransporte !== 'all') {
      items = items.filter(s => classificarTransporte(s) === filtroTransporte);
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
  }, [separations, searchTerm, statusFilter, filtroTransporte, isStockAdmin, isOperador]);

  // Counts por tipo de transporte (respeitando statusFilter atual)
  const transporteCounts = useMemo(() => {
    let base = [...separations];
    if (statusFilter !== 'all') {
      if (!isStockAdmin && !isOperador && statusFilter === 'em_separacao') {
        base = base.filter(s => s.status === 'pendente' || s.status === 'separado');
      } else {
        base = base.filter(s => s.status === statusFilter);
      }
    }
    const c = { all: base.length, local: 0, loggi: 0, correios: 0, outras: 0, sem_transporte: 0 };
    base.forEach(s => {
      const tipo = classificarTransporte(s);
      if (c[tipo] !== undefined) c[tipo]++;
    });
    return c;
  }, [separations, statusFilter, isStockAdmin, isOperador]);

  const counts = useMemo(() => {
    const c = { all: separations.length, pendente: 0, separado: 0, embalado: 0, despachado: 0 };
    separations.forEach(s => { if (c[s.status] !== undefined) c[s.status]++; });
    return c;
  }, [separations]);

  // Only non-despachado items in the current filtered list are selectable
  const selectableItems = useMemo(() =>
    filtered.filter(s => s.status !== 'despachado'),
  [filtered]);

  // Clean up selectedIds when filtered list changes (remove stale IDs)
  const activeSelectedIds = useMemo(() => {
    const filteredIdSet = new Set(selectableItems.map(s => s.id));
    return new Set([...selectedIds].filter(id => filteredIdSet.has(id)));
  }, [selectedIds, selectableItems]);

  const selectedCount = activeSelectedIds.size;
  const allSelected = selectableItems.length > 0 && selectedCount === selectableItems.length;

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      // Deselect all visible
      setSelectedIds(prev => {
        const next = new Set(prev);
        selectableItems.forEach(s => next.delete(s.id));
        return next;
      });
    } else {
      // Select all visible
      setSelectedIds(prev => {
        const next = new Set(prev);
        selectableItems.forEach(s => next.add(s.id));
        return next;
      });
    }
  };

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  // ESC limpa seleção múltipla (ignora se modal aberto ou input focado)
  useEscapeDeselect(clearSelection);

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

  const openShareMenu = (sepId, btnEl) => {
    if (shareMenuId === sepId) {
      setShareMenuId(null);
      return;
    }
    const rect = btnEl.getBoundingClientRect();
    setShareMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    shareMenuSepRef.current = separations.find(s => s.id === sepId) || null;
    setShareMenuId(sepId);
  };

  // Possible target statuses to revert to (anything before current status)
  const getRevertTargets = (sep) => {
    const idx = ALL_STATUSES.indexOf(sep.status);
    if (idx <= 0) return [];
    return ALL_STATUSES.slice(0, idx);
  };

  const openRevertMenu = (sepId, btnEl) => {
    if (revertMenuId === sepId) {
      setRevertMenuId(null);
      return;
    }
    const rect = btnEl.getBoundingClientRect();
    setRevertMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    revertMenuSepRef.current = separations.find(s => s.id === sepId) || null;
    setRevertMenuId(sepId);
  };

  const askRevertConfirmation = (sep, targetStatus) => {
    setRevertMenuId(null);
    setRevertConfirm({ mode: 'single', sep, targetStatus });
  };

  const askBatchRevertConfirmation = (targetStatus) => {
    setShowBatchRevertMenu(false);
    setRevertConfirm({ mode: 'batch', seps: selectedSeparations, targetStatus });
  };

  const handleConfirmRevert = useCallback(async () => {
    if (!revertConfirm) return;
    setRevertLoading(true);
    try {
      if (revertConfirm.mode === 'single') {
        if (typeof onReverter !== 'function') {
          alert('Função de reversão não disponível.');
          return;
        }
        const result = await onReverter(revertConfirm.sep, revertConfirm.targetStatus);
        if (result?.ok === false && result.blockers?.length) {
          alert(
            `Não é possível reverter a NF ${result.nf || revertConfirm.sep.nfNumero}:\n\n` +
            result.blockers.map(b => `• ${b}`).join('\n') +
            `\n\nLimpe esses dados antes de reverter (ex: remover código de rastreio, comprovantes, ou link de entrega).`
          );
        }
      } else if (revertConfirm.mode === 'batch') {
        if (typeof onBatchReverter !== 'function') {
          alert('Função de reversão em lote não disponível.');
          return;
        }
        await onBatchReverter(revertConfirm.seps, revertConfirm.targetStatus, clearSelection);
      }
      setRevertConfirm(null);
    } catch (err) {
      console.error('Erro ao reverter:', err);
      alert('Erro ao reverter: ' + (err.message || err));
    } finally {
      setRevertLoading(false);
    }
  }, [revertConfirm, onReverter, onBatchReverter, clearSelection]);

  // Get the selected separation objects
  const selectedSeparations = useMemo(() =>
    separations.filter(s => activeSelectedIds.has(s.id)),
  [separations, activeSelectedIds]);

  // Tipo de seleção: 'todas_local' | 'misto' | 'sem_local'
  const tipoSelecao = useMemo(() => {
    if (selectedSeparations.length === 0) return 'sem_local';
    const tipos = selectedSeparations.map(classificarTransporte);
    const todasLocal = tipos.every(t => t === 'local');
    if (todasLocal) return 'todas_local';
    const algumaLocal = tipos.some(t => t === 'local');
    return algumaLocal ? 'misto' : 'sem_local';
  }, [selectedSeparations]);

  const handleAbrirModalEntregador = useCallback(() => {
    if (tipoSelecao !== 'todas_local') {
      alert('Para gerar link de entregador, selecione apenas separações de Entrega Local.');
      return;
    }
    setEntregadorNome('');
    setEntregadorTelefone('');
    setShowEntregadorModal(true);
  }, [tipoSelecao]);

  const handleConfirmarGerarLink = useCallback(async () => {
    if (!entregadorNome.trim()) { alert('Informe o nome do entregador.'); return; }
    if (!entregadorTelefone.trim()) { alert('Informe o telefone do entregador.'); return; }
    if (typeof onGerarLinkEntregador !== 'function') {
      alert('Função de geração de link não disponível.');
      return;
    }
    setGerandoLink(true);
    try {
      await onGerarLinkEntregador(selectedSeparations, {
        nome: entregadorNome.trim(),
        telefone: entregadorTelefone.trim(),
      }, clearSelection);
      setShowEntregadorModal(false);
    } catch (err) {
      console.error('Erro ao gerar link entregador:', err);
      alert('Erro ao gerar link: ' + (err.message || err));
    } finally {
      setGerandoLink(false);
    }
  }, [entregadorNome, entregadorTelefone, onGerarLinkEntregador, selectedSeparations, clearSelection]);

  // Build filter tabs based on role
  const filterTabs = useMemo(() => {
    if (isStockAdmin || isOperador) {
      return [
        { key: 'all', label: `Todos (${counts.all})` },
        { key: 'pendente', label: `Pendente (${counts.pendente})` },
        { key: 'separado', label: `Separado (${counts.separado})` },
        { key: 'embalado', label: `Embalado (${counts.embalado})` },
        { key: 'despachado', label: `Despachado (${counts.despachado})` },
      ];
    }
    // Equipe: merge pendente+separado as "Em separação"
    return [
      { key: 'all', label: `Todos (${counts.all})` },
      { key: 'em_separacao', label: `Em separação (${counts.pendente + counts.separado})` },
      { key: 'embalado', label: `Embalando (${counts.embalado})` },
      { key: 'despachado', label: `Despachado (${counts.despachado})` },
    ];
  }, [isStockAdmin, isOperador, counts]);

  return (
    <div>
      {/* Status filters + search — mesma linha */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div className="filter-tabs" style={{ marginBottom: 0 }}>
            {filterTabs.map(f => (
              <button
                key={f.key}
                className={`filter-tab ${statusFilter === f.key ? 'active' : ''}`}
                onClick={() => setStatusFilter(f.key)}
              >{f.label}</button>
            ))}
          </div>
          <div style={{ position: 'relative', flex: '1 1 260px', minWidth: '200px', maxWidth: '420px' }}>
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
        </div>

        {/* Transport filter pills (outlined) + Selecionar Todos — terceira linha */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-color)' }}>
          {canEditSep && (() => {
            const TIPOS = [
              { key: 'local',    label: 'Local',    icon: 'car',   color: '#39845f', fill: 'rgba(57,132,95,0.15)' },
              { key: 'loggi',    label: 'Loggi',    icon: 'truck', color: '#8c52ff', fill: 'rgba(140,82,255,0.15)' },
              { key: 'correios', label: 'Correios', icon: 'mail',  color: '#004aad', fill: 'rgba(0,74,173,0.15)' },
              { key: 'outras',   label: 'Outras',   icon: 'truck', color: '#6B7280', fill: 'rgba(180,180,180,0.25)' },
            ];
            return (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {TIPOS.map(t => {
                  const count = transporteCounts[t.key] || 0;
                  if (count === 0) return null;
                  const active = filtroTransporte === t.key;
                  return (
                    <button
                      key={t.key}
                      onClick={() => setFiltroTransporte(active ? 'all' : t.key)}
                      title={active ? 'Clique para remover filtro' : `Filtrar por ${t.label}`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '13px',
                        fontWeight: 500,
                        padding: '8px 16px',
                        borderRadius: '8px',
                        border: `1px solid ${t.color}`,
                        background: active ? t.fill : 'transparent',
                        color: t.color,
                        cursor: 'pointer',
                        transition: 'background 0.15s',
                      }}
                    >
                      <Icon name={t.icon} size={14} />
                      {t.label} <span style={{ opacity: 0.7 }}>({String(count).padStart(2, '0')})</span>
                    </button>
                  );
                })}
              </div>
            );
          })()}
          {/* Select All checkbox — admin/operador */}
          {canEditSep && selectableItems.length > 0 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
              Selecionar Todos
            </label>
          )}
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
            const cfg = displayConfig[sep.status] || displayConfig.pendente;
            const action = getActionButton(sep);
            const prodCount = (sep.produtos || []).length;
            const isLoading = loadingId === sep.id;
            const isSuccess = successId === sep.id;
            const isCopied = copiedId === sep.id;
            const isSelectable = sep.status !== 'despachado';
            const isSelected = activeSelectedIds.has(sep.id);
            return (
              <div key={sep.id} className="card" style={{
                padding: '16px',
                borderLeft: isSuccess ? '3px solid var(--success)' : (canEditSep && isSelected) ? '3px solid var(--primary)' : undefined,
                background: (canEditSep && isSelected) ? 'var(--bg-secondary)' : undefined,
                transition: 'border-left 0.3s, background 0.2s',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                  {/* Checkbox — admin/operador */}
                  {canEditSep && isSelectable && (
                    <div style={{ display: 'flex', alignItems: 'center', paddingTop: '2px' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(sep.id)}
                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                      />
                    </div>
                  )}
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
                        if (!hub) return null;
                        const palette = hubColor(hub.name);
                        return (
                          <span className="badge" style={{
                            background: palette.bg, color: palette.color,
                            fontSize: '11px', fontWeight: 600,
                          }}>
                            {formatHubName(hub.name)}
                          </span>
                        );
                      })()}
                      {sep.transportadora && (() => {
                        const tipo = classificarTransporte(sep);
                        const palette = {
                          local:    { color: '#39845f', bg: 'rgba(57,132,95,0.20)' },
                          loggi:    { color: '#8c52ff', bg: 'rgba(140,82,255,0.20)' },
                          correios: { color: '#004aad', bg: 'rgba(0,74,173,0.20)' },
                        }[tipo] || { color: '#6B7280', bg: 'rgba(180,180,180,0.25)' };
                        return (
                          <span className="badge" style={{
                            background: palette.bg, color: palette.color,
                            fontSize: '11px', fontWeight: 600,
                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                          }}>
                            <Icon name={TRANSPORT_ICON[tipo] || 'truck'} size={12} />
                            {tipo === 'local' ? 'Entrega Local' : sep.transportadora}
                          </span>
                        );
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
                  {/* Action buttons — admin/operador can edit, only admin can delete */}
                  {canEditSep && (
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
                        <button
                          className="btn btn-secondary"
                          style={{
                            fontSize: '12px',
                            padding: '6px 10px',
                            color: '#25D366',
                            borderColor: '#25D366',
                          }}
                          onClick={(e) => openShareMenu(sep.id, e.currentTarget)}
                          title="Compartilhar separação"
                          disabled={isLoading}
                        >
                          <Icon name="whatsapp" size={14} style={{ color: '#25D366' }} />
                        </button>
                      )}
                      {/* Revert button — admin only, available for any non-pendente */}
                      {isStockAdmin && sep.status !== 'pendente' && getRevertTargets(sep).length > 0 && (
                        <button
                          className="btn btn-secondary"
                          style={{ fontSize: '12px', padding: '6px 10px', color: '#b45309', borderColor: '#fcd34d' }}
                          onClick={(e) => openRevertMenu(sep.id, e.currentTarget)}
                          title="Reverter status"
                          disabled={isLoading}
                        >
                          <Icon name="refresh" size={14} /> Reverter
                        </button>
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
                          {canDeleteSep && (
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
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Floating batch action bar — admin/operador ── */}
      {canEditSep && selectedCount > 0 && (
        <div style={{
          position: 'fixed',
          bottom: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#1e293b',
          color: '#fff',
          borderRadius: '12px',
          padding: '12px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          zIndex: 9990,
          flexWrap: 'wrap',
          justifyContent: 'center',
          maxWidth: '90vw',
        }}>
          <span style={{ fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap' }}>
            {selectedCount} selecionado{selectedCount !== 1 ? 's' : ''}
          </span>
          <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.2)' }} />
          <BatchStatusDropdown
            onChangeStatus={(newStatus) => {
              if (onBatchStatusChange) {
                onBatchStatusChange(selectedSeparations, newStatus, clearSelection);
              }
            }}
          />
          <button
            className="btn"
            style={{
              fontSize: '12px',
              padding: '6px 14px',
              background: '#10b981',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
            onClick={() => {
              if (onBatchDispatch) {
                onBatchDispatch(selectedSeparations, clearSelection, { entregaLocal: batchEntregaLocal });
              }
              setBatchEntregaLocal(false);
            }}
          >
            <Icon name="shipping" size={14} /> {batchEntregaLocal ? 'Enviar como Entrega Local' : 'Enviar para Despacho'}
          </button>
          {tipoSelecao === 'todas_local' && (
            <button
              className="btn"
              style={{
                fontSize: '12px',
                padding: '6px 14px',
                background: '#25D366',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
              onClick={handleAbrirModalEntregador}
              title="Gerar link de entrega para entregador"
            >
              <Icon name="whatsapp" size={14} /> Gerar Link Entregador
            </button>
          )}
          {tipoSelecao === 'misto' && (
            <span style={{
              fontSize: '11px',
              color: '#fbbf24',
              background: 'rgba(251,191,36,0.15)',
              padding: '4px 10px',
              borderRadius: '6px',
              border: '1px solid rgba(251,191,36,0.4)',
              whiteSpace: 'nowrap',
            }}>
              ⚠ Misto: link só p/ 100% Local
            </span>
          )}
          <label style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            color: '#fff', fontSize: '11px', cursor: 'pointer',
            background: batchEntregaLocal ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.1)',
            padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.3)',
            whiteSpace: 'nowrap',
          }}>
            <input
              type="checkbox"
              checked={batchEntregaLocal}
              onChange={(e) => setBatchEntregaLocal(e.target.checked)}
              style={{width: '14px', height: '14px', accentColor: '#10b981'}}
            />
            📦 Entrega Local
          </label>
          {isStockAdmin && selectedSeparations.some(s => s.status !== 'pendente') && (
            <button
              className="btn"
              style={{
                fontSize: '12px',
                padding: '6px 14px',
                background: '#b45309',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
              onClick={() => setShowBatchRevertMenu(true)}
              title="Reverter status das selecionadas"
            >
              <Icon name="refresh" size={14} /> Reverter
            </button>
          )}
          <button
            style={{
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.3)',
              color: '#fff',
              borderRadius: '6px',
              padding: '4px 10px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
            onClick={clearSelection}
          >
            Limpar
          </button>
        </div>
      )}

      {/* Modal: nome/telefone do entregador */}
      {showEntregadorModal && (
        <div
          className="modal-overlay"
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000,
          }}
          onClick={() => !gerandoLink && setShowEntregadorModal(false)}
        >
          <div
            role="dialog"
            style={{
              background: '#fff', borderRadius: '12px', padding: '24px',
              maxWidth: '420px', width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 4px', fontSize: '16px', fontWeight: 600 }}>
              Gerar Link para Entregador
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: '12px', color: 'var(--text-muted)' }}>
              {selectedSeparations.length} separação(ões) de Entrega Local serão despachadas e vinculadas ao link.
            </p>
            <div style={{ marginBottom: '12px' }}>
              <label className="form-label" style={{ fontSize: '12px' }}>Nome do entregador</label>
              <input
                type="text"
                className="form-input"
                value={entregadorNome}
                onChange={e => setEntregadorNome(e.target.value)}
                placeholder="Ex: João Silva"
                disabled={gerandoLink}
                autoFocus
              />
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label className="form-label" style={{ fontSize: '12px' }}>Telefone (WhatsApp)</label>
              <input
                type="tel"
                className="form-input"
                value={entregadorTelefone}
                onChange={e => setEntregadorTelefone(e.target.value)}
                placeholder="Ex: 11999998888"
                disabled={gerandoLink}
              />
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setShowEntregadorModal(false)}
                disabled={gerandoLink}
              >Cancelar</button>
              <button
                className="btn btn-primary"
                onClick={handleConfirmarGerarLink}
                disabled={gerandoLink}
              >
                {gerandoLink ? 'Gerando...' : 'Gerar e Abrir WhatsApp'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Individual share dropdown — fixed, outside any container */}
      {canEditSep && shareMenuId && shareMenuSepRef.current && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
            onClick={() => setShareMenuId(null)}
          />
          <div style={{
            position: 'fixed',
            top: shareMenuPos.top,
            right: shareMenuPos.right,
            zIndex: 9999,
            background: '#fff',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
            padding: '4px',
            minWidth: '190px',
          }}>
            <button
              onClick={() => handleWhatsAppIndividual(shareMenuSepRef.current)}
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
              onClick={() => handleCopyIndividual(shareMenuSepRef.current)}
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

      {/* Per-card revert dropdown — admin only */}
      {isStockAdmin && revertMenuId && revertMenuSepRef.current && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
            onClick={() => setRevertMenuId(null)}
          />
          <div style={{
            position: 'fixed',
            top: revertMenuPos.top,
            right: revertMenuPos.right,
            zIndex: 9999,
            background: '#fff',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
            padding: '4px',
            minWidth: '200px',
          }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '6px 12px 4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
              Reverter para:
            </div>
            {getRevertTargets(revertMenuSepRef.current).map(st => {
              const cfg = STATUS_CONFIG[st];
              return (
                <button
                  key={st}
                  onClick={() => askRevertConfirmation(revertMenuSepRef.current, st)}
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
                    textAlign: 'left',
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-secondary)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <span className="badge" style={{ background: cfg.bg, color: cfg.color, fontSize: '10px' }}>
                    {cfg.label}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Revert confirmation modal */}
      {revertConfirm && (
        <div
          className="modal-overlay"
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10001,
          }}
          onClick={() => !revertLoading && setRevertConfirm(null)}
        >
          <div
            role="dialog"
            style={{
              background: '#fff', borderRadius: '12px', padding: '24px',
              maxWidth: '480px', width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: 600 }}>
              Confirmar Reversão de Status
            </h3>
            {(() => {
              const targetCfg = STATUS_CONFIG[revertConfirm.targetStatus] || STATUS_CONFIG.pendente;
              const isFromDispatched = revertConfirm.mode === 'single'
                ? revertConfirm.sep.status === 'despachado'
                : revertConfirm.seps.some(s => s.status === 'despachado');
              return (
                <>
                  <p style={{ margin: '0 0 12px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                    {revertConfirm.mode === 'single'
                      ? <>Reverter a NF <strong>{revertConfirm.sep.nfNumero}</strong> de <strong>{(STATUS_CONFIG[revertConfirm.sep.status] || {}).label}</strong> para <strong>{targetCfg.label}</strong>?</>
                      : <>Reverter <strong>{revertConfirm.seps.length}</strong> separação(ões) para <strong>{targetCfg.label}</strong>?</>
                    }
                  </p>
                  {isFromDispatched && (
                    <div style={{
                      padding: '10px 12px',
                      background: '#fef3c7',
                      border: '1px solid #fcd34d',
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: '#92400e',
                      marginBottom: '16px',
                    }}>
                      <strong>⚠ Atenção:</strong> Separações já despachadas terão o despacho e as saídas de estoque
                      <strong> excluídos</strong>. NFs com código de rastreio, comprovante de entrega ou link de
                      entregador <strong>não serão revertidas</strong>.
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button
                      className="btn btn-secondary"
                      onClick={() => setRevertConfirm(null)}
                      disabled={revertLoading}
                    >Cancelar</button>
                    <button
                      className="btn btn-primary"
                      style={{ background: '#b45309', borderColor: '#b45309' }}
                      onClick={handleConfirmRevert}
                      disabled={revertLoading}
                    >
                      {revertLoading ? 'Revertendo...' : 'Confirmar Reversão'}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Batch revert target-status menu */}
      {isStockAdmin && showBatchRevertMenu && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
            onClick={() => setShowBatchRevertMenu(false)}
          />
          <div style={{
            position: 'fixed',
            bottom: '80px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9999,
            background: '#fff',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            padding: '4px',
            minWidth: '200px',
          }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '6px 12px 4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
              Reverter selecionadas para:
            </div>
            {/* Only status options that are "before" at least one selected item */}
            {['pendente', 'separado', 'embalado'].map(st => {
              const cfg = STATUS_CONFIG[st];
              const anyEligible = selectedSeparations.some(s => ALL_STATUSES.indexOf(s.status) > ALL_STATUSES.indexOf(st));
              if (!anyEligible) return null;
              return (
                <button
                  key={st}
                  onClick={() => askBatchRevertConfirmation(st)}
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
                    textAlign: 'left',
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-secondary)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <span className="badge" style={{ background: cfg.bg, color: cfg.color, fontSize: '10px' }}>
                    {cfg.label}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * BatchStatusDropdown — inline dropdown + button for batch status change
 */
function BatchStatusDropdown({ onChangeStatus }) {
  const [status, setStatus] = useState('separado');
  return (
    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
      <select
        value={status}
        onChange={e => setStatus(e.target.value)}
        style={{
          fontSize: '12px',
          padding: '5px 8px',
          borderRadius: '6px',
          border: '1px solid rgba(255,255,255,0.3)',
          background: 'rgba(255,255,255,0.1)',
          color: '#fff',
          cursor: 'pointer',
        }}
      >
        {ALL_STATUSES.map(s => (
          <option key={s} value={s} style={{ color: '#000' }}>
            {STATUS_CONFIG[s].label}
          </option>
        ))}
      </select>
      <button
        style={{
          fontSize: '12px',
          padding: '5px 12px',
          borderRadius: '6px',
          border: '1px solid rgba(255,255,255,0.3)',
          background: 'rgba(255,255,255,0.15)',
          color: '#fff',
          cursor: 'pointer',
          fontWeight: 600,
          whiteSpace: 'nowrap',
        }}
        onClick={() => onChangeStatus(status)}
      >
        Alterar Status
      </button>
    </div>
  );
}
