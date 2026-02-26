/**
 * CategoryManager.jsx — Full category CRUD with card grid
 *
 * Extracted from index-legacy.html L4664-4893
 */
import React, { useState } from 'react';
import { Icon, CategoryIcon, CATEGORY_ICON_OPTIONS } from '@/utils/icons';
import { resolveCatIcon } from '@/utils/icons';

export default function CategoryManager({ categories, onAdd, onUpdate, onDelete, products }) {
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('catSquare');
  const [newColor, setNewColor] = useState('#7A7585');
  const [newObs, setNewObs] = useState('');
  const [editingCat, setEditingCat] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [success, setSuccess] = useState('');
  const colors = ['#E8723A', '#A52428', '#7B6EED', '#F4A261', '#D4612E', '#2ECC87', '#F0B429', '#7A7585', '#5B9BD5', '#2EC4B6'];

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;

    const id = newName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '-');

    await onAdd({
      id,
      name: newName.trim(),
      icon: newIcon,
      color: newColor,
      observations: newObs
    });

    setNewName('');
    setNewIcon('catSquare');
    setNewColor('#6b7280');
    setNewObs('');
    setSuccess('Categoria criada!');
    setTimeout(() => setSuccess(''), 3000);
  };

  const openEditModal = (cat) => {
    setEditForm({
      name: cat.name,
      icon: resolveCatIcon(cat.icon),
      color: cat.color,
      observations: cat.observations || ''
    });
    setEditingCat(cat);
  };

  const handleSaveEdit = async () => {
    await onUpdate(editingCat.id, editForm);
    setEditingCat(null);
    setSuccess('Categoria atualizada!');
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleDelete = (cat) => {
    const count = products.filter(p => p.category === cat.id).length;
    if (count > 0) {
      alert(`Não é possível excluir. Existem ${count} produto(s) nesta categoria.`);
      return;
    }
    if (window.confirm(`Excluir categoria "${cat.name}"?`)) {
      onDelete(cat.id);
    }
  };

  const getCategoryStats = (catId) => {
    const catProducts = products.filter(p => p.category === catId);
    return {
      count: catProducts.length,
      totalStock: catProducts.reduce((sum, p) => sum + (p.currentQuantity || 0), 0)
    };
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Categorias</h1>
        <p className="page-subtitle">Organize seus produtos por categorias</p>
      </div>

      {success && <div className="alert alert-success">{success}</div>}

      {/* Modal de Edição */}
      {editingCat && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 className="modal-title">Editar Categoria</h2>
            <p className="modal-subtitle">Atualize as informações da categoria</p>

            <div className="form-group">
              <label className="form-label">Nome</label>
              <input
                type="text"
                className="form-input"
                value={editForm.name}
                onChange={(e) => setEditForm({...editForm, name: e.target.value})}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Ícone</label>
                <select
                  className="form-select"
                  value={editForm.icon}
                  onChange={(e) => setEditForm({...editForm, icon: e.target.value})}
                >
                  {CATEGORY_ICON_OPTIONS.map(opt => (
                    <option key={opt.id} value={opt.id}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Cor</label>
                <div className="color-picker">
                  {colors.map(color => (
                    <div
                      key={color}
                      className={`color-option ${editForm.color === color ? 'selected' : ''}`}
                      style={{background: color}}
                      onClick={() => setEditForm({...editForm, color})}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Observações</label>
              <textarea
                className="form-textarea"
                value={editForm.observations}
                onChange={(e) => setEditForm({...editForm, observations: e.target.value})}
                placeholder="Informações sobre esta categoria..."
              />
            </div>

            <div className="btn-group">
              <button className="btn btn-primary" onClick={handleSaveEdit}>Salvar</button>
              <button className="btn btn-secondary" onClick={() => setEditingCat(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Formulário Nova Categoria */}
      <div className="card">
        <h2 className="card-title">
          <Icon name="add" size={16} className="card-title-icon" />
          Nova Categoria
        </h2>
        <form onSubmit={handleAdd}>
          <div style={{display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '16px', alignItems: 'end'}}>
            <div className="form-group" style={{marginBottom: 0}}>
              <label className="form-label">Nome</label>
              <input
                type="text"
                className="form-input"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex: Arandelas"
                required
              />
            </div>
            <div className="form-group" style={{marginBottom: 0}}>
              <label className="form-label">Ícone</label>
              <select className="form-select" value={newIcon} onChange={(e) => setNewIcon(e.target.value)}>
                {CATEGORY_ICON_OPTIONS.map(opt => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
              </select>
            </div>
            <button type="submit" className="btn btn-primary">Criar</button>
          </div>
          <div style={{marginTop: '12px'}}>
            <label className="form-label">Cor</label>
            <div className="color-picker">
              {colors.map(color => (
                <div
                  key={color}
                  className={`color-option ${newColor === color ? 'selected' : ''}`}
                  style={{background: color}}
                  onClick={() => setNewColor(color)}
                />
              ))}
            </div>
          </div>
        </form>
      </div>

      {/* Lista de Categorias */}
      <div className="card">
        <h2 className="card-title">
          <Icon name="file" size={16} className="card-title-icon" />
          Categorias Cadastradas ({categories.length})
        </h2>
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px'}}>
          {categories.map(cat => {
            const stats = getCategoryStats(cat.id);
            return (
              <div
                key={cat.id}
                className="category-card-item"
                style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '16px'
                }}
              >
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'start'}}>
                  <div>
                    <div style={{marginBottom: '6px'}}><CategoryIcon icon={cat.icon} size={24} color={cat.color} /></div>
                    <div style={{fontWeight: '600', marginBottom: '4px'}}>{cat.name}</div>
                    <div style={{fontSize: '11px', color: 'var(--text-muted)'}}>
                      {stats.count} produto{stats.count !== 1 ? 's' : ''} • {stats.totalStock} un.
                    </div>
                    {cat.observations && (
                      <div style={{fontSize: '11px', color: 'var(--text-secondary)', marginTop: '6px', fontStyle: 'italic'}}>
                        {cat.observations}
                      </div>
                    )}
                  </div>
                  <div className="category-card-actions" style={{display: 'flex', gap: '4px'}}>
                    <button className="btn btn-icon btn-secondary btn-sm" onClick={() => openEditModal(cat)}><Icon name="edit" size={14} /></button>
                    <button className="btn btn-icon btn-secondary btn-sm" onClick={() => handleDelete(cat)}><Icon name="delete" size={14} /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
