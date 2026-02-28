/**
 * SeparationForm.jsx — Editor for separation (new or existing)
 *
 * Handles product table with linking, NF origin FIFO, manual product add.
 */
import React, { useState } from 'react';
import { Icon } from '@/utils/icons';
import { getEstoquePorNF } from '@/utils/fifo';

export default function SeparationForm({
  data, onSave, onCancel,
  products, stock, entries, exits,
  categories, locaisOrigem, onUpdateLocais,
  onAddProduct, onAddCategory, onUpdateCategory, onDeleteCategory
}) {
  const [form, setForm] = useState(() => ({
    id: data?.id || '',
    nfNumero: data?.nfNumero || '',
    cliente: data?.cliente || '',
    destino: data?.destino || '',
    observacoes: data?.observacoes || '',
    status: data?.status || 'pendente',
    produtos: (data?.produtos || []).map(p => ({ ...p, selected: p.selected !== false })),
  }));

  const [showVincularModal, setShowVincularModal] = useState(null);
  const [vincularSearch, setVincularSearch] = useState('');
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [manualProduct, setManualProduct] = useState({ nome: '', sku: '', quantidade: 1, observacao: '' });
  const [error, setError] = useState('');

  const updateProduto = (index, updates) => {
    const newProd = [...form.produtos];
    newProd[index] = { ...newProd[index], ...updates };
    setForm({ ...form, produtos: newProd });
  };

  const removeProduto = (index) => {
    setForm({ ...form, produtos: form.produtos.filter((_, i) => i !== index) });
  };

  const handleVincular = (index, prodEstoque) => {
    updateProduto(index, {
      vinculado: true,
      produtoEstoque: { id: prodEstoque.id, name: prodEstoque.name, sku: prodEstoque.sku },
      doNossoEstoque: true,
      baixarEstoque: true,
    });
    setShowVincularModal(null);
    setVincularSearch('');
  };

  const handleDesvincular = (index) => {
    updateProduto(index, {
      vinculado: false,
      produtoEstoque: null,
      doNossoEstoque: false,
      baixarEstoque: false,
      nfOrigem: '',
    });
  };

  const handleAddManual = () => {
    if (!manualProduct.nome) { setError('Informe o nome do produto'); return; }
    setForm({
      ...form,
      produtos: [...form.produtos, {
        nome: manualProduct.nome,
        sku: manualProduct.sku || '',
        quantidade: manualProduct.quantidade || 1,
        unidade: 'UN',
        vinculado: false,
        produtoEstoque: null,
        baixarEstoque: false,
        nfOrigem: '',
        observacao: manualProduct.observacao || '',
        doNossoEstoque: false,
        manual: true,
        selected: true,
      }],
    });
    setManualProduct({ nome: '', sku: '', quantidade: 1, observacao: '' });
    setShowManualAdd(false);
    setError('');
  };

  const handleSave = () => {
    const produtosFinal = form.produtos
      .filter(p => p.selected !== false)
      .map(({ selected, ...rest }) => rest);
    onSave({
      ...form,
      produtos: produtosFinal,
    });
  };

  const vincularResults = showVincularModal !== null ? (stock || []).filter(p => {
    if (!vincularSearch) return false;
    const q = vincularSearch.toLowerCase();
    return (p.name || '').toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q);
  }).slice(0, 10) : [];

  return (
    <div className="card">
      <h2 className="card-title">
        <Icon name="edit" size={16} className="card-title-icon" />
        {form.id ? 'Editar Separação' : 'Nova Separação'}
      </h2>

      {error && <div className="alert alert-danger">{error}</div>}

      {/* Header fields */}
      <div className="form-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '16px' }}>
        <div>
          <label className="form-label">NF Número</label>
          <input className="form-input" value={form.nfNumero} onChange={e => setForm({ ...form, nfNumero: e.target.value })} placeholder="Número da NF" />
        </div>
        <div>
          <label className="form-label">Cliente</label>
          <input className="form-input" value={form.cliente} onChange={e => setForm({ ...form, cliente: e.target.value })} placeholder="Nome do cliente" />
        </div>
        <div>
          <label className="form-label">Destino</label>
          <input className="form-input" value={form.destino} onChange={e => setForm({ ...form, destino: e.target.value })} placeholder="Cidade/Estado" />
        </div>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label className="form-label">Observações gerais</label>
        <textarea className="form-input" rows="2" value={form.observacoes} onChange={e => setForm({ ...form, observacoes: e.target.value })} placeholder="Observações sobre esta separação..." />
      </div>

      {/* Products table */}
      <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>Produtos ({form.produtos.length})</h3>
        <button className="btn btn-secondary" style={{ fontSize: '12px' }} onClick={() => setShowManualAdd(!showManualAdd)}>
          <Icon name="plus" size={14} /> Adicionar Manual
        </button>
      </div>

      {/* Manual add form */}
      {showManualAdd && (
        <div className="card" style={{ background: 'var(--bg-secondary)', padding: '12px', marginBottom: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 80px 2fr', gap: '8px', alignItems: 'end' }}>
            <div>
              <label className="form-label" style={{ fontSize: '11px' }}>Nome *</label>
              <input className="form-input" value={manualProduct.nome} onChange={e => setManualProduct({ ...manualProduct, nome: e.target.value })} placeholder="Nome do produto" style={{ fontSize: '13px' }} />
            </div>
            <div>
              <label className="form-label" style={{ fontSize: '11px' }}>SKU</label>
              <input className="form-input" value={manualProduct.sku} onChange={e => setManualProduct({ ...manualProduct, sku: e.target.value })} placeholder="Opcional" style={{ fontSize: '13px' }} />
            </div>
            <div>
              <label className="form-label" style={{ fontSize: '11px' }}>Qtd</label>
              <input className="form-input" type="number" min="1" value={manualProduct.quantidade} onChange={e => setManualProduct({ ...manualProduct, quantidade: parseInt(e.target.value) || 1 })} style={{ fontSize: '13px' }} />
            </div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'end' }}>
              <input className="form-input" value={manualProduct.observacao} onChange={e => setManualProduct({ ...manualProduct, observacao: e.target.value })} placeholder="Observação" style={{ fontSize: '13px', flex: 1 }} />
              <button className="btn btn-primary" onClick={handleAddManual} style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>Adicionar</button>
            </div>
          </div>
        </div>
      )}

      {/* Product rows */}
      {form.produtos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '13px' }}>
          Nenhum produto adicionado
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
          {form.produtos.map((prod, i) => {
            const isOurs = prod.doNossoEstoque;
            const nfOptions = isOurs && prod.baixarEstoque && prod.produtoEstoque
              ? getEstoquePorNF(prod.produtoEstoque.sku, entries, exits)
              : [];
            return (
              <div
                key={i}
                style={{
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  background: prod.selected === false ? 'var(--bg-secondary)' : isOurs ? 'var(--bg-primary)' : 'rgba(245, 158, 11, 0.04)',
                  opacity: prod.selected === false ? 0.5 : 1,
                }}
              >
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  {/* Checkbox */}
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', marginTop: '2px' }}>
                    <input
                      type="checkbox"
                      checked={prod.selected !== false}
                      onChange={e => updateProduto(i, { selected: e.target.checked })}
                    />
                  </label>

                  {/* Product info */}
                  <div style={{ flex: 1, minWidth: '180px' }}>
                    <div style={{ fontWeight: 500, fontSize: '13px', marginBottom: '2px' }}>
                      {prod.produtoEstoque ? prod.produtoEstoque.name : prod.nome}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      SKU: {prod.sku || '-'}
                      {prod.manual && <span className="badge" style={{ marginLeft: '6px', fontSize: '10px', background: '#f3f4f6', color: '#6b7280' }}>Manual</span>}
                      {!isOurs && !prod.manual && <span className="badge" style={{ marginLeft: '6px', fontSize: '10px', background: '#fef3c7', color: '#92400e' }}>Terceiro</span>}
                    </div>
                    {/* Vincular button */}
                    {!prod.vinculado && (
                      <button
                        style={{ fontSize: '11px', color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', textDecoration: 'underline' }}
                        onClick={() => { setShowVincularModal(i); setVincularSearch(''); }}
                      >
                        Vincular ao estoque
                      </button>
                    )}
                    {prod.vinculado && prod.produtoEstoque && (
                      <button
                        style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0' }}
                        onClick={() => handleDesvincular(i)}
                      >
                        Desvincular
                      </button>
                    )}
                  </div>

                  {/* Quantity */}
                  <div style={{ width: '60px' }}>
                    <label className="form-label" style={{ fontSize: '10px' }}>Qtd</label>
                    <input
                      className="form-input"
                      type="number"
                      min="1"
                      value={prod.quantidade}
                      onChange={e => updateProduto(i, { quantidade: parseInt(e.target.value) || 1 })}
                      style={{ fontSize: '13px', padding: '4px 6px' }}
                    />
                  </div>

                  {/* Nosso Estoque toggle */}
                  <div style={{ width: '70px', textAlign: 'center' }}>
                    <label className="form-label" style={{ fontSize: '10px' }}>Nosso</label>
                    <div>
                      <input
                        type="checkbox"
                        checked={!!isOurs}
                        onChange={e => {
                          const val = e.target.checked;
                          updateProduto(i, {
                            doNossoEstoque: val,
                            baixarEstoque: val && !!prod.vinculado,
                            nfOrigem: val ? prod.nfOrigem : '',
                          });
                        }}
                      />
                    </div>
                  </div>

                  {/* Baixar Estoque */}
                  <div style={{ width: '60px', textAlign: 'center' }}>
                    <label className="form-label" style={{ fontSize: '10px' }}>Baixar</label>
                    <div>
                      <input
                        type="checkbox"
                        checked={!!prod.baixarEstoque}
                        disabled={!isOurs || !prod.vinculado}
                        onChange={e => updateProduto(i, { baixarEstoque: e.target.checked })}
                      />
                    </div>
                  </div>

                  {/* NF Origem (FIFO) */}
                  <div style={{ width: '120px' }}>
                    <label className="form-label" style={{ fontSize: '10px' }}>NF Origem</label>
                    {isOurs && prod.baixarEstoque && nfOptions.length > 0 ? (
                      <select
                        className="form-select"
                        value={prod.nfOrigem || ''}
                        onChange={e => updateProduto(i, { nfOrigem: e.target.value })}
                        style={{ fontSize: '12px', padding: '4px 6px' }}
                      >
                        <option value="">Auto (FIFO)</option>
                        {nfOptions.map(nf => (
                          <option key={nf.nf} value={nf.nf}>
                            {nf.nf} ({nf.quantidade})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>-</span>
                    )}
                  </div>

                  {/* Observação */}
                  <div style={{ width: '140px' }}>
                    <label className="form-label" style={{ fontSize: '10px' }}>Obs</label>
                    <input
                      className="form-input"
                      value={prod.observacao || ''}
                      onChange={e => updateProduto(i, { observacao: e.target.value })}
                      placeholder="Obs do produto"
                      style={{ fontSize: '12px', padding: '4px 6px' }}
                    />
                  </div>

                  {/* Remove */}
                  <button
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '4px', marginTop: '14px' }}
                    onClick={() => removeProduto(i)}
                    title="Remover produto"
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Vincular Modal */}
      {showVincularModal !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowVincularModal(null)}>
          <div className="card" style={{ width: '90%', maxWidth: '500px', maxHeight: '70vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>Vincular ao Estoque</h3>
            <input
              className="form-input"
              placeholder="Buscar por nome ou SKU..."
              value={vincularSearch}
              onChange={e => setVincularSearch(e.target.value)}
              autoFocus
              style={{ marginBottom: '12px' }}
            />
            {vincularResults.length === 0 && vincularSearch && (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '16px', fontSize: '13px' }}>Nenhum produto encontrado</div>
            )}
            {vincularResults.map(p => (
              <div
                key={p.id}
                style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)', cursor: 'pointer', fontSize: '13px' }}
                onClick={() => handleVincular(showVincularModal, p)}
              >
                <div style={{ fontWeight: 500 }}>{p.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>SKU: {p.sku} &middot; Estoque: {p.currentQuantity ?? 0}</div>
              </div>
            ))}
            <div style={{ textAlign: 'right', marginTop: '12px' }}>
              <button className="btn btn-secondary" onClick={() => setShowVincularModal(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button className="btn btn-secondary" onClick={onCancel}>Cancelar</button>
        <button className="btn btn-primary" onClick={handleSave}>
          <Icon name="check" size={14} /> {form.id ? 'Atualizar' : 'Salvar Separação'}
        </button>
      </div>
    </div>
  );
}
