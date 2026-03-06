/**
 * SeparationManager.jsx — Orchestrator for separation management
 *
 * Tabs: Lista | Importar NF (Tiny) | Manual
 * Hub tabs: Todos | <dynamic hub names>
 * Handles view switching, separation CRUD, dispatch handoff, and WhatsApp export.
 */
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Icon } from '@/utils/icons';
import { buildSeparationMessage, openWhatsAppWithMessage, copyToClipboard } from '@/utils/separationMessage';
import TinyNFeImport from '@/components/import/TinyNFeImport';
import SeparationList from './SeparationList';
import SeparationForm from './SeparationForm';
import HubsModal from './HubsModal';

export default function SeparationManager({
  separations, onAdd, onUpdate, onDelete,
  products, stock, entries, exits, shippings,
  categories, locaisOrigem, onUpdateLocais,
  onAddProduct, onAddCategory, onUpdateCategory, onDeleteCategory,
  user, onSendToDispatch, isStockAdmin,
  hubs, onAddHub, onUpdateHub, onDeleteHub
}) {
  const [activeView, setActiveView] = useState('list');
  const [editingSeparation, setEditingSeparation] = useState(null);
  const [success, setSuccess] = useState('');
  const [selectedHubId, setSelectedHubId] = useState('all');
  const [showHubsModal, setShowHubsModal] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [shareMenuPos, setShareMenuPos] = useState({ top: 0, right: 0 });
  const [copiedHub, setCopiedHub] = useState(false);
  const shareBtnRef = useRef(null);

  // Count active (non-despachado) separations per hub
  const hubCounts = useMemo(() => {
    const counts = { all: 0 };
    (hubs || []).forEach(h => { counts[h.id] = 0; });
    separations.forEach(s => {
      if (s.status !== 'despachado') {
        counts.all++;
        if (s.hubId && counts[s.hubId] !== undefined) {
          counts[s.hubId]++;
        }
      }
    });
    return counts;
  }, [separations, hubs]);

  // Filter separations by selected hub
  const filteredSeparations = useMemo(() => {
    if (selectedHubId === 'all') return separations;
    return separations.filter(s => s.hubId === selectedHubId);
  }, [separations, selectedHubId]);

  // Get pending separations for the selected hub
  const pendingSeparationsForHub = useMemo(() => {
    if (selectedHubId === 'all') return [];
    return separations.filter(s => s.hubId === selectedHubId && s.status === 'pendente');
  }, [separations, selectedHubId]);

  // Get hub name for selected hub
  const selectedHubName = useMemo(() => {
    if (selectedHubId === 'all') return '';
    const hub = (hubs || []).find(h => h.id === selectedHubId);
    return hub?.name || '';
  }, [selectedHubId, hubs]);

  // Build message for the selected hub's pending separations
  const handleBuildHubMessage = useCallback(() => {
    if (pendingSeparationsForHub.length === 0) return '';
    return buildSeparationMessage({
      hubName: selectedHubName,
      separations: pendingSeparationsForHub,
    });
  }, [pendingSeparationsForHub, selectedHubName]);

  const handleWhatsAppHub = useCallback(() => {
    const msg = handleBuildHubMessage();
    if (msg) openWhatsAppWithMessage(msg);
    setShowShareMenu(false);
  }, [handleBuildHubMessage]);

  const handleCopyHub = useCallback(async () => {
    const msg = handleBuildHubMessage();
    if (msg) {
      await copyToClipboard(msg);
      setCopiedHub(true);
      setTimeout(() => setCopiedHub(false), 2000);
    }
    setShowShareMenu(false);
  }, [handleBuildHubMessage]);

  // Check if NF is duplicate (used by TinyNFeImport confirming phase)
  const checkNfDuplicate = useCallback((nfNum) => {
    const existingShipping = (shippings || []).find(s => s.nfNumero === nfNum);
    if (existingShipping) return { type: 'shipping', label: 'Ja despachada' };
    const existingSeparation = separations.find(s => s.nfNumero === nfNum && s.status !== 'despachado');
    if (existingSeparation) return { type: 'separation', label: `Em separacao (${existingSeparation.status})` };
    return null;
  }, [shippings, separations]);

  const handlePrepareSeparationFromTiny = async (data, options = {}) => {
    const nf = data.nfNumero || '';
    const isBatch = options.batchMode === true;

    // Duplicate checks — skip in batch mode (already shown in confirming/summary phase)
    if (!isBatch) {
      const existingShipping = (shippings || []).find(s => s.nfNumero === nf);
      if (existingShipping) {
        if (!window.confirm(`A NF ${nf} já foi despachada. Deseja criar uma separação mesmo assim?`)) {
          return false;
        }
      }

      if (!existingShipping) {
        const existingSeparation = separations.find(s => s.nfNumero === nf && s.status !== 'despachado');
        if (existingSeparation) {
          if (!window.confirm(`A NF ${nf} já está em separação (status: ${existingSeparation.status}). Deseja criar uma nova separação mesmo assim?`)) {
            return false;
          }
        }
      }
    }

    const produtosComFlags = (data.produtos || []).map(p => ({
      ...p,
      doNossoEstoque: !!p.produtoEstoque,
      baixarEstoque: !!p.produtoEstoque,
      observacao: '',
    }));

    const separationObj = {
      nfNumero: nf,
      cliente: data.cliente || '',
      destino: data.destino || '',
      observacoes: '',
      status: 'pendente',
      hubId: selectedHubId !== 'all' ? selectedHubId : '',
      produtos: produtosComFlags,
    };

    // Batch mode: save directly without going to edit form
    if (isBatch) {
      await onAdd({
        ...separationObj,
        userId: user?.email || '',
      });
      return true;
    }

    // Single mode: open edit form (existing behavior)
    setEditingSeparation(separationObj);
    setActiveView('edit');
    return true;
  };

  const handleSaveSeparation = async (separationData) => {
    try {
      if (separationData.id) {
        await onUpdate(separationData.id, separationData);
      } else {
        await onAdd({
          ...separationData,
          status: 'pendente',
          userId: user?.email || '',
        });
      }
      setActiveView('list');
      setEditingSeparation(null);
      setSuccess('Separação salva com sucesso!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      alert('Erro ao salvar separação: ' + err.message);
    }
  };

  const handleEdit = (sep) => {
    setEditingSeparation(sep);
    setActiveView('edit');
  };

  const handleSendToDispatch = async (separation) => {
    const dispatchData = {
      nfNumero: separation.nfNumero,
      cliente: separation.cliente,
      destino: separation.destino,
      produtos: separation.produtos,
    };
    await onUpdate(separation.id, { status: 'despachado', shippingId: 'pending' });
    onSendToDispatch(dispatchData);
  };

  const hasPending = pendingSeparationsForHub.length > 0;
  const isHubSelected = selectedHubId !== 'all';

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">Separação</h1>
          <p className="page-subtitle">Prepare mercadorias para envio</p>
        </div>
        {isStockAdmin && (
          <button
            className="btn btn-secondary"
            onClick={() => setShowHubsModal(true)}
            title="Gerenciar HUBs"
            style={{ fontSize: '12px', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <Icon name="settings" size={14} /> HUBs
          </button>
        )}
      </div>

      {success && <div className="alert alert-success">{success}</div>}

      {/* Hub tabs */}
      {(hubs || []).length > 0 && (
        <div className="card" style={{ marginBottom: '12px', padding: '8px 12px' }}>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500, marginRight: '4px' }}>HUB:</span>
            <button
              className={`filter-tab ${selectedHubId === 'all' ? 'active' : ''}`}
              onClick={() => { setSelectedHubId('all'); setShowShareMenu(false); }}
              style={{ fontSize: '12px', padding: '4px 10px' }}
            >
              Todos ({hubCounts.all})
            </button>
            {(hubs || []).map(hub => (
              <button
                key={hub.id}
                className={`filter-tab ${selectedHubId === hub.id ? 'active' : ''}`}
                onClick={() => { setSelectedHubId(hub.id); setShowShareMenu(false); }}
                style={{ fontSize: '12px', padding: '4px 10px' }}
              >
                {hub.name} ({hubCounts[hub.id] || 0})
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Consolidated export button — only on specific HUB tabs */}
      {isHubSelected && (
        <div className="card" style={{ marginBottom: '12px', padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            {hasPending
              ? `${pendingSeparationsForHub.length} separação(ões) pendente(s) em ${selectedHubName}`
              : `Nenhuma separação pendente em ${selectedHubName}`
            }
          </span>
          <button
            ref={shareBtnRef}
            className="btn btn-primary"
            style={{
              fontSize: '12px',
              padding: '6px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              opacity: hasPending ? 1 : 0.5,
              cursor: hasPending ? 'pointer' : 'not-allowed',
            }}
            onClick={() => {
              if (!hasPending) return;
              if (shareBtnRef.current) {
                const rect = shareBtnRef.current.getBoundingClientRect();
                setShareMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
              }
              setShowShareMenu(!showShareMenu);
            }}
            disabled={!hasPending}
            title={hasPending ? 'Enviar solicitação de separação' : 'Nenhuma separação pendente'}
          >
            <Icon name="share" size={14} />
            Enviar Solicitação
          </button>
        </div>
      )}

      {/* Share dropdown — rendered as fixed portal outside any container */}
      {showShareMenu && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
            onClick={() => setShowShareMenu(false)}
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
            minWidth: '200px',
          }}>
            <button
              onClick={handleWhatsAppHub}
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
                fontSize: '13px',
                fontWeight: 500,
                color: '#25D366',
                textAlign: 'left',
                transition: 'background 0.12s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#f0fdf4'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <Icon name="whatsapp" size={16} style={{ color: '#25D366' }} />
              Enviar via WhatsApp
            </button>
            <button
              onClick={handleCopyHub}
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
                fontSize: '13px',
                fontWeight: 500,
                color: 'var(--text-primary)',
                textAlign: 'left',
                transition: 'background 0.12s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-secondary)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <Icon name="copy" size={16} />
              {copiedHub ? 'Copiado!' : 'Copiar mensagem'}
            </button>
          </div>
        </>
      )}

      {/* View tabs */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div className="filter-tabs">
          <button
            className={`filter-tab ${activeView === 'list' ? 'active' : ''}`}
            onClick={() => { setActiveView('list'); setEditingSeparation(null); }}
          >
            Lista ({filteredSeparations.length})
          </button>
          {isStockAdmin && (
            <button
              className={`filter-tab ${activeView === 'new-tiny' ? 'active' : ''}`}
              onClick={() => { setActiveView('new-tiny'); setEditingSeparation(null); }}
            >
              Importar NF (Tiny)
            </button>
          )}
          {isStockAdmin && (
            <button
              className={`filter-tab ${activeView === 'new-manual' ? 'active' : ''}`}
              onClick={() => {
                setEditingSeparation(null);
                setActiveView('new-manual');
              }}
            >
              Manual
            </button>
          )}
        </div>
      </div>

      {/* Views */}
      {activeView === 'list' && (
        <SeparationList
          separations={filteredSeparations}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onEdit={handleEdit}
          onSendToDispatch={handleSendToDispatch}
          hubs={hubs}
          showHubBadge={selectedHubId === 'all'}
        />
      )}

      {activeView === 'new-tiny' && (
        <TinyNFeImport
          products={products || []}
          onSubmitEntry={() => {}}
          onSubmitExit={() => {}}
          onAddProduct={onAddProduct}
          categories={categories}
          locaisOrigem={locaisOrigem}
          onUpdateLocais={onUpdateLocais}
          entries={entries || []}
          exits={exits || []}
          stock={stock || []}
          mode="exit"
          onAddCategory={onAddCategory}
          onUpdateCategory={onUpdateCategory}
          onDeleteCategory={onDeleteCategory}
          onPrepareShipping={handlePrepareSeparationFromTiny}
          checkNfDuplicate={checkNfDuplicate}
        />
      )}

      {activeView === 'edit' && (
        <SeparationForm
          data={editingSeparation}
          onSave={handleSaveSeparation}
          onCancel={() => { setActiveView('list'); setEditingSeparation(null); }}
          products={products}
          stock={stock}
          entries={entries}
          exits={exits}
          categories={categories}
          locaisOrigem={locaisOrigem}
          onUpdateLocais={onUpdateLocais}
          onAddProduct={onAddProduct}
          onAddCategory={onAddCategory}
          onUpdateCategory={onUpdateCategory}
          onDeleteCategory={onDeleteCategory}
          hubs={hubs}
        />
      )}

      {activeView === 'new-manual' && (
        <SeparationForm
          data={null}
          onSave={handleSaveSeparation}
          onCancel={() => { setActiveView('list'); setEditingSeparation(null); }}
          products={products}
          stock={stock}
          entries={entries}
          exits={exits}
          categories={categories}
          locaisOrigem={locaisOrigem}
          onUpdateLocais={onUpdateLocais}
          onAddProduct={onAddProduct}
          onAddCategory={onAddCategory}
          onUpdateCategory={onUpdateCategory}
          onDeleteCategory={onDeleteCategory}
          hubs={hubs}
          defaultHubId={selectedHubId !== 'all' ? selectedHubId : ''}
        />
      )}

      {/* Hubs Management Modal */}
      {showHubsModal && (
        <HubsModal
          hubs={hubs || []}
          onAdd={onAddHub}
          onUpdate={onUpdateHub}
          onDelete={onDeleteHub}
          separations={separations}
          onClose={() => setShowHubsModal(false)}
        />
      )}
    </div>
  );
}
