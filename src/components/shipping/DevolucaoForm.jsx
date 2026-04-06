/**
 * DevolucaoForm.jsx — Simplified form for registering devoluções (returns)
 *
 * No stock deduction (stock entry happens when status reaches ENTREGUE in Phase 2).
 * No entrega local. Simplified product linking.
 */
import React, { useState, useMemo } from 'react';
import { Icon } from '@/utils/icons';

const MOTIVOS_DEVOLUCAO = [
  'Defeito',
  'Arrependimento',
  'Produto errado',
  'Avaria no transporte',
  'Outro',
];

export default function DevolucaoForm({
  locaisOrigem, transportadoras, products, stock, onAdd,
  onCancel, onSuccess, onError, onUpdateProduct,
}) {
  const [form, setForm] = useState({
    nfNumero: '',
    cliente: '',
    motivoDevolucao: '',
    hubDestino: locaisOrigem[0] || '',
    transportadora: '',
    codigoRastreio: '',
    linkRastreio: '',
    produtos: [],
    observacoes: '',
  });
  const [saving, setSaving] = useState(false);
  const [produtoSearch, setProdutoSearch] = useState('');
  const [showProdutoList, setShowProdutoList] = useState(false);

  const sortedProducts = useMemo(() =>
    [...(products || [])].sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [products]
  );

  const filteredProducts = useMemo(() => {
    if (!produtoSearch) return sortedProducts.slice(0, 20);
    const s = produtoSearch.toLowerCase();
    return sortedProducts.filter(p =>
      (p.name || '').toLowerCase().includes(s) ||
      (p.sku || '').toLowerCase().includes(s)
    ).slice(0, 20);
  }, [produtoSearch, sortedProducts]);

  const addProduto = (product) => {
    const existing = form.produtos.find(p => p.sku === product.sku || p.produtoEstoque?.sku === product.sku);
    if (existing) {
      setForm({
        ...form,
        produtos: form.produtos.map(p =>
          (p.sku === product.sku || p.produtoEstoque?.sku === product.sku)
            ? { ...p, quantidade: p.quantidade + 1 }
            : p
        ),
      });
    } else {
      setForm({
        ...form,
        produtos: [...form.produtos, {
          descricao: product.name,
          sku: product.sku,
          quantidade: 1,
          produtoEstoque: { sku: product.sku, name: product.name },
        }],
      });
    }
    setProdutoSearch('');
    setShowProdutoList(false);
  };

  const removeProduto = (index) => {
    setForm({ ...form, produtos: form.produtos.filter((_, i) => i !== index) });
  };

  const updateQuantidade = (index, qty) => {
    const q = Math.max(1, parseInt(qty) || 1);
    setForm({
      ...form,
      produtos: form.produtos.map((p, i) => i === index ? { ...p, quantidade: q } : p),
    });
  };

  const gerarLinkRastreio = (transportadora, codigo) => {
    if (!codigo) return '';
    const links = {
      'Correios': `https://rastreamento.correios.com.br/app/index.php?objetos=${codigo}`,
      'Jadlog': `https://www.jadlog.com.br/jadlog/tracking?cte=${codigo}`,
      'Total Express': `https://totalexpress.com.br/rastreamento/?codigo=${codigo}`,
      'TNT': `https://radar.tntbrasil.com.br/radar/${codigo}`,
    };
    return links[transportadora] || '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    onError('');

    if (!form.nfNumero) {
      onError('Informe o número da NF');
      return;
    }
    if (!form.motivoDevolucao) {
      onError('Selecione o motivo da devolução');
      return;
    }

    setSaving(true);
    try {
      await onAdd({
        nfNumero: form.nfNumero,
        cliente: form.cliente,
        destino: '',
        localOrigem: '',
        transportadora: form.transportadora,
        codigoRastreio: form.codigoRastreio,
        linkRastreio: form.linkRastreio,
        produtos: form.produtos,
        observacoes: form.observacoes,
        status: 'DESPACHADO',
        tipo: 'devolucao',
        motivoDevolucao: form.motivoDevolucao,
        hubDestino: form.hubDestino,
        entradaCriada: false,
      });
      // Mark products as defeituosos if flagged
      if (onUpdateProduct) {
        for (const prod of form.produtos) {
          if (prod.defeito && prod.sku) {
            const product = products.find(p => p.sku === prod.sku);
            if (product) {
              await onUpdateProduct(product.id, {
                defeito: true,
                defeitoDescricao: (prod.defeitoDescricao || '').trim(),
                defeitoData: product.defeitoData || new Date().toISOString(),
              });
            }
          }
        }
      }
      onSuccess('Devolução registrada com sucesso!');
    } catch (err) {
      onError('Erro ao registrar devolução: ' + err.message);
    }
    setSaving(false);
  };

  return (
    <div className="card">
      <h2 className="card-title">
        <Icon name="shipping" size={16} className="card-title-icon" />
        Nova Devolução
      </h2>

      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Número da NF *</label>
            <input
              type="text"
              className="form-input"
              value={form.nfNumero}
              onChange={(e) => setForm({ ...form, nfNumero: e.target.value })}
              placeholder="Ex: 002735"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Cliente</label>
            <input
              type="text"
              className="form-input"
              value={form.cliente}
              onChange={(e) => setForm({ ...form, cliente: e.target.value })}
              placeholder="Nome do cliente"
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Motivo da Devolução *</label>
            <select
              className="form-select"
              value={form.motivoDevolucao}
              onChange={(e) => setForm({ ...form, motivoDevolucao: e.target.value })}
            >
              <option value="">Selecione...</option>
              {MOTIVOS_DEVOLUCAO.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">HUB Destino</label>
            <select
              className="form-select"
              value={form.hubDestino}
              onChange={(e) => setForm({ ...form, hubDestino: e.target.value })}
            >
              <option value="">Selecione...</option>
              {locaisOrigem.map(l => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Transportadora</label>
            <select
              className="form-select"
              value={form.transportadora}
              onChange={(e) => setForm({ ...form, transportadora: e.target.value })}
            >
              <option value="">Selecione...</option>
              {transportadoras.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Código de Rastreio</label>
            <input
              type="text"
              className="form-input"
              value={form.codigoRastreio}
              onChange={(e) => {
                const codigo = e.target.value;
                const link = gerarLinkRastreio(form.transportadora, codigo);
                setForm({ ...form, codigoRastreio: codigo, linkRastreio: link || form.linkRastreio });
              }}
              placeholder="Ex: AA123456789BR"
            />
          </div>
        </div>

        {form.linkRastreio && (
          <div className="form-group">
            <label className="form-label">Link de Rastreio</label>
            <input
              type="url"
              className="form-input"
              value={form.linkRastreio}
              onChange={(e) => setForm({ ...form, linkRastreio: e.target.value })}
            />
          </div>
        )}

        {/* Produtos */}
        <div className="form-group" style={{ marginTop: '16px' }}>
          <label className="form-label">Produtos da Devolução</label>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              className="form-input"
              value={produtoSearch}
              onChange={(e) => { setProdutoSearch(e.target.value); setShowProdutoList(true); }}
              onFocus={() => setShowProdutoList(true)}
              placeholder="Buscar produto por nome ou SKU..."
            />
            {showProdutoList && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => setShowProdutoList(false)} />
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999,
                  maxHeight: '200px', overflowY: 'auto',
                  background: '#fff', border: '1px solid var(--border)', borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                }}>
                  {filteredProducts.length === 0 ? (
                    <div style={{ padding: '10px', fontSize: '12px', color: 'var(--text-muted)' }}>Nenhum produto encontrado</div>
                  ) : (
                    filteredProducts.map(p => (
                      <button
                        key={p.sku}
                        type="button"
                        onClick={() => addProduto(p)}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left',
                          padding: '8px 12px', border: 'none', background: 'transparent',
                          cursor: 'pointer', fontSize: '13px',
                          borderBottom: '1px solid var(--border-light)',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = '#f3f4f6'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        <strong>{p.name}</strong>
                        <span style={{ marginLeft: '8px', color: 'var(--text-muted)', fontSize: '11px' }}>SKU: {p.sku}</span>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>

          {form.produtos.length > 0 && (
            <div style={{ marginTop: '12px' }}>
              {form.produtos.map((prod, i) => (
                <React.Fragment key={i}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '8px 12px', background: 'var(--bg-secondary)',
                  borderRadius: '8px', marginBottom: '6px',
                }}>
                  <div style={{ flex: 1, fontSize: '13px' }}>
                    <strong>{prod.descricao || prod.sku}</strong>
                    <span style={{ marginLeft: '6px', color: 'var(--text-muted)', fontSize: '11px' }}>({prod.sku})</span>
                    {prod.defeito && prod.defeitoDescricao && (
                      <div style={{fontSize: '11px', color: '#DC2626', marginTop: '2px'}}>{prod.defeitoDescricao}</div>
                    )}
                  </div>
                  <label style={{display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: prod.defeito ? '#DC2626' : '#6B7280', cursor: 'pointer', whiteSpace: 'nowrap'}}>
                    <input
                      type="checkbox"
                      checked={prod.defeito || false}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setForm({
                          ...form,
                          produtos: form.produtos.map((p, j) => j === i ? {
                            ...p,
                            defeito: checked,
                            defeitoDescricao: checked ? (p.defeitoDescricao || form.motivoDevolucao || '') : (p.defeitoDescricao || ''),
                          } : p),
                        });
                      }}
                      style={{width: '14px', height: '14px', accentColor: '#DC2626'}}
                    />
                    Defeito
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={prod.quantidade}
                    onChange={(e) => updateQuantidade(i, e.target.value)}
                    style={{ width: '60px', textAlign: 'center' }}
                    className="form-input"
                  />
                  <button
                    type="button"
                    onClick={() => removeProduto(i)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: '#ef4444', fontSize: '16px', padding: '2px',
                    }}
                    title="Remover"
                  >
                    ×
                  </button>
                </div>
                {prod.defeito && (
                  <div style={{padding: '4px 12px 8px', background: '#FEF2F2', borderRadius: '0 0 8px 8px', marginTop: '-6px', marginBottom: '6px'}}>
                    <input
                      type="text"
                      className="form-input"
                      value={prod.defeitoDescricao || ''}
                      onChange={(e) => setForm({
                        ...form,
                        produtos: form.produtos.map((p, j) => j === i ? { ...p, defeitoDescricao: e.target.value } : p),
                      })}
                      placeholder="Descreva o defeito..."
                      style={{fontSize: '12px', padding: '6px 10px'}}
                    />
                  </div>
                )}
                </React.Fragment>
              ))}
            </div>
          )}
        </div>

        <div className="form-group">
          <label className="form-label">Observações</label>
          <textarea
            className="form-textarea"
            value={form.observacoes}
            onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
            placeholder="Informações adicionais sobre a devolução..."
            rows={3}
          />
        </div>

        <div className="btn-group" style={{ marginTop: '20px' }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Salvando...' : 'Registrar Devolução'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
