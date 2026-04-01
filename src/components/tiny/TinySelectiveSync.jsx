/**
 * TinySelectiveSync.jsx — Selective product sync from Tiny ERP
 *
 * Two modes: search existing products by name/SKU, or enter SKUs manually.
 * Calls tiny-sync-product-single Edge Function for each product.
 */
import React, { useState, useRef } from 'react';
import { Icon } from '@/utils/icons';
import { supabaseClient } from '@/config/supabase';
import { callTinyFunction, normalizeTinyError } from '@/services/tinyService';

const MAX_PRODUCTS_PER_BATCH = 20;
const DELAY_BETWEEN_CALLS_MS = 1000;
const RETRY_DELAY_MS = 5000;

export default function TinySelectiveSync({ products, syncLock, onDataChanged }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const [manualSkus, setManualSkus] = useState('');
    const [selectedProducts, setSelectedProducts] = useState([]); // { sku, name, isNew }
    const [syncing, setSyncing] = useState(false);
    const [progress, setProgress] = useState(null); // { current, total, currentSku, status, message }
    const [result, setResult] = useState(null); // { updated, errors: [{ sku, error }] }
    const searchTimeoutRef = useRef(null);
    const dropdownRef = useRef(null);

    // Search products in local DB
    const handleSearch = (term) => {
        setSearchTerm(term);
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

        if (!term || term.length < 2) {
            setSearchResults([]);
            setShowDropdown(false);
            return;
        }

        searchTimeoutRef.current = setTimeout(() => {
            const lower = term.toLowerCase();
            const matches = (products || [])
                .filter(p =>
                    p.name.toLowerCase().includes(lower) ||
                    (p.sku && p.sku.toLowerCase().includes(lower))
                )
                .slice(0, 10);
            setSearchResults(matches);
            setShowDropdown(matches.length > 0);
        }, 200);
    };

    const addProduct = (product) => {
        if (selectedProducts.some(p => p.sku === product.sku)) return;
        setSelectedProducts(prev => [...prev, { sku: product.sku, name: product.name, tinyId: product.tinyId || '', isNew: false }]);
        setSearchTerm('');
        setShowDropdown(false);
    };

    const removeProduct = (sku) => {
        setSelectedProducts(prev => prev.filter(p => p.sku !== sku));
    };

    const addManualSkus = () => {
        if (!manualSkus.trim()) return;
        const skus = manualSkus
            .split(/[,;\n]+/)
            .map(s => s.trim())
            .filter(s => s.length > 0);

        const newEntries = skus
            .filter(sku => !selectedProducts.some(p => p.sku === sku))
            .map(sku => {
                const existing = (products || []).find(p => p.sku === sku);
                return {
                    sku,
                    name: existing ? existing.name : null,
                    isNew: !existing,
                };
            });

        setSelectedProducts(prev => [...prev, ...newEntries]);
        setManualSkus('');
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addManualSkus();
        }
    };

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    const handleSync = async () => {
        if (selectedProducts.length === 0 || syncing || syncLock) return;

        // Check for running full sync
        const { data: runningSync } = await supabaseClient
            .from('sync_log')
            .select('id')
            .eq('status', 'running')
            .limit(1)
            .maybeSingle();

        if (runningSync) {
            setResult({ updated: 0, errors: [{ sku: '-', error: 'Sincronizacao completa em andamento. Aguarde a conclusao.' }] });
            return;
        }

        setSyncing(true);
        setResult(null);
        const errors = [];
        let updated = 0;

        for (let i = 0; i < selectedProducts.length; i++) {
            const { sku, tinyId } = selectedProducts[i];
            setProgress({ current: i + 1, total: selectedProducts.length, currentSku: sku, status: 'running' });

            try {
                const payload = tinyId ? { tiny_id: tinyId, sku } : { sku };
                const data = await callTinyFunction('tiny-sync-product-single', payload);
                if (!data.success) {
                    errors.push({ sku, error: data.error || 'Erro desconhecido' });
                    if (i < selectedProducts.length - 1) await sleep(DELAY_BETWEEN_CALLS_MS);
                    continue;
                }

                // Upsert product in Supabase
                const prod = data.product;
                const upsertData = {
                    name: prod.name,
                    sku: prod.sku,
                    ean: prod.ean || '',
                    category: prod.category || '',
                    unit_price: prod.unit_price || 0,
                    tiny_id: prod.tiny_id || '',
                    observations: prod.observations || '',
                    imagem_url: prod.imagem_url || '',
                };

                // Check if product exists
                const { data: existing } = await supabaseClient
                    .from('products')
                    .select('id')
                    .eq('sku', prod.sku)
                    .maybeSingle();

                if (existing) {
                    await supabaseClient.from('products').update(upsertData).eq('id', existing.id);
                } else {
                    await supabaseClient.from('products').insert({ ...upsertData, min_stock: 3 });
                }

                updated++;
            } catch (err) {
                const msg = normalizeTinyError(err.message);
                errors.push({ sku, error: msg });

                // If rate limited, wait longer
                if (err.message?.includes('429')) {
                    await sleep(RETRY_DELAY_MS);
                }
            }

            if (i < selectedProducts.length - 1) {
                await sleep(DELAY_BETWEEN_CALLS_MS);
            }
        }

        setProgress(null);
        setResult({ updated, errors });
        setSyncing(false);
        if (updated > 0) {
            setSelectedProducts([]);
            if (onDataChanged) await onDataChanged();
        }
    };

    const isOverLimit = selectedProducts.length > MAX_PRODUCTS_PER_BATCH;

    return (
        <div style={{
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius)',
            padding: '20px',
            background: 'var(--bg-primary)',
            marginTop: '16px',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                <div style={{
                    width: '36px', height: '36px', borderRadius: 'var(--radius-sm)',
                    background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                    <Icon name="search" size={18} style={{ color: '#d97706' }} />
                </div>
                <div>
                    <div style={{ fontWeight: '600', fontSize: '14px' }}>Atualizar Produtos Especificos</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Busque por nome ou digite SKUs para atualizar do Tiny</div>
                </div>
            </div>

            {/* Search by name/SKU */}
            <div style={{ position: 'relative', marginBottom: '12px' }}>
                <label style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>
                    Buscar produto existente
                </label>
                <input
                    type="text"
                    className="form-input"
                    placeholder="Nome ou SKU do produto..."
                    value={searchTerm}
                    onChange={(e) => handleSearch(e.target.value)}
                    onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
                    onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                    disabled={syncing}
                    style={{ fontSize: '13px' }}
                />
                {showDropdown && searchResults.length > 0 && (
                    <div ref={dropdownRef} style={{
                        position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                        background: 'white', border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-sm)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                        maxHeight: '200px', overflowY: 'auto',
                    }}>
                        {searchResults.map(p => (
                            <div
                                key={p.id}
                                onMouseDown={() => addProduct(p)}
                                style={{
                                    padding: '8px 12px', cursor: 'pointer', fontSize: '13px',
                                    borderBottom: '1px solid #f3f4f6',
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                            >
                                <span style={{ fontWeight: '500' }}>{p.name}</span>
                                <span style={{ fontSize: '11px', color: 'var(--text-muted)', flexShrink: 0, marginLeft: '8px' }}>{p.sku}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Manual SKU entry */}
            <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>
                    SKUs manuais
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <textarea
                        className="form-input"
                        placeholder="SKU-001, SKU-002 (separar por virgula ou nova linha)"
                        value={manualSkus}
                        onChange={(e) => setManualSkus(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={syncing}
                        rows={2}
                        style={{ fontSize: '13px', resize: 'vertical', flex: 1 }}
                    />
                    <button
                        className="btn btn-secondary"
                        onClick={addManualSkus}
                        disabled={syncing || !manualSkus.trim()}
                        style={{ alignSelf: 'flex-end', fontSize: '12px' }}
                    >
                        Adicionar
                    </button>
                </div>
            </div>

            {/* Selected products list */}
            {selectedProducts.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                        Produtos selecionados ({selectedProducts.length})
                        {isOverLimit && (
                            <span style={{ color: 'var(--accent-error)', marginLeft: '8px' }}>
                                Maximo {MAX_PRODUCTS_PER_BATCH} por vez
                            </span>
                        )}
                    </div>
                    <div style={{
                        border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)',
                        maxHeight: '160px', overflowY: 'auto',
                    }}>
                        {selectedProducts.map(p => (
                            <div key={p.sku} style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '6px 10px', borderBottom: '1px solid #f3f4f6', fontSize: '13px',
                            }}>
                                <div>
                                    <span style={{ fontWeight: '500' }}>{p.sku}</span>
                                    {p.name && <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>— {p.name}</span>}
                                    {p.isNew && (
                                        <span style={{
                                            marginLeft: '8px', fontSize: '10px', color: '#d97706',
                                            background: '#fef3c7', padding: '1px 6px', borderRadius: '4px',
                                        }}>
                                            novo
                                        </span>
                                    )}
                                </div>
                                {!syncing && (
                                    <button
                                        onClick={() => removeProduct(p.sku)}
                                        style={{
                                            background: 'none', border: 'none', cursor: 'pointer',
                                            color: 'var(--text-muted)', fontSize: '14px', padding: '2px 6px',
                                        }}
                                    >
                                        x
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Sync button */}
            <button
                className="btn btn-primary"
                style={{ width: '100%' }}
                onClick={handleSync}
                disabled={syncing || syncLock || selectedProducts.length === 0 || isOverLimit}
            >
                {syncing ? (
                    <><Icon name="spinner" size={14} style={{ animation: 'spin 1s linear infinite' }} /> <span style={{ marginLeft: '6px' }}>Atualizando...</span></>
                ) : (
                    <><Icon name="sync" size={14} /> <span style={{ marginLeft: '6px' }}>Atualizar Selecionados ({selectedProducts.length})</span></>
                )}
            </button>

            {/* Progress */}
            {progress && (
                <div style={{
                    marginTop: '10px', padding: '8px 12px',
                    borderRadius: 'var(--radius-xs)', background: 'var(--accent-bg)',
                    fontSize: '12px', color: 'var(--accent)', fontWeight: '500',
                }}>
                    {progress.current}/{progress.total} — Atualizando {progress.currentSku}...
                </div>
            )}

            {/* Result */}
            {result && (
                <div style={{
                    marginTop: '10px', padding: '10px 12px',
                    borderRadius: 'var(--radius-xs)',
                    background: result.errors.length === 0 ? 'var(--success-light)' : (result.updated > 0 ? '#fef3c7' : 'var(--danger-light)'),
                    fontSize: '12px',
                    color: result.errors.length === 0 ? 'var(--success-dark)' : (result.updated > 0 ? '#92400e' : 'var(--danger-dark)'),
                }}>
                    <div style={{ fontWeight: '500', marginBottom: result.errors.length > 0 ? '6px' : 0 }}>
                        {result.updated} produto{result.updated !== 1 ? 's' : ''} atualizado{result.updated !== 1 ? 's' : ''}
                        {result.errors.length > 0 && `, ${result.errors.length} erro${result.errors.length !== 1 ? 's' : ''}`}
                    </div>
                    {result.errors.length > 0 && (
                        <div style={{ fontSize: '11px', marginTop: '4px' }}>
                            {result.errors.map((e, i) => (
                                <div key={i}>{e.sku}: {e.error}</div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
