/**
 * TinyNFeImport.jsx — Import NF-e from Tiny ERP via Edge Function
 *
 * Supports two modes:
 *   - Individual: single NF lookup (original flow)
 *   - Lote (batch): multiple NFs with sequential fetch + editing queue
 *
 * Extracted from index-legacy.html L9310-10001
 * CRITICAL: Uses normalizeNfKey/getEstoquePorNF from @/utils/fifo (NOT duplicated)
 * CRITICAL: onPrepareShipping prop — when present and mode is exit,
 *           fills shipping form instead of creating exits directly
 */
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { supabaseClient, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/config/supabase';
import { getEstoquePorNF } from '@/utils/fifo';
import CategorySelectInline from '@/components/ui/CategorySelectInline';
import { useBatchImport, BATCH_MAX_NFS, BATCH_FETCH_TIMEOUT_MS } from '@/hooks/useBatchImport';

export default function TinyNFeImport({ products, onSubmitEntry, onSubmitExit, onAddProduct, categories, locaisOrigem, onUpdateLocais, entries, exits, stock, mode, onAddCategory, onUpdateCategory, onDeleteCategory, onPrepareShipping, checkNfDuplicate, isDevolucao = false }) {
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

    // Devolução-specific state
    const [devMotivo, setDevMotivo] = useState('');
    const [devHubDestino, setDevHubDestino] = useState(locaisOrigem?.[0] || '');

    // Batch mode state
    const [importMode, setImportMode] = useState('single');
    const [batchConfirmedCount, setBatchConfirmedCount] = useState(0);
    const batch = useBatchImport();

    const isEntry = mode === 'entry' || (mode === 'both' && nfeData?.tipo === 'E');
    const isExit = mode === 'exit' || (mode === 'both' && nfeData?.tipo === 'S');
    const isBatchEditing = importMode === 'batch' && batch.batchPhase === 'editing';

    // ─── Shared: build itemStates from raw nfe data ──────────────────────
    const buildItemStatesFromNfe = useCallback((nfe) => {
        const nfStr = String(nfe.numero);
        const isExitNfe = mode === 'exit' || (mode === 'both' && nfe.tipo === 'S');
        return (nfe.itens || []).map(item => {
            const matched = products.find(p =>
                (p.sku || '').toLowerCase() === (item.codigo || '').toLowerCase() ||
                (p.ean && p.ean === item.codigo)
            );
            const alreadyInEntries = entries.some(e => e.nf === nfStr && (e.sku === item.codigo || (matched && e.sku === matched.sku)));
            const alreadyInExits = exits.some(e => e.nf === nfStr && (e.sku === item.codigo || (matched && e.sku === matched.sku)));
            const alreadyRegistered = alreadyInEntries || alreadyInExits;

            return {
                selected: !alreadyRegistered,
                linkedSku: matched?.sku || '',
                linkedProduct: matched || null,
                quantity: Math.round(item.quantidade) || 1,
                localEntrada: locaisOrigem?.[0] || 'Loja Principal',
                observations: '',
                category: matched?.category || '',
                alreadyRegistered,
                baixarEstoque: !isDevolucao && !!matched && isExitNfe,
                nfOrigem: '',
            };
        });
    }, [products, entries, exits, mode, locaisOrigem, isDevolucao]);

    // ─── Single mode: fetch NF ───────────────────────────────────────────
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
            setItemStates(buildItemStatesFromNfe(nfe));
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    // ─── Batch mode: pure fetch (no state side effects) ──────────────────
    const fetchSingleNFe = useCallback(async (nfNum) => {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) throw new Error('Sessao expirada.');

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), BATCH_FETCH_TIMEOUT_MS);

        try {
            const resp = await fetch(`${SUPABASE_URL}/functions/v1/tiny-sync-nfe`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json',
                    'apikey': SUPABASE_ANON_KEY,
                },
                body: JSON.stringify({ action: 'fetch', nf_number: nfNum.trim() }),
                signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (!resp.ok) {
                const err = await resp.json().catch(() => ({}));
                throw new Error(err.error || `Erro ${resp.status}`);
            }
            const data = await resp.json();
            if (!data.notas || data.notas.length === 0) {
                throw new Error(`NF ${nfNum} nao encontrada no Tiny.`);
            }
            return data.notas[0];
        } catch (err) {
            clearTimeout(timeoutId);
            if (err.name === 'AbortError') {
                throw new Error(`Timeout ao buscar NF ${nfNum} (${BATCH_FETCH_TIMEOUT_MS / 1000}s)`);
            }
            throw err;
        }
    }, []);

    // Load batch item into component state for editing
    const loadBatchItem = useCallback((batchItem) => {
        if (!batchItem?.data) return;
        const nfe = batchItem.data;
        setNfeData(nfe);
        setItemStates(buildItemStatesFromNfe(nfe));
        setNfNumber(String(nfe.numero || batchItem.nf));
        setError('');
        setSuccess('');
    }, [buildItemStatesFromNfe]);

    // Effect: load batch item when editing phase starts or advances
    useEffect(() => {
        if (batch.batchPhase === 'editing' && batch.currentEditItem) {
            loadBatchItem(batch.currentEditItem);
        }
        if (batch.batchPhase === 'completed') {
            setNfeData(null);
            setItemStates([]);
            setNfNumber('');
        }
    }, [batch.batchPhase, batch.editIndex]); // eslint-disable-line react-hooks/exhaustive-deps

    // Duplicate detection for confirming phase
    const existingNfNumbers = useMemo(() => {
        const nfs = new Set();
        (entries || []).forEach(e => { if (e.nf) nfs.add(String(e.nf)); });
        (exits || []).forEach(e => { if (e.nf) nfs.add(String(e.nf)); });
        return nfs;
    }, [entries, exits]);

    // ─── Shared helpers ──────────────────────────────────────────────────

    const updateItemState = (idx, updates) => {
        setItemStates(prev => prev.map((s, i) => i === idx ? { ...s, ...updates } : s));
    };

    const handleVincular = (idx, sku) => {
        const prod = products.find(p => (p.sku || '').toLowerCase() === (sku || '').toLowerCase());
        updateItemState(idx, {
            linkedSku: sku,
            linkedProduct: prod || null,
            baixarEstoque: !isDevolucao && !!prod && isExit,
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
                baixarEstoque: !isDevolucao && isExit,
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

    // ─── handleConfirm (batch-aware) ─────────────────────────────────────

    const handleConfirm = async () => {
        const selectedItems = itemStates
            .map((s, i) => ({ ...s, item: nfeData.itens[i], index: i }))
            .filter(s => s.selected && s.linkedSku);

        if (selectedItems.length === 0) {
            setError('Selecione ao menos um item com produto vinculado.');
            return;
        }

        // Validar campos obrigatórios de devolução
        if (isDevolucao && !devMotivo) {
            setError('Selecione o motivo da devolução.');
            return;
        }

        // Validar quantidades vs estoque disponivel por NF de origem
        if (isExit && !isDevolucao) {
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

        // Se tem callback de preparar shipping (contexto Despachos/Separacao),
        // desviar para o formulario em vez de criar exits direto
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

            const prepareOptions = isBatchEditing ? { batchMode: true } : {};
            if (isBatchEditing) setSaving(true);
            setError('');

            try {
                const shippingPayload = {
                    nfNumero: String(nfeData.numero || ''),
                    cliente: nfeData.cliente?.nome || '',
                    destino: nfeData.cliente?.endereco || '',
                    produtos: produtos,
                };
                if (isDevolucao) {
                    shippingPayload.motivoDevolucao = devMotivo;
                    shippingPayload.hubDestino = devHubDestino;
                }
                const result = await onPrepareShipping(shippingPayload, prepareOptions);

                // Cancelled by user (single mode duplicate check)
                if (result === false) return;

                // Batch mode: advance queue after successful save
                if (isBatchEditing) {
                    setBatchConfirmedCount(prev => prev + 1);
                    batch.advanceQueue();
                    return;
                }

                // Single mode: clear state
                setNfeData(null);
                setItemStates([]);
                setNfNumber('');
                setSuccess(isDevolucao ? 'Devolução registrada com sucesso!' : 'NF importada! Preencha os dados do despacho.');
                setTimeout(() => setSuccess(''), 5000);
            } catch (err) {
                setError('Erro ao salvar: ' + err.message);
            } finally {
                if (isBatchEditing) setSaving(false);
            }
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

            // Batch mode: advance queue instead of clearing
            if (isBatchEditing) {
                setBatchConfirmedCount(prev => prev + 1);
                setSuccess(`${count} item(ns) registrado(s)!`);
                batch.advanceQueue();
                setSaving(false);
                return;
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

    // ─── Mode switching helpers ──────────────────────────────────────────

    const handleSwitchToSingle = () => {
        setImportMode('single');
        batch.resetBatch();
        setBatchConfirmedCount(0);
        setNfeData(null);
        setItemStates([]);
        setNfNumber('');
        setError('');
        setSuccess('');
    };

    const handleSwitchToBatch = () => {
        setImportMode('batch');
        setNfeData(null);
        setItemStates([]);
        setNfNumber('');
        setError('');
        setSuccess('');
        setBatchConfirmedCount(0);
    };

    const handleBatchSkip = () => {
        setNfeData(null);
        setItemStates([]);
        batch.skipCurrent();
    };

    const handleBatchCancel = () => {
        setNfeData(null);
        setItemStates([]);
        setNfNumber('');
        setBatchConfirmedCount(0);
        batch.cancelBatch();
    };

    const sortedProducts = [...products].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    return (
        <div style={{marginBottom: '24px'}}>
            {/* ─── Mode toggle ──────────────────────────────────────── */}
            <div className="filter-tabs" style={{ marginBottom: '16px' }}>
                <button
                    className={`filter-tab ${importMode === 'single' ? 'active' : ''}`}
                    onClick={handleSwitchToSingle}
                >
                    Individual
                </button>
                <button
                    className={`filter-tab ${importMode === 'batch' ? 'active' : ''}`}
                    onClick={handleSwitchToBatch}
                >
                    Lote
                </button>
            </div>

            {/* ─── Single mode: search bar ──────────────────────────── */}
            {importMode === 'single' && (
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
            )}

            {/* ─── Batch mode: idle — textarea input ────────────────── */}
            {importMode === 'batch' && batch.batchPhase === 'idle' && (
                <div style={{ marginBottom: '16px' }}>
                    <label className="form-label">Numeros das NFs (separados por virgula, ponto e virgula, espaco ou quebra de linha)</label>
                    <textarea
                        className="form-input"
                        placeholder={"Ex: 2305, 2306, 2307\nOu uma NF por linha"}
                        value={batch.rawInput}
                        onChange={e => batch.setRawInput(e.target.value)}
                        rows={4}
                        style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: '13px' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            Maximo {BATCH_MAX_NFS} NFs por lote
                        </span>
                        <button
                            className="btn btn-primary"
                            onClick={() => {
                                const result = batch.prepareBatch();
                                if (result.error) setError(result.error);
                                else setError('');
                            }}
                            disabled={!batch.rawInput.trim()}
                        >
                            Preparar Lote
                        </button>
                    </div>
                </div>
            )}

            {/* ─── Batch mode: confirming — parsed NF list ──────────── */}
            {importMode === 'batch' && batch.batchPhase === 'confirming' && (
                <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '12px' }}>
                        Confirmar NFs para buscar ({batch.parsedNfs.length} NF{batch.parsedNfs.length !== 1 ? 's' : ''})
                    </div>
                    <div style={{
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-md)',
                        overflow: 'hidden',
                        marginBottom: '12px',
                    }}>
                        {batch.parsedNfs.map((nf, idx) => {
                            const duplicateInfo = checkNfDuplicate
                                ? checkNfDuplicate(nf)
                                : (existingNfNumbers.has(nf) ? { label: 'Ja registrada' } : null);
                            return (
                                <div key={idx} style={{
                                    padding: '10px 14px',
                                    borderBottom: idx < batch.parsedNfs.length - 1 ? '1px solid var(--border)' : 'none',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    background: duplicateInfo ? '#fef3c7' : 'transparent',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500, minWidth: '24px' }}>
                                            {idx + 1}.
                                        </span>
                                        <span style={{ fontWeight: 500, fontSize: '13px' }}>NF {nf}</span>
                                    </div>
                                    {duplicateInfo && (
                                        <span className="badge badge-warning" style={{ fontSize: '10px' }}>
                                            {duplicateInfo.label}
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                        <button className="btn btn-secondary" onClick={() => batch.resetBatch()}>
                            Voltar
                        </button>
                        <button
                            className="btn btn-primary"
                            onClick={() => {
                                setError('');
                                batch.startBatchFetch(fetchSingleNFe);
                            }}
                        >
                            Buscar {batch.parsedNfs.length} NF{batch.parsedNfs.length !== 1 ? 's' : ''}
                        </button>
                    </div>
                </div>
            )}

            {/* ─── Batch mode: fetching — progress bar ──────────────── */}
            {importMode === 'batch' && batch.batchPhase === 'fetching' && (
                <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '8px' }}>
                        Buscando NFs no Tiny...
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                        NF {batch.fetchProgress.currentNf} ({batch.fetchProgress.current} de {batch.fetchProgress.total})
                    </div>
                    <div style={{
                        width: '100%',
                        height: '8px',
                        background: 'var(--bg-secondary)',
                        borderRadius: '4px',
                        overflow: 'hidden',
                        marginBottom: '8px',
                    }}>
                        <div style={{
                            width: `${batch.fetchProgress.total > 0 ? (batch.fetchProgress.current / batch.fetchProgress.total) * 100 : 0}%`,
                            height: '100%',
                            background: 'var(--accent)',
                            borderRadius: '4px',
                            transition: 'width 0.3s ease',
                        }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            {batch.fetchProgress.total > 0 ? Math.round((batch.fetchProgress.current / batch.fetchProgress.total) * 100) : 0}%
                        </span>
                        <button className="btn btn-secondary" onClick={batch.cancelFetch} style={{ fontSize: '12px' }}>
                            Cancelar
                        </button>
                    </div>
                </div>
            )}

            {/* ─── Batch mode: summary — results ────────────────────── */}
            {importMode === 'batch' && batch.batchPhase === 'summary' && (
                <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '8px' }}>
                        Resultado da busca
                    </div>
                    {(() => {
                        const successCount = batch.fetchResults.filter(r => r.success).length;
                        const errorCount = batch.fetchResults.filter(r => !r.success).length;
                        return (
                            <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', fontSize: '13px' }}>
                                {successCount > 0 && (
                                    <span style={{ color: 'var(--success)', fontWeight: 500 }}>
                                        {successCount} encontrada{successCount !== 1 ? 's' : ''}
                                    </span>
                                )}
                                {errorCount > 0 && (
                                    <span style={{ color: 'var(--danger)', fontWeight: 500 }}>
                                        {errorCount} com erro
                                    </span>
                                )}
                            </div>
                        );
                    })()}
                    <div style={{
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-md)',
                        overflow: 'hidden',
                        marginBottom: '12px',
                    }}>
                        {batch.fetchResults.map((r, idx) => (
                            <div key={idx} style={{
                                padding: '10px 14px',
                                borderBottom: idx < batch.fetchResults.length - 1 ? '1px solid var(--border)' : 'none',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                background: r.success ? 'transparent' : '#fee2e2',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '14px', color: r.success ? 'var(--success)' : 'var(--danger)' }}>
                                        {r.success ? '\u2713' : '\u2717'}
                                    </span>
                                    <span style={{ fontWeight: 500, fontSize: '13px' }}>NF {r.nf}</span>
                                    {r.success && r.data?.cliente?.nome && (
                                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                            — {r.data.cliente.nome}
                                        </span>
                                    )}
                                </div>
                                {!r.success && (
                                    <span style={{ fontSize: '11px', color: 'var(--danger)' }}>
                                        {r.error}
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                        <button className="btn btn-secondary" onClick={batch.resetBatch}>
                            Cancelar
                        </button>
                        {batch.fetchResults.some(r => r.success) && (
                            <button
                                className="btn btn-primary"
                                onClick={() => {
                                    setBatchConfirmedCount(0);
                                    batch.startEditing();
                                }}
                            >
                                Editar {batch.fetchResults.filter(r => r.success).length} NF{batch.fetchResults.filter(r => r.success).length !== 1 ? 's' : ''}
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* ─── Batch mode: completed ────────────────────────────── */}
            {importMode === 'batch' && batch.batchPhase === 'completed' && (
                <div style={{
                    textAlign: 'center',
                    padding: '40px 20px',
                    marginBottom: '16px',
                }}>
                    <div style={{ fontSize: '32px', marginBottom: '8px', color: 'var(--success)' }}>{'\u2713'}</div>
                    <div style={{ fontWeight: 600, fontSize: '16px', marginBottom: '4px', color: 'var(--success)' }}>
                        Lote concluido!
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
                        {batchConfirmedCount} NF{batchConfirmedCount !== 1 ? 's' : ''} processada{batchConfirmedCount !== 1 ? 's' : ''} com sucesso
                        {batch.editQueue.length - batchConfirmedCount > 0 && (
                            <span>, {batch.editQueue.length - batchConfirmedCount} pulada{batch.editQueue.length - batchConfirmedCount !== 1 ? 's' : ''}</span>
                        )}
                    </div>
                    <button className="btn btn-primary" onClick={() => {
                        batch.resetBatch();
                        setBatchConfirmedCount(0);
                    }}>
                        Nova Importacao em Lote
                    </button>
                </div>
            )}

            {/* ─── Batch editing: progress header ───────────────────── */}
            {isBatchEditing && (
                <div style={{
                    marginBottom: '12px',
                    padding: '10px 14px',
                    background: 'var(--bg-secondary)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border)',
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontWeight: 600, fontSize: '14px' }}>
                            Editando NF {batch.editIndex + 1} de {batch.editQueue.length}
                        </span>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            NF {batch.currentEditItem?.nf}
                        </span>
                    </div>
                    <div style={{
                        width: '100%',
                        height: '4px',
                        background: '#e5e7eb',
                        borderRadius: '2px',
                        overflow: 'hidden',
                    }}>
                        <div style={{
                            width: `${((batch.editIndex + 1) / batch.editQueue.length) * 100}%`,
                            height: '100%',
                            background: 'var(--accent)',
                            borderRadius: '2px',
                            transition: 'width 0.3s ease',
                        }} />
                    </div>
                </div>
            )}

            {/* ─── Alerts ───────────────────────────────────────────── */}
            {error && <div className="alert alert-danger" style={{marginBottom: '12px'}}>{error}</div>}
            {success && <div className="alert alert-success" style={{marginBottom: '12px'}}>{success}</div>}

            {/* ─── NF-e Preview (shared between single and batch editing) ── */}
            {nfeData && (importMode === 'single' || isBatchEditing) && (
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
                            <span className={`badge ${isDevolucao ? 'badge-info' : (nfeData.tipo === 'E' ? 'badge-success' : 'badge-danger')}`} style={{fontSize: '12px'}}>
                                {isDevolucao ? 'Devolução' : (nfeData.tipo === 'E' ? 'Entrada' : 'Saida')}
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
                                    {isExit && !isDevolucao && <th style={{minWidth: '140px'}}>Estoque</th>}
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
                                            {isExit && !isDevolucao && (
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

                    {/* Devolução fields */}
                    {isDevolucao && (
                        <div style={{padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)'}}>
                            <div className="form-row" style={{gap: '12px'}}>
                                <div className="form-group" style={{flex: 1, marginBottom: 0}}>
                                    <label className="form-label" style={{fontSize: '12px'}}>Motivo da Devolução *</label>
                                    <select
                                        className="form-select"
                                        value={devMotivo}
                                        onChange={e => setDevMotivo(e.target.value)}
                                        style={{fontSize: '13px'}}
                                    >
                                        <option value="">Selecione...</option>
                                        <option value="Defeito">Defeito</option>
                                        <option value="Arrependimento">Arrependimento</option>
                                        <option value="Produto errado">Produto errado</option>
                                        <option value="Avaria no transporte">Avaria no transporte</option>
                                        <option value="Outro">Outro</option>
                                    </select>
                                </div>
                                <div className="form-group" style={{flex: 1, marginBottom: 0}}>
                                    <label className="form-label" style={{fontSize: '12px'}}>HUB Destino</label>
                                    <select
                                        className="form-select"
                                        value={devHubDestino}
                                        onChange={e => setDevHubDestino(e.target.value)}
                                        style={{fontSize: '13px'}}
                                    >
                                        <option value="">Selecione...</option>
                                        {(locaisOrigem || []).map(l => (
                                            <option key={l} value={l}>{l}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Action bar */}
                    <div style={{padding: '16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px'}}>
                        <div style={{fontSize: '13px', color: 'var(--text-secondary)'}}>
                            {itemStates.filter(s => s.selected && s.linkedSku).length} de {nfeData.itens?.length || 0} item(ns) selecionado(s)
                        </div>
                        <div style={{display: 'flex', gap: '8px', flexWrap: 'wrap'}}>
                            {isBatchEditing ? (
                                <>
                                    <button className="btn btn-secondary" onClick={handleBatchSkip} style={{ fontSize: '12px' }}>
                                        Pular
                                    </button>
                                    <button
                                        className="btn btn-secondary"
                                        onClick={handleBatchCancel}
                                        style={{ fontSize: '12px', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                                    >
                                        Cancelar Lote
                                    </button>
                                    <button className="btn btn-primary" onClick={handleConfirm} disabled={saving}>
                                        {saving ? 'Registrando...' : (
                                            batch.editIndex + 1 >= batch.editQueue.length
                                                ? 'Confirmar e Finalizar'
                                                : 'Confirmar e Proxima'
                                        )}
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button className="btn btn-secondary" onClick={() => { setNfeData(null); setItemStates([]); }}>
                                        Cancelar
                                    </button>
                                    <button className="btn btn-primary" onClick={handleConfirm} disabled={saving}>
                                        {saving ? 'Registrando...' : (
                                            isDevolucao
                                                ? 'Registrar Devolução'
                                                : (isEntry || (mode === 'both' && nfeData.tipo === 'E'))
                                                    ? 'Registrar Entrada'
                                                    : 'Registrar Saida'
                                        )}
                                    </button>
                                </>
                            )}
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
