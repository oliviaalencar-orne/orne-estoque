/**
 * SeparationManager.jsx — Orchestrator for separation management
 *
 * Tabs: Lista | Importar NF (Tiny) | Manual
 * Hub tabs: Todos | <dynamic hub names>
 * Handles view switching, separation CRUD, and dispatch handoff.
 */
import React, { useState, useMemo } from 'react';
import { Icon } from '@/utils/icons';
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

  const handlePrepareSeparationFromTiny = (data) => {
    const nf = data.nfNumero || '';

    const existingShipping = (shippings || []).find(s => s.nfNumero === nf);
    if (existingShipping) {
      if (!window.confirm(`A NF ${nf} já foi despachada. Deseja criar uma separação mesmo assim?`)) {
        return;
      }
    }

    if (!existingShipping) {
      const existingSeparation = separations.find(s => s.nfNumero === nf && s.status !== 'despachado');
      if (existingSeparation) {
        if (!window.confirm(`A NF ${nf} já está em separação (status: ${existingSeparation.status}). Deseja criar uma nova separação mesmo assim?`)) {
          return;
        }
      }
    }

    const produtosComFlags = (data.produtos || []).map(p => ({
      ...p,
      doNossoEstoque: !!p.produtoEstoque,
      baixarEstoque: !!p.produtoEstoque,
      observacao: '',
    }));
    setEditingSeparation({
      nfNumero: nf,
      cliente: data.cliente || '',
      destino: data.destino || '',
      observacoes: '',
      status: 'pendente',
      hubId: selectedHubId !== 'all' ? selectedHubId : '',
      produtos: produtosComFlags,
    });
    setActiveView('edit');
  };

  const handleSaveSeparation = async (separationData) => {
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
              onClick={() => setSelectedHubId('all')}
              style={{ fontSize: '12px', padding: '4px 10px' }}
            >
              Todos ({hubCounts.all})
            </button>
            {(hubs || []).map(hub => (
              <button
                key={hub.id}
                className={`filter-tab ${selectedHubId === hub.id ? 'active' : ''}`}
                onClick={() => setSelectedHubId(hub.id)}
                style={{ fontSize: '12px', padding: '4px 10px' }}
              >
                {hub.name} ({hubCounts[hub.id] || 0})
              </button>
            ))}
          </div>
        </div>
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
