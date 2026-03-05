/**
 * HubsModal.jsx — Modal for managing hubs (create, edit, delete)
 */
import React, { useState } from 'react';
import { Icon } from '@/utils/icons';

export default function HubsModal({ hubs, onAdd, onUpdate, onDelete, separations, onClose }) {
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);

  const startEdit = (hub) => {
    setEditingId(hub.id);
    setEditingName(hub.name);
  };

  const saveEdit = async () => {
    if (!editingName.trim()) return;
    await onUpdate(editingId, editingName.trim());
    setEditingId(null);
    setEditingName('');
  };

  const handleAdd = async () => {
    if (!newName.trim()) return;
    await onAdd(newName.trim());
    setNewName('');
    setAdding(false);
  };

  const handleDelete = async (hub) => {
    if (!confirm(`Excluir o HUB "${hub.name}"?`)) return;
    await onDelete(hub.id, separations);
  };

  const getSepCount = (hubId) => {
    return (separations || []).filter(s => s.hubId === hubId).length;
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div className="card" style={{ width: '90%', maxWidth: '460px', maxHeight: '70vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, margin: 0 }}>
            <Icon name="settings" size={16} className="card-title-icon" /> Gerenciar HUBs
          </h3>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '18px' }} onClick={onClose}>&times;</button>
        </div>

        {/* Hub list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
          {hubs.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', padding: '16px' }}>
              Nenhum HUB cadastrado
            </div>
          )}
          {hubs.map(hub => (
            <div key={hub.id} style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '8px 10px', borderRadius: '6px',
              border: '1px solid var(--border-color)', background: 'var(--bg-primary)',
            }}>
              {editingId === hub.id ? (
                <>
                  <input
                    className="form-input"
                    value={editingName}
                    onChange={e => setEditingName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingId(null); }}
                    autoFocus
                    style={{ flex: 1, fontSize: '13px', padding: '4px 8px' }}
                  />
                  <button className="btn btn-primary" onClick={saveEdit} style={{ fontSize: '11px', padding: '4px 10px' }}>Salvar</button>
                  <button className="btn btn-secondary" onClick={() => setEditingId(null)} style={{ fontSize: '11px', padding: '4px 8px' }}>Cancelar</button>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, fontSize: '13px', fontWeight: 500, cursor: 'pointer' }} onClick={() => startEdit(hub)}>
                    {hub.name}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {getSepCount(hub.id)} sep.
                  </span>
                  <button
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px' }}
                    onClick={() => startEdit(hub)}
                    title="Editar"
                  >
                    <Icon name="edit" size={13} />
                  </button>
                  <button
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '2px' }}
                    onClick={() => handleDelete(hub)}
                    title="Excluir"
                  >
                    <Icon name="delete" size={13} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Add new */}
        {adding ? (
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <input
              className="form-input"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setAdding(false); }}
              placeholder="Nome do novo HUB"
              autoFocus
              style={{ flex: 1, fontSize: '13px' }}
            />
            <button className="btn btn-primary" onClick={handleAdd} style={{ fontSize: '12px' }}>Adicionar</button>
            <button className="btn btn-secondary" onClick={() => { setAdding(false); setNewName(''); }} style={{ fontSize: '12px' }}>Cancelar</button>
          </div>
        ) : (
          <button className="btn btn-secondary" onClick={() => setAdding(true)} style={{ fontSize: '12px', width: '100%' }}>
            <Icon name="plus" size={14} /> Novo HUB
          </button>
        )}

        <div style={{ textAlign: 'right', marginTop: '16px' }}>
          <button className="btn btn-secondary" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
