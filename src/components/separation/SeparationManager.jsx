/**
 * SeparationManager.jsx — Orchestrator for separation management
 *
 * Tabs: Lista | Importar NF (Tiny) | Manual
 * Handles view switching, separation CRUD, and dispatch handoff.
 */
import React, { useState } from 'react';
import { Icon } from '@/utils/icons';
import TinyNFeImport from '@/components/import/TinyNFeImport';
import SeparationList from './SeparationList';
import SeparationForm from './SeparationForm';

export default function SeparationManager({
  separations, onAdd, onUpdate, onDelete,
  products, stock, entries, exits, shippings,
  categories, locaisOrigem, onUpdateLocais,
  onAddProduct, onAddCategory, onUpdateCategory, onDeleteCategory,
  user, onSendToDispatch, isStockAdmin
}) {
  const [activeView, setActiveView] = useState('list');
  const [editingSeparation, setEditingSeparation] = useState(null);
  const [success, setSuccess] = useState('');

  const handlePrepareSeparationFromTiny = (data) => {
    const nf = data.nfNumero || '';

    // Check if NF already exists in shippings
    const existingShipping = (shippings || []).find(s => s.nfNumero === nf);
    if (existingShipping) {
      if (!window.confirm(`A NF ${nf} já foi despachada. Deseja criar uma separação mesmo assim?`)) {
        return;
      }
    }

    // Check if NF already exists in active separations (not despachado)
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
      <div className="page-header">
        <h1 className="page-title">Separação</h1>
        <p className="page-subtitle">Prepare mercadorias para envio</p>
      </div>

      {success && <div className="alert alert-success">{success}</div>}

      {/* Tabs */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div className="filter-tabs">
          <button
            className={`filter-tab ${activeView === 'list' ? 'active' : ''}`}
            onClick={() => { setActiveView('list'); setEditingSeparation(null); }}
          >
            Lista ({separations.length})
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
          separations={separations}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onEdit={handleEdit}
          onSendToDispatch={handleSendToDispatch}
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
        />
      )}
    </div>
  );
}
