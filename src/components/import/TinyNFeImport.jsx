/**
 * TinyNFeImport.jsx — Import NF-e from Tiny ERP via Edge Function
 *
 * Extracted from index-legacy.html L9310-10001
 * CRITICAL: Uses normalizeNfKey/getEstoquePorNF from @/utils/fifo (NOT duplicated)
 * CRITICAL: onPrepareShipping prop — when present and mode is exit,
 *           fills shipping form instead of creating exits directly
 */
import React, { useState } from 'react';
import { supabaseClient, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/config/supabase';
import { getEstoquePorNF } from '@/utils/fifo';
import CategorySelectInline from '@/components/ui/CategorySelectInline';

export default function TinyNFeImport({ products, onSubmitEntry, onSubmitExit, onAddProduct, categories, locaisOrigem, onUpdateLocais, entries, exits, stock, mode, onAddCategory, onUpdateCategory, onDeleteCategory, onPrepareShipping }) {
    const [nfNumber, setNfNumber] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [nfeData, setNfeData] = useState(null); // { numero, tipo, cliente, dataEmissao, itens }
    const [itemStates, setItemStates] = useState([]); // per-item edit state
    const [showVincularModal, setShowVincularModal] = useState(null);
    const [vincularSearch, setVincularSearch] = useState('');
    const [showNewProductModal, setShowNewProductModal] = useState(null);
    const [newProductData, setNewProductData] = useState({ name: '', sku: '', ean: '', category: '', observations: '' });
    const [saving, setSaving] = useState(false);
    const [showInlineCatForm, setShowInlineCatForm] = useState(false);
    const [newCatName, setNewCatName] = useState('');
    const [newCatColor, setNewCatColor] = useState('#7A7585');

    const isEntry = mode === 'entry' || (mode === 'both' && nfeData?.tipo === 'E');
    const isExit = mode === 'exit' || (mode === 'both' && nfeData?.tipo === 'S');

    const fetchNFe = async () => {
        if (!nfNumber.trim()) { setError('Informe o numero da NF.'); return; }
        setLoading(true);
        setError('');
        setSuccess('');
        setNfeData(null);
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (!session) throw new Error('Sessao expirada. Faca login novamente.');
            const resp = await fetch(`${SUPABASE_URL}/functions/v1/tiny-sync-nfe`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json',
                    'apikey': SUPABASE_ANON_KEY,
                },
                body: JSON.stringify({ action: 'fetch', nf_number: nfNumber.trim() }),
            });
            if (!resp.ok) {
                const err = await resp.json().catch(() => ({}));
                throw new Error(err.error || `Erro ${resp.status}`);
            }
            const data = await resp.json();
            if (!data.notas || data.notas.length === 0) {
                setError(`Nenhuma NF-e encontrada com numero ${nfNumber}.`);
                return;
            }
            const nfe = data.notas[0];
            setNfeData(nfe);

            // Build per-item states with auto-linking
            const states = (nfe.itens || []).map(item => {
                const matched = products.find(p =>
                    (p.sku || '').toLowerCase() === (item.codigo || '').toLowerCase() ||
                    (p.ean && p.ean === item.codigo)
                );
                const nfStr = String(nfe.numero);
                const alreadyInEntries = entries.some(e => e.nf === nfStr && (e.sku === item.codigo || (matched && e.sku === matched.sku)));
                const alreadyInExits = exits.some(e => e.nf === nfStr && (e.sku === item.codigo || (matched && e.sku === matched.sku)));
                const alreadyRegistered = alreadyInEntries || alreadyInExits;

                const isExitNfe = mode === 'exit' || (mode === 'both' && nfe.tipo === 'S');
                return {
                    selected: !alreadyRegistered,
                    linkedSku: matched?.sku || '',
                    linkedProduct: matched || null,
                    quantity: Math.round(item.quantidade) || 1,
                    localEntrada: locaisOrigem?.[0] || 'Loja Principal',
                    observations: '',
                    category: matched?.category || '',
                    alreadyRegistered,
                    baixarEstoque: !!matched && isExitNfe,
                    nfOrigem: '',
                };
            });
            setItemStates(states);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const updateItemState = (idx, updates) => {
        setItemStates(prev => prev.map((s, i) => i === idx ? { ...s, ...updates } : s));
    };

    const handleVincular = (idx, sku) => {
        const prod = products.find(p => (p.sku || '').toLowerCase() === (sku || '').toLowerCase());
        updateItemState(idx, {
            linkedSku: sku,
            linkedProduct: prod || null,
            baixarEstoque: !!prod && isExit,
            nfOrigem: '',
        });
        setShowVincularModal(null);
        setVincularSearch('');
    };

    const handleCreateProduct = async () => {
        if (!newProductData.name || !newProductData.sku || !newProductData.category) {
            setError('Preencha nome, SKU e categoria do novo produto.');
            return;
        }
        try {
            await onAddProduct({
                name: newProductData.name.trim(),
                sku: newProductData.sku.trim(),
                ean: newProductData.ean?.trim() || '',
                category: newProductData.category,
                observations: newProductData.observations?.trim() || '',
                quantity: 0,
                createdAt: new Date().toISOString(),
            });
            const idx = showNewProductModal;
            updateItemState(idx, {
                linkedSku: newProductData.sku.trim(),
                linkedProduct: { name: newProductData.name.trim(), sku: newProductData.sku.trim() },
                baixarEstoque: isExit,
                nfOrigem: '',
            });
            setShowNewProductModal(null);
            setNewProductData({ name: '', sku: '', ean: '', category: '', observations: '' });
        } catch (e) {
            setError('Erro ao cadastrar produto: ' + e.message);
        }
    };

    const handleInlineCreateCategory = async () => {
        if (!newCatName.trim() || !onAddCategory) return;
        const id = newCatName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
        await onAddCategory({ id, name: newCatName.trim(), icon: 'catSquare', color: newCatColor });
        setNewCatName('');
        setShowInlineCatForm(false);
    };

    const handleConfirm = async () => {
        const selectedItems = itemStates
            .map((s, i) => ({ ...s, item: nfeData.itens[i], index: i }))
            .filter(s => s.selected && s.linkedSku);

        if (selectedItems.length === 0) {
            setError('Selecione ao menos um item com produto vinculado.');
            return;
        }

        // Validar quantidades vs estoque disponivel por NF de origem
        // Uses getEstoquePorNF imported from @/utils/fifo (params: produtoSku, entries, exits)
        if (isExit) {
            for (const s of selectedItems) {
                if (s.baixarEstoque && s.nfOrigem) {
                    const nfsDisponiveis = getEstoquePorNF(s.linkedSku, entries, exits);
                    const nfSel = nfsDisponiveis.find(n => n.nf === s.nfOrigem);
                    if (nfSel && s.quantity > nfSel.quantidade) {
                        setError(`Produto ${s.linkedSku}: quantidade (${s.quantity}) excede disponivel na NF ${s.nfOrigem} (${nfSel.quantidade}un)`);
                        return;
                    }
                }
            }
        }

        // Se tem callback de preparar shipping (contexto Despachos),
        // desviar para o formulario de despacho em vez de criar exits direto
        if (onPrepareShipping && isExit) {
            const produtos = selectedItems.map(s => ({
                sku: s.item.codigo || '',
                nome: s.item.descricao || '',
                quantidade: s.quantity,
                ean: s.item.ean || '',
                baixarEstoque: !!s.baixarEstoque,
                nfOrigem: s.nfOrigem || '',
                produtoEstoque: s.linkedProduct || null,
                autoVinculado: !!s.linkedProduct,
            }));

            onPrepareShipping({
                nfNumero: String(nfeData.numero || ''),
                cliente: nfeData.cliente?.nome || '',
                destino: nfeData.cliente?.endereco || '',
                produtos: produtos,
            });

            // Limpar estado do import
            setNfeData(null);
            setItemStates([]);
            setNfNumber('');
            setSuccess('NF importada! Preencha os dados do despacho.');
            setTimeout(() => setSuccess(''), 5000);
            return;
        }

        setSaving(true);
        setError('');
        let count = 0;
        try {
            for (const s of selectedItems) {
                if (isEntry || (mode === 'both' && nfeData.tipo === 'E')) {
                    await onSubmitEntry({
                        type: 'COMPRA',
                        sku: s.linkedSku,
                        quantity: s.quantity,
                        supplier: nfeData.cliente?.nome || '',
                        nf: String(nfeData.numero),
                        localEntrada: s.localEntrada || '',
                        observations: s.observations || '',
                        category: s.category || '',
                    });
                } else {
                    const nfOrigemValue = (s.baixarEstoque && s.nfOrigem && s.nfOrigem !== 'Sem NF' && s.nfOrigem !== 'SEM_NF')
                        ? s.nfOrigem : null;
                    await onSubmitExit({
                        type: 'VENDA',
                        sku: s.linkedSku,
                        quantity: s.quantity,
                        client: nfeData.cliente?.nome || '',
                        nf: String(nfeData.numero),
                        nfOrigem: nfOrigemValue,
                    });
                }
                count++;
            }
            setSuccess(`${count} item(ns) registrado(s) com sucesso!`);
            setNfeData(null);
            setItemStates([]);
            setNfNumber('');
            setTimeout(() => setSuccess(''), 5000);
        } catch (e) {
            setError('Erro ao registrar: ' + e.message);
        } finally {
            setSaving(false);
        }
    };

    const sortedProducts = [...products].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    return (
        <div style={{marginBottom: '24px'}}>
            {/* Search bar */}
            <div style={{display: 'flex', gap: '8px', alignItems: 'end', marginBottom: '16px'}}>
                <div style={{flex: 1}}>
                    <label className="form-label">Numero da NF (Tiny ERP)</label>
                    <input
                        type="text"
                        className="form-input"
                        placeholder="Ex: 2305"
                        value={nfNumber}
                        onChange={e => setNfNumber(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && fetchNFe()}
                    />
                </div>
                <button className="btn btn-primary" onClick={fetchNFe} disabled={loading} style={{whiteSpace: 'nowrap'}}>
                    {loading ? 'Buscando...' : 'Buscar no Tiny'}
                </button>
            </div>

            {error && <div className="alert alert-danger" style={{marginBottom: '12px'}}>{error}</div>}
            {success && <div className="alert alert-success" style={{marginBottom: '12px'}}>{success}</div>}

            {/* NF-e Preview */}
            {nfeData && (
                <div style={{border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden'}}>
                    {/* Header */}
                    <div style={{background: 'var(--bg-secondary)', padding: '16px', borderBottom: '1px solid var(--border)'}}>
                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px'}}>
                            <div>
                                <h3 style={{fontSize: '16px', fontWeight: '600', margin: 0}}>
                                    NF-e {nfeData.numero}
                                </h3>
                                <div style={{fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px'}}>
                                    {nfeData.cliente?.nome || 'Sem nome'} | {nfeData.dataEmissao || '-'}
                                </div>
                            </div>
                            <span className={`badge ${nfeData.tipo === 'E' ? 'badge-success' : 'badge-danger'}`} style={{fontSize: '12px'}}>
                                {nfeData.tipo === 'E' ? 'Entrada' : 'Saida'}
                            </span>
                        </div>
                    </div>

                    {/* Items table */}
                    <div style={{overflowX: 'auto'}}>
                        <table className="table" style={{marginBottom: 0}}>
                            <thead>
                                <tr>
                                    <th style={{width: '40px'}}></th>
                                    <th>Produto NF</th>
                                    <th>Produto Estoque</th>
                                    <th style={{width: '80px'}}>Qtd</th>
                                    {isExit && <th style={{minWidth: '140px'}}>Estoque</th>}
                                    {(isEntry || (mode === 'both' && nfeData.tipo === 'E')) && <th>Local</th>}
                                    {(isEntry || (mode === 'both' && nfeData.tipo === 'E')) && <th>Categoria</th>}
                                    <th>Obs.</th>
                                    <th style={{width: '100px'}}>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(nfeData.itens || []).map((item, idx) => {
                                    const st = itemStates[idx] || {};
                                    return (
                                        <tr key={idx} style={{opacity: st.alreadyRegistered && !st.selected ? 0.5 : 1}}>
                                            <td>
                                                <input type="checkbox" checked={!!st.selected}
                                                    onChange={e => updateItemState(idx, { selected: e.target.checked })} />
                                            </td>
                                            <td>
                                                <div style={{fontWeight: '500', fontSize: '13px'}}>{item.descricao}</div>
                                                <div style={{fontSize: '11px', color: 'var(--text-muted)'}}>
                                                    Cod: {item.codigo} | Qtd NF: {item.quantidade}
                                                </div>
                                            </td>
                                            <td>
                                                {st.linkedProduct ? (
                                                    <div>
                                                        <div style={{fontWeight: '500', fontSize: '13px'}}>{st.linkedProduct.name}</div>
                                                        <div style={{fontSize: '11px', color: 'var(--text-muted)'}}>SKU: {st.linkedSku}</div>
                                                        <button
                                                            onClick={() => setShowVincularModal(idx)}
                                                            style={{fontSize: '11px', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: '2px'}}>
                                                            trocar
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div style={{display: 'flex', gap: '4px'}}>
                                                        <button className="btn btn-secondary" style={{fontSize: '11px', padding: '2px 8px'}}
                                                            onClick={() => setShowVincularModal(idx)}>
                                                            Vincular
                                                        </button>
                                                        <button className="btn btn-secondary" style={{fontSize: '11px', padding: '2px 8px'}}
                                                            onClick={() => {
                                                                setNewProductData({
                                                                    name: item.descricao || '',
                                                                    sku: item.codigo || '',
                                                                    ean: '',
                                                                    category: '',
                                                                    observations: '',
                                                                });
                                                                setShowNewProductModal(idx);
                                                            }}>
                                                            Novo
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                            <td>
                                                <input type="number" className="form-input" min="1"
                                                    value={st.quantity || ''}
                                                    onChange={e => updateItemState(idx, { quantity: parseInt(e.target.value) || 0 })}
                                                    style={{width: '70px', padding: '4px 8px', fontSize: '13px'}} />
                                            </td>
                                            {isExit && (
                                                <td>
                                                    {st.linkedProduct ? (
                                                        <div>
                                                            <label style={{display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', cursor: 'pointer', marginBottom: '4px'}}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={!!st.baixarEstoque}
                                                                    onChange={e => updateItemState(idx, {
                                                                        baixarEstoque: e.target.checked,
                                                                        nfOrigem: e.target.checked ? st.nfOrigem : ''
                                                                    })}
                                                                />
                                                                Baixar estoque
                                                            </label>
                                                            {st.baixarEstoque && (() => {
                                                                const nfsDisponiveis = getEstoquePorNF(st.linkedSku, entries, exits);
                                                                return nfsDisponiveis.length > 0 ? (
                                                                    <div>
                                                                        <select
                                                                            className="form-select"
                                                                            value={st.nfOrigem || ''}
                                                                            onChange={e => updateItemState(idx, { nfOrigem: e.target.value })}
                                                                            style={{
                                                                                fontSize: '10px',
                                                                                padding: '4px 6px',
                                                                                minWidth: '100px',
                                                                                background: st.nfOrigem ? 'var(--accent-bg)' : 'white'
                                                                            }}
                                                                        >
                                                                            <option value="">Selecionar NF...</option>
                                                                            {nfsDisponiveis.map((nf, nfIdx) => (
                                                                                <option
                                                                                    key={nfIdx}
                                                                                    value={nf.nf}
                                                                                    disabled={nf.quantidade < st.quantity}
                                                                                >
                                                                                    NF {nf.nf} ({nf.quantidade}un)
                                                                                </option>
                                                                            ))}
                                                                        </select>
                                                                        {st.nfOrigem && (() => {
                                                                            const nfSel = nfsDisponiveis.find(n => n.nf === st.nfOrigem);
                                                                            if (nfSel && st.quantity > nfSel.quantidade) {
                                                                                return (
                                                                                    <div style={{fontSize: '10px', color: 'var(--danger)', marginTop: '2px'}}>
                                                                                        Qtd excede disponivel ({nfSel.quantidade}un)
                                                                                    </div>
                                                                                );
                                                                            }
                                                                            return null;
                                                                        })()}
                                                                    </div>
                                                                ) : (
                                                                    <span style={{fontSize: '10px', color: 'var(--danger)'}}>
                                                                        Sem estoque registrado
                                                                    </span>
                                                                );
                                                            })()}
                                                        </div>
                                                    ) : (
                                                        <span style={{fontSize: '10px', color: 'var(--text-muted)', fontStyle: 'italic'}}>-</span>
                                                    )}
                                                </td>
                                            )}
                                            {(isEntry || (mode === 'both' && nfeData.tipo === 'E')) && (
                                                <td>
                                                    <select className="form-select"
                                                        value={st.localEntrada || ''}
                                                        onChange={e => updateItemState(idx, { localEntrada: e.target.value })}
                                                        style={{padding: '4px 8px', fontSize: '12px', minWidth: '120px'}}>
                                                        {(locaisOrigem || []).map(l => <option key={l} value={l}>{l}</option>)}
                                                    </select>
                                                </td>
                                            )}
                                            {(isEntry || (mode === 'both' && nfeData.tipo === 'E')) && (
                                                <td>
                                                    <div style={{display: 'flex', alignItems: 'center', gap: '4px'}}>
                                                        <select className="form-select"
                                                            value={st.category || ''}
                                                            onChange={e => updateItemState(idx, { category: e.target.value })}
                                                            style={{padding: '4px 8px', fontSize: '12px', minWidth: '100px'}}>
                                                            <option value="">Sem cat.</option>
                                                            {(categories || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                                        </select>
                                                        {onAddCategory && (
                                                            <button type="button"
                                                                onClick={() => setShowInlineCatForm(true)}
                                                                style={{padding: '4px 8px', fontSize: '13px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', cursor: 'pointer', background: 'var(--bg-primary)', minWidth: 'auto'}}
                                                                title="Criar nova categoria">+</button>
                                                        )}
                                                    </div>
                                                </td>
                                            )}
                                            <td>
                                                <input type="text" className="form-input" placeholder="Observacoes..."
                                                    value={st.observations || ''}
                                                    onChange={e => updateItemState(idx, { observations: e.target.value })}
                                                    style={{padding: '4px 8px', fontSize: '12px', minWidth: '100px'}} />
                                            </td>
                                            <td>
                                                {st.alreadyRegistered ? (
                                                    <span className="badge badge-warning" style={{fontSize: '10px'}}>Ja registrado</span>
                                                ) : st.linkedProduct ? (
                                                    <span className="badge badge-success" style={{fontSize: '10px'}}>Vinculado</span>
                                                ) : (
                                                    <span className="badge badge-danger" style={{fontSize: '10px'}}>Sem vinculo</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Action bar */}
                    <div style={{padding: '16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                        <div style={{fontSize: '13px', color: 'var(--text-secondary)'}}>
                            {itemStates.filter(s => s.selected && s.linkedSku).length} de {nfeData.itens?.length || 0} item(ns) selecionado(s)
                        </div>
                        <div style={{display: 'flex', gap: '8px'}}>
                            <button className="btn btn-secondary" onClick={() => { setNfeData(null); setItemStates([]); }}>
                                Cancelar
                            </button>
                            <button className="btn btn-primary" onClick={handleConfirm} disabled={saving}>
                                {saving ? 'Registrando...' : (
                                    (isEntry || (mode === 'both' && nfeData.tipo === 'E'))
                                        ? 'Registrar Entrada'
                                        : 'Registrar Saida'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Mini-form criar categoria inline */}
            {showInlineCatForm && onAddCategory && (
                <div className="modal-overlay" onClick={() => setShowInlineCatForm(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: '360px'}}>
                        <h3 style={{margin: '0 0 16px'}}>Nova Categoria</h3>
                        <div className="form-group">
                            <label className="form-label">Nome *</label>
                            <input className="form-input" value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="Ex: Abajur, Pendentes..." />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Cor</label>
                            <input type="color" value={newCatColor} onChange={e => setNewCatColor(e.target.value)} style={{width: '100%', height: '36px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', cursor: 'pointer'}} />
                        </div>
                        <div className="btn-group" style={{marginTop: '16px'}}>
                            <button className="btn btn-primary" onClick={handleInlineCreateCategory} disabled={!newCatName.trim()}>Criar</button>
                            <button className="btn btn-secondary" onClick={() => { setShowInlineCatForm(false); setNewCatName(''); }}>Cancelar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Vincular Produto */}
            {showVincularModal !== null && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{maxWidth: '600px'}}>
                        <h2 className="modal-title">Vincular Produto do Estoque</h2>
                        <p className="modal-subtitle">
                            Produto da NF: <strong>{nfeData?.itens?.[showVincularModal]?.descricao}</strong>
                        </p>
                        <div style={{fontSize: '11px', color: 'var(--text-muted)', marginBottom: '16px'}}>
                            Codigo NF: <code>{nfeData?.itens?.[showVincularModal]?.codigo}</code>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Buscar no estoque</label>
                            <input type="text" className="form-input" placeholder="Digite nome, SKU ou EAN..."
                                value={vincularSearch} onChange={e => setVincularSearch(e.target.value)} autoFocus />
                        </div>

                        <div style={{maxHeight: '300px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)', marginBottom: '16px'}}>
                            {(stock || sortedProducts).filter(s => {
                                if (!vincularSearch) return true;
                                const search = vincularSearch.toLowerCase();
                                return (s.name || '').toLowerCase().includes(search) ||
                                       (s.sku || '').toLowerCase().includes(search) ||
                                       (s.ean || '').toLowerCase().includes(search);
                            }).map(s => (
                                <div key={s.sku || s.id}
                                    onClick={() => handleVincular(showVincularModal, s.sku)}
                                    style={{padding: '12px', borderBottom: '1px solid var(--border)', cursor: 'pointer'}}
                                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-primary)'}
                                    onMouseLeave={e => e.currentTarget.style.background = ''}>
                                    <div style={{fontWeight: '500', marginBottom: '4px'}}>{s.name}</div>
                                    <div style={{fontSize: '11px', color: 'var(--text-muted)'}}>
                                        SKU: <strong>{s.sku}</strong>
                                        {s.ean && ` | EAN: ${s.ean}`}
                                        {s.currentQuantity !== undefined && (
                                            <span> | Estoque: <span style={{color: s.currentQuantity > 0 ? 'var(--success)' : 'var(--danger)'}}>{s.currentQuantity} un.</span></span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="btn-group">
                            <button className="btn btn-secondary" onClick={() => { setShowVincularModal(null); setVincularSearch(''); }}>
                                Cancelar
                            </button>
                            <button className="btn btn-primary" onClick={() => {
                                setNewProductData({
                                    name: nfeData?.itens?.[showVincularModal]?.descricao || '',
                                    sku: nfeData?.itens?.[showVincularModal]?.codigo || '',
                                    ean: '', category: '', observations: '',
                                });
                                setShowNewProductModal(showVincularModal);
                                setShowVincularModal(null);
                                setVincularSearch('');
                            }}>
                                Cadastrar Novo Produto
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Novo Produto */}
            {showNewProductModal !== null && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h2 className="modal-title">Cadastrar Novo Produto</h2>
                        <div className="form-group">
                            <label className="form-label">Nome *</label>
                            <input type="text" className="form-input" value={newProductData.name}
                                onChange={e => setNewProductData({...newProductData, name: e.target.value})} />
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">SKU *</label>
                                <input type="text" className="form-input" value={newProductData.sku}
                                    onChange={e => setNewProductData({...newProductData, sku: e.target.value})} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">EAN</label>
                                <input type="text" className="form-input" value={newProductData.ean}
                                    onChange={e => setNewProductData({...newProductData, ean: e.target.value})} />
                            </div>
                        </div>
                        {onAddCategory ? (
                            <CategorySelectInline
                                categories={categories}
                                value={newProductData.category}
                                onChange={(val) => setNewProductData({...newProductData, category: val})}
                                onAddCategory={onAddCategory}
                                onUpdateCategory={onUpdateCategory}
                                onDeleteCategory={onDeleteCategory}
                                products={stock}
                            />
                        ) : (
                            <div className="form-group">
                                <label className="form-label">Categoria *</label>
                                <select className="form-select" value={newProductData.category}
                                    onChange={e => setNewProductData({...newProductData, category: e.target.value})}>
                                    <option value="">Selecione...</option>
                                    {(categories || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                        )}
                        <div className="form-group">
                            <label className="form-label">Observacoes</label>
                            <input type="text" className="form-input" value={newProductData.observations}
                                onChange={e => setNewProductData({...newProductData, observations: e.target.value})} />
                        </div>
                        <div className="btn-group" style={{marginTop: '16px'}}>
                            <button className="btn btn-primary" onClick={handleCreateProduct}>Cadastrar e Vincular</button>
                            <button className="btn btn-secondary" onClick={() => setShowNewProductModal(null)}>Cancelar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
