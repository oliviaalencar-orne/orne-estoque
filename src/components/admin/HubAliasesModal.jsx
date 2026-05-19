/**
 * HubAliasesModal.jsx — Gestão dos hub_aliases (Sub-frente 3.0b)
 *
 * Admin-only. CRUD para mapear nomes antigos de HUB → canônico atual.
 * Usado pelo resolver em hubAliasResolver.js no fluxo de devolução.
 *
 * UX consistente com MotivosDevolucaoModal:
 *  - Listar (ordenado por name_alias)
 *  - Adicionar (input alias + select canonical)
 *  - Trocar canonical (inline select, mesma linha)
 *  - Excluir (confirm simples — sem contagem porque alias é mapping global)
 *
 * Notas:
 *  - `name_alias` é PK; para renomear o alias, admin deleta e recria.
 *  - O select de canonical lista apenas `hubs` ativos (fonte da verdade).
 */
import React, { useState, useMemo } from 'react';
import { Icon } from '@/utils/icons';

export default function HubAliasesModal({
  aliases,
  hubs,
  onAdd,
  onUpdate,
  onDelete,
  onClose,
}) {
  const [editingAlias, setEditingAlias] = useState(null);
  const [editingCanonical, setEditingCanonical] = useState('');
  const [newAlias, setNewAlias] = useState('');
  const [newCanonical, setNewCanonical] = useState('');
  const [adding, setAdding] = useState(false);

  const hubNames = useMemo(
    () => [...(hubs || [])].map(h => h.name).sort((a, b) => a.localeCompare(b)),
    [hubs]
  );

  const sortedAliases = useMemo(
    () => [...(aliases || [])].sort((a, b) => a.name_alias.localeCompare(b.name_alias)),
    [aliases]
  );

  const startEdit = (a) => {
    setEditingAlias(a.name_alias);
    setEditingCanonical(a.name_canonical);
  };

  const saveEdit = async () => {
    if (!editingCanonical) return;
    await onUpdate(editingAlias, editingCanonical);
    setEditingAlias(null);
    setEditingCanonical('');
  };

  const handleAdd = async () => {
    const aliasTrim = newAlias.trim();
    if (!aliasTrim || !newCanonical) return;
    await onAdd(aliasTrim, newCanonical);
    setNewAlias('');
    setNewCanonical('');
    setAdding(false);
  };

  const handleDelete = async (a) => {
    if (!confirm(`Excluir o alias "${a.name_alias}" → "${a.name_canonical}"?\n\nDevoluções existentes não são afetadas — só novas tentativas com este nome antigo deixarão de ser normalizadas.`)) return;
    await onDelete(a.name_alias);
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: '90%', maxWidth: '560px', maxHeight: '75vh', overflow: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, margin: 0 }}>
            <Icon name="settings" size={16} className="card-title-icon" /> Gerenciar Aliases de HUB
          </h3>
          <button
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '18px' }}
            onClick={onClose}
          >
            &times;
          </button>
        </div>

        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px', lineHeight: 1.5 }}>
          Mapeia nomes antigos de HUB para o nome canônico atual.
          Quando uma devolução chega com um nome antigo, o sistema normaliza
          automaticamente para o canônico correspondente.
        </div>

        {/* Aliases list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
          {sortedAliases.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', padding: '16px' }}>
              Nenhum alias cadastrado
            </div>
          )}
          {sortedAliases.map(a => (
            <div
              key={a.name_alias}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '8px 10px', borderRadius: '6px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-primary)',
              }}
            >
              <span style={{ fontSize: '13px', fontWeight: 500, minWidth: '120px' }}>
                {a.name_alias}
              </span>
              <Icon name="chevronRight" size={12} />
              {editingAlias === a.name_alias ? (
                <>
                  <select
                    className="form-select"
                    value={editingCanonical}
                    onChange={e => setEditingCanonical(e.target.value)}
                    style={{ flex: 1, fontSize: '13px', padding: '4px 8px' }}
                    autoFocus
                  >
                    {hubNames.map(name => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                  <button className="btn btn-primary" onClick={saveEdit} style={{ fontSize: '11px', padding: '4px 10px' }}>Salvar</button>
                  <button className="btn btn-secondary" onClick={() => setEditingAlias(null)} style={{ fontSize: '11px', padding: '4px 8px' }}>Cancelar</button>
                </>
              ) : (
                <>
                  <span
                    style={{ flex: 1, fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}
                    onClick={() => startEdit(a)}
                  >
                    {a.name_canonical}
                  </span>
                  <button
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px' }}
                    onClick={() => startEdit(a)}
                    title="Trocar canônico"
                  >
                    <Icon name="edit" size={13} />
                  </button>
                  <button
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '2px' }}
                    onClick={() => handleDelete(a)}
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
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              className="form-input"
              value={newAlias}
              onChange={e => setNewAlias(e.target.value)}
              placeholder="Nome antigo (ex: G+SHIP CWB)"
              autoFocus
              style={{ flex: 1, fontSize: '13px', minWidth: '160px' }}
            />
            <select
              className="form-select"
              value={newCanonical}
              onChange={e => setNewCanonical(e.target.value)}
              style={{ flex: 1, fontSize: '13px', minWidth: '120px' }}
            >
              <option value="">Selecione HUB...</option>
              {hubNames.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
            <button className="btn btn-primary" onClick={handleAdd} style={{ fontSize: '12px' }}>Adicionar</button>
            <button className="btn btn-secondary" onClick={() => { setAdding(false); setNewAlias(''); setNewCanonical(''); }} style={{ fontSize: '12px' }}>Cancelar</button>
          </div>
        ) : (
          <button className="btn btn-secondary" onClick={() => setAdding(true)} style={{ fontSize: '12px', width: '100%' }}>
            <Icon name="plus" size={14} /> Novo alias
          </button>
        )}

        <div style={{ textAlign: 'right', marginTop: '16px' }}>
          <button className="btn btn-secondary" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
