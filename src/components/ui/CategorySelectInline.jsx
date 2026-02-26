/**
 * CategorySelectInline.jsx — Dropdown + create new + manage categories
 *
 * Extracted from index-legacy.html L4897-4970
 */
import React, { useState } from 'react';
import { Icon } from '@/utils/icons';
import CategoryManager from '@/components/categories/CategoryManager';

export default function CategorySelectInline({ categories, value, onChange, onAddCategory, onUpdateCategory, onDeleteCategory, products: catProducts }) {
  const [showNewForm, setShowNewForm] = useState(false);
  const [showManager, setShowManager] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#7A7585');
  const [saving, setSaving] = useState(false);

  const handleCreateCategory = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const id = newName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
      const newCat = await onAddCategory({ id, name: newName.trim(), icon: 'catSquare', color: newColor });
      if (newCat) onChange(newCat.id || id);
      setNewName('');
      setShowNewForm(false);
    } finally { setSaving(false); }
  };

  return (
    <div className="form-group">
      <label className="form-label">Categoria *</label>
      <div style={{display: 'flex', gap: '6px', alignItems: 'center'}}>
        <select className="form-select" value={value} onChange={(e) => onChange(e.target.value)} style={{flex: 1}}>
          <option value="">Selecione...</option>
          {(categories || []).map(cat => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
        <button type="button" className="btn btn-secondary" onClick={() => setShowNewForm(!showNewForm)} title="Criar categoria" style={{padding: '8px 10px', minWidth: 'auto'}}>+</button>
      </div>

      {showNewForm && (
        <div style={{marginTop: '8px', padding: '12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-secondary)'}}>
          <div style={{display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap'}}>
            <div style={{flex: 1, minWidth: '150px'}}>
              <label className="form-label" style={{fontSize: '11px', marginBottom: '4px'}}>Nome</label>
              <input className="form-input" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nova categoria" style={{fontSize: '13px'}} />
            </div>
            <div style={{width: '60px'}}>
              <label className="form-label" style={{fontSize: '11px', marginBottom: '4px'}}>Cor</label>
              <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)} style={{width: '100%', height: '36px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', cursor: 'pointer'}} />
            </div>
            <button type="button" className="btn btn-primary" onClick={handleCreateCategory} disabled={saving || !newName.trim()} style={{fontSize: '12px', padding: '8px 12px'}}>
              {saving ? '...' : 'Salvar'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => { setShowNewForm(false); setNewName(''); }} style={{fontSize: '12px', padding: '8px 12px'}}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <button type="button" onClick={() => setShowManager(true)} style={{background: 'none', border: 'none', color: 'var(--accent-primary)', fontSize: '11px', cursor: 'pointer', padding: '4px 0', marginTop: '4px'}}>
        Gerenciar categorias
      </button>

      {showManager && (
        <div className="modal-overlay" onClick={() => setShowManager(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: '600px', maxHeight: '80vh', overflow: 'auto'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px'}}>
              <h3 style={{margin: 0}}>Gerenciar Categorias</h3>
              <button className="btn btn-icon btn-secondary" onClick={() => setShowManager(false)}>
                <Icon name="close" size={16} />
              </button>
            </div>
            <CategoryManager categories={categories} onAdd={onAddCategory} onUpdate={onUpdateCategory} onDelete={onDeleteCategory} products={catProducts || []} />
          </div>
        </div>
      )}
    </div>
  );
}
