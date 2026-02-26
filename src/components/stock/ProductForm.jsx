/**
 * ProductForm.jsx — New product registration form
 *
 * Extracted from index-legacy.html L4481-4660
 */
import React, { useState } from 'react';
import { Icon } from '@/utils/icons';

export default function ProductForm({ onSubmit, products, categories }) {
  const [form, setForm] = useState({
    name: '', sku: '', ean: '', category: '', minStock: '3', observations: '', nfOrigem: ''
  });
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Verificar SKU duplicado
    const skuExists = products.some(p => p.sku.toLowerCase().trim() === form.sku.toLowerCase().trim());
    if (skuExists) {
      setError('Já existe um produto com este SKU');
      return;
    }

    try {
      await onSubmit({
        name: form.name.trim(),
        sku: form.sku.trim(),
        ean: form.ean.trim(),
        category: form.category,
        minStock: parseInt(form.minStock) || 3,
        observations: form.observations.trim(),
        nfOrigem: form.nfOrigem.trim(),
        quantity: 0,
        createdAt: new Date().toISOString()
      });

      setSuccess(true);
      setForm({ name: '', sku: '', ean: '', category: '', minStock: '3', observations: '', nfOrigem: '' });
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError('Erro ao cadastrar produto: ' + err.message);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Cadastrar</h1>
        <p className="page-subtitle">Adicione novos produtos ao estoque</p>
      </div>

      {success && <div className="alert alert-success">Produto cadastrado com sucesso!</div>}
      {error && <div className="alert alert-danger">{error}</div>}

      <div className="card">
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Nome do Produto *</label>
            <input
              type="text"
              className="form-input"
              value={form.name}
              onChange={(e) => setForm({...form, name: e.target.value})}
              placeholder="Ex: Luminária de Mesa LED Moderna"
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">SKU / Código *</label>
              <input
                type="text"
                className="form-input"
                value={form.sku}
                onChange={(e) => setForm({...form, sku: e.target.value})}
                placeholder="Ex: LUM-001-LED"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">EAN / Código de Barras</label>
              <input
                type="text"
                className="form-input"
                value={form.ean}
                onChange={(e) => setForm({...form, ean: e.target.value})}
                placeholder="Opcional"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Categoria *</label>
              <select
                className="form-select"
                value={form.category}
                onChange={(e) => setForm({...form, category: e.target.value})}
                required
              >
                <option value="">Selecione...</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Estoque Mínimo</label>
              <input
                type="number"
                className="form-input"
                value={form.minStock}
                onChange={(e) => setForm({...form, minStock: e.target.value})}
                min="0"
              />
              <span className="form-help">Alerta quando estoque ficar abaixo</span>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Nota Fiscal de Origem</label>
            <input
              type="text"
              className="form-input"
              value={form.nfOrigem}
              onChange={(e) => setForm({...form, nfOrigem: e.target.value})}
              placeholder="Ex: NF 12345 ou 000.123.456"
            />
            <span className="form-help">Número da NF para localizar o produto no estoque físico</span>
          </div>

          <div className="form-group">
            <label className="form-label">Observações</label>
            <textarea
              className="form-textarea"
              value={form.observations}
              onChange={(e) => setForm({...form, observations: e.target.value})}
              placeholder="Informações adicionais, particularidades do produto..."
            />
          </div>

          <div className="btn-group">
            <button type="submit" className="btn btn-primary">Cadastrar Produto</button>
          </div>
        </form>
      </div>

      {/* Lista de últimos produtos */}
      <div className="card">
        <h2 className="card-title">
          <Icon name="clipboard" size={16} className="card-title-icon" />
          Últimos Produtos Cadastrados
        </h2>
        {products.length === 0 ? (
          <div className="empty-state">
            <p>Nenhum produto cadastrado ainda</p>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>SKU</th>
                  <th>Categoria</th>
                </tr>
              </thead>
              <tbody>
                {products.slice(-5).reverse().map(p => (
                  <tr key={p.id}>
                    <td>{p.name?.substring(0, 40)}...</td>
                    <td style={{fontFamily: 'monospace', fontSize: '11px'}}>{p.sku}</td>
                    <td>{categories.find(c => c.id === p.category)?.name || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
