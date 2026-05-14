/**
 * MotivosDevolucaoModal.jsx — Gestão dos motivos de devolução (Sub-frente 3.0a)
 *
 * CRUD admin-only para `motivos_devolucao`:
 *   - Listar (ordenado por `ordem`, toggle de mostrar desativados)
 *   - Adicionar (input + botão)
 *   - Renomear (inline, mesma estética do HubsModal)
 *   - Ativar/desativar (switch — confirm com contagem se em uso)
 *   - Reordenar (input numérico — KISS, drag-and-drop fica para futuro)
 *   - Excluir (confirm com contagem; oferece desativar como alternativa)
 *
 * UX consistente com src/components/separation/HubsModal.jsx.
 */
import React, { useState, useMemo } from 'react';
import { Icon } from '@/utils/icons';

export default function MotivosDevolucaoModal({
  motivos,
  onAdd,
  onUpdate,
  onDelete,
  onToggleAtivo,
  onReorder,
  countUsage,
  onClose,
}) {
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [showInativos, setShowInativos] = useState(false);

  const visibleMotivos = useMemo(() => {
    const list = showInativos ? motivos : motivos.filter(m => m.ativo);
    return [...list].sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  }, [motivos, showInativos]);

  const startEdit = (m) => {
    setEditingId(m.id);
    setEditingName(m.nome);
  };

  const saveEdit = async () => {
    if (!editingName.trim()) return;
    await onUpdate(editingId, { nome: editingName.trim() });
    setEditingId(null);
    setEditingName('');
  };

  const handleAdd = async () => {
    if (!newName.trim()) return;
    await onAdd(newName.trim());
    setNewName('');
    setAdding(false);
  };

  const handleToggle = async (m) => {
    if (m.ativo) {
      const usage = await countUsage(m.nome);
      const baseMsg = usage > 0
        ? `O motivo "${m.nome}" está sendo usado em ${usage} devolução(ões). Desativá-lo apenas o oculta de novos cadastros — devoluções existentes mantêm o texto original. Deseja prosseguir?`
        : `Desativar o motivo "${m.nome}"?`;
      if (!confirm(baseMsg)) return;
    }
    await onToggleAtivo(m.id, !m.ativo);
  };

  const handleDelete = async (m) => {
    const usage = await countUsage(m.nome);
    if (usage > 0) {
      const choice = confirm(
        `O motivo "${m.nome}" está sendo usado em ${usage} devolução(ões). ` +
        `Recomendamos desativar em vez de excluir (preserva histórico).\n\n` +
        `OK = desativar (recomendado)\nCancelar = não fazer nada`
      );
      if (choice) {
        await onToggleAtivo(m.id, false);
      }
      return;
    }
    if (!confirm(`Excluir o motivo "${m.nome}"?`)) return;
    await onDelete(m.id);
  };

  const handleOrdemChange = async (m, novaOrdem) => {
    const n = parseInt(novaOrdem, 10);
    if (!Number.isFinite(n) || n === m.ordem) return;
    await onReorder(m.id, n);
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: '90%', maxWidth: '520px', maxHeight: '75vh', overflow: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, margin: 0 }}>
            <Icon name="settings" size={16} className="card-title-icon" /> Gerenciar Motivos de Devolução
          </h3>
          <button
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '18px' }}
            onClick={onClose}
          >
            &times;
          </button>
        </div>

        {/* Toggle mostrar desativados */}
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showInativos}
            onChange={e => setShowInativos(e.target.checked)}
          />
          Mostrar desativados
        </label>

        {/* Motivos list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
          {visibleMotivos.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', padding: '16px' }}>
              {showInativos ? 'Nenhum motivo cadastrado' : 'Nenhum motivo ativo'}
            </div>
          )}
          {visibleMotivos.map(m => (
            <div
              key={m.id}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '8px 10px', borderRadius: '6px',
                border: '1px solid var(--border-color)',
                background: m.ativo ? 'var(--bg-primary)' : 'rgba(180,180,180,0.10)',
                opacity: m.ativo ? 1 : 0.7,
              }}
            >
              <input
                type="number"
                value={m.ordem}
                onChange={e => handleOrdemChange(m, e.target.value)}
                title="Ordem"
                style={{
                  width: '48px', fontSize: '12px', padding: '4px 6px',
                  border: '1px solid var(--border-color)', borderRadius: '4px',
                  background: 'var(--bg-primary)', textAlign: 'center',
                }}
              />
              {editingId === m.id ? (
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
                  <span
                    style={{ flex: 1, fontSize: '13px', fontWeight: 500, cursor: 'pointer', textDecoration: m.ativo ? 'none' : 'line-through' }}
                    onClick={() => startEdit(m)}
                  >
                    {m.nome}
                  </span>
                  <button
                    onClick={() => handleToggle(m)}
                    title={m.ativo ? 'Desativar' : 'Ativar'}
                    style={{
                      background: m.ativo ? 'rgba(57,132,95,0.20)' : 'rgba(180,180,180,0.30)',
                      border: 'none', borderRadius: '4px', cursor: 'pointer',
                      color: m.ativo ? '#2a6348' : 'var(--text-muted)',
                      fontSize: '11px', fontWeight: 600, padding: '3px 8px',
                    }}
                  >
                    {m.ativo ? 'ATIVO' : 'INATIVO'}
                  </button>
                  <button
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px' }}
                    onClick={() => startEdit(m)}
                    title="Editar"
                  >
                    <Icon name="edit" size={13} />
                  </button>
                  <button
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '2px' }}
                    onClick={() => handleDelete(m)}
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
              placeholder="Nome do novo motivo"
              autoFocus
              style={{ flex: 1, fontSize: '13px' }}
            />
            <button className="btn btn-primary" onClick={handleAdd} style={{ fontSize: '12px' }}>Adicionar</button>
            <button className="btn btn-secondary" onClick={() => { setAdding(false); setNewName(''); }} style={{ fontSize: '12px' }}>Cancelar</button>
          </div>
        ) : (
          <button className="btn btn-secondary" onClick={() => setAdding(true)} style={{ fontSize: '12px', width: '100%' }}>
            <Icon name="plus" size={14} /> Novo motivo
          </button>
        )}

        <div style={{ textAlign: 'right', marginTop: '16px' }}>
          <button className="btn btn-secondary" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
