/**
 * TinySelectiveSync.jsx — Sync seletivo de produtos por SKU
 *
 * Admin-only. Delega o processamento para a Edge Function
 * `tiny-sync-selective`, que faz lookup, fetch e update para cada SKU
 * server-side. Retorna resultado detalhado (updated / not_found / error).
 *
 * UI:
 *  - Textarea único aceitando múltiplos separadores (quebra de linha,
 *    vírgula, ponto-e-vírgula, tab).
 *  - Contagem em tempo real "X SKUs detectados".
 *  - Validação: bloqueia se vazio ou > MAX_SKUS_PER_CALL.
 *  - Tabela de resultados com badges na paleta oficial.
 *  - Botão "Limpar resultados" reseta tudo.
 *
 * Props:
 *  - syncLock: boolean — desabilita botão quando sync completo está ativo.
 *  - onDataChanged: () => Promise — chamado após sucesso (refresh lista).
 */
import React, { useMemo, useState } from 'react';
import { Icon } from '@/utils/icons';
import { supabaseClient } from '@/config/supabase';

const MAX_SKUS_PER_CALL = 50;

/**
 * Parse uma string de SKUs aceitando múltiplos separadores.
 * Trim, deduplica (case-insensitive) e descarta vazios.
 * @param {string} raw
 * @returns {string[]}
 */
function parseSkus(raw) {
    if (!raw) return [];
    const tokens = raw.split(/[,;\t\n\r]+/);
    const seen = new Set();
    const result = [];
    for (const t of tokens) {
        const trimmed = t.trim();
        if (!trimmed) continue;
        const key = trimmed.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(trimmed);
    }
    return result;
}

const STATUS_BADGE = {
    updated:   { label: 'Atualizado',      color: '#39845f', bg: 'rgba(57,132,95,0.20)' },
    not_found: { label: 'Não encontrado',  color: '#6B7280', bg: 'rgba(180,180,180,0.20)' },
    error:     { label: 'Erro',            color: '#893030', bg: 'rgba(137,48,48,0.20)' },
};

export default function TinySelectiveSync({ syncLock, onDataChanged }) {
    const [rawInput, setRawInput] = useState('');
    const [running, setRunning] = useState(false);
    const [summary, setSummary] = useState(null); // { total, updated, not_found, errors, duration_ms, details }
    const [toast, setToast] = useState(null); // { type: 'info'|'error', message }

    const skus = useMemo(() => parseSkus(rawInput), [rawInput]);
    const overLimit = skus.length > MAX_SKUS_PER_CALL;
    const canSubmit = skus.length > 0 && !overLimit && !running && !syncLock;

    const handleSubmit = async () => {
        if (!canSubmit) return;

        setRunning(true);
        setSummary(null);
        setToast({ type: 'info', message: `Sincronizando ${skus.length} produto(s)...` });

        try {
            const { data, error } = await supabaseClient.functions.invoke('tiny-sync-selective', {
                body: { skus },
            });

            if (error) {
                // Supabase wraps the HTTP body; try to extract status/message
                const ctx = error.context || {};
                const status = ctx.status;
                let message = error.message || 'Erro desconhecido';
                try {
                    const body = ctx.body ? JSON.parse(ctx.body) : null;
                    if (body?.error) message = body.error;
                } catch { /* noop */ }

                if (status === 409) {
                    setToast({ type: 'error', message: 'Sync completo em andamento. Aguarde a conclusão.' });
                } else if (status === 403) {
                    setToast({ type: 'error', message: 'Sem permissão (admin only).' });
                } else {
                    setToast({ type: 'error', message });
                }
                return;
            }

            setSummary(data);
            setToast(null);

            // Se houve update, pedir refresh dos dados
            if (data?.updated > 0 && typeof onDataChanged === 'function') {
                try { await onDataChanged(); } catch (_e) { /* noop */ }
            }
        } catch (err) {
            setToast({ type: 'error', message: err.message || 'Erro de rede' });
        } finally {
            setRunning(false);
        }
    };

    const handleClear = () => {
        setRawInput('');
        setSummary(null);
        setToast(null);
    };

    return (
        <div style={{
            border: '1px solid var(--border-default)',
            borderRadius: '8px',
            padding: '20px',
            background: 'var(--bg-primary)',
            marginTop: '16px',
        }}>
            <div style={{ marginBottom: '16px' }}>
                <div style={{ fontWeight: 600, fontSize: '15px', marginBottom: '4px' }}>
                    Sincronização Seletiva
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                    Atualize produtos específicos por SKU sem rodar sync completo (máx {MAX_SKUS_PER_CALL} por vez).
                </div>
            </div>

            {/* Textarea de SKUs */}
            <div style={{ marginBottom: '8px' }}>
                <label
                    htmlFor="selective-sync-skus"
                    style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px', color: 'var(--text-secondary)' }}
                >
                    Cole os SKUs
                </label>
                <textarea
                    id="selective-sync-skus"
                    className="form-input"
                    placeholder="Um por linha, ou separados por vírgula / ponto-e-vírgula / tab"
                    value={rawInput}
                    onChange={(e) => setRawInput(e.target.value)}
                    disabled={running}
                    rows={5}
                    style={{ resize: 'vertical', fontSize: '13px', fontFamily: 'monospace' }}
                />
            </div>
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '12px',
                marginBottom: '12px',
                color: overLimit ? '#893030' : 'var(--text-muted)',
                fontWeight: overLimit ? 600 : 400,
            }}>
                <span>{skus.length} SKU{skus.length !== 1 ? 's' : ''} detectado{skus.length !== 1 ? 's' : ''}</span>
                {overLimit && <span>Máximo {MAX_SKUS_PER_CALL} SKUs por execução</span>}
            </div>

            {/* Ações */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <button
                    className="btn btn-primary"
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                    style={{ flex: 1 }}
                >
                    {running ? (
                        <><Icon name="spinner" size={14} style={{ animation: 'spin 1s linear infinite' }} /> <span style={{ marginLeft: 6 }}>Sincronizando...</span></>
                    ) : (
                        <><Icon name="sync" size={14} /> <span style={{ marginLeft: 6 }}>Sincronizar Selecionados</span></>
                    )}
                </button>
                {(summary || rawInput) && !running && (
                    <button
                        className="btn btn-secondary"
                        onClick={handleClear}
                        title="Limpar textarea e resultados"
                    >
                        Limpar resultados
                    </button>
                )}
            </div>

            {/* Toast */}
            {toast && (
                <div style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 500,
                    marginBottom: '12px',
                    background: toast.type === 'error' ? 'rgba(137,48,48,0.12)' : 'rgba(0,74,173,0.10)',
                    color: toast.type === 'error' ? '#893030' : '#004aad',
                    border: `1px solid ${toast.type === 'error' ? 'rgba(137,48,48,0.25)' : 'rgba(0,74,173,0.20)'}`,
                }}>
                    {toast.message}
                </div>
            )}

            {/* Resultados */}
            {summary && (
                <div>
                    <div style={{
                        fontSize: '13px',
                        fontWeight: 600,
                        marginBottom: '10px',
                        color: 'var(--text-primary)',
                    }}>
                        {summary.updated} atualizado{summary.updated !== 1 ? 's' : ''}
                        {' · '}
                        {summary.not_found} não encontrado{summary.not_found !== 1 ? 's' : ''}
                        {' · '}
                        {summary.errors} erro{summary.errors !== 1 ? 's' : ''}
                        {' · '}
                        {(summary.duration_ms / 1000).toFixed(1)}s
                    </div>

                    <div className="table-container" style={{
                        border: '1px solid var(--border-default)',
                        borderRadius: '8px',
                        overflow: 'hidden',
                        maxHeight: '320px',
                        overflowY: 'auto',
                    }}>
                        <table className="table" style={{ marginBottom: 0 }}>
                            <thead>
                                <tr>
                                    <th style={{ width: '35%' }}>SKU</th>
                                    <th style={{ width: '25%' }}>Status</th>
                                    <th>Mensagem</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(summary.details || []).map((d, i) => {
                                    const badge = STATUS_BADGE[d.status] || STATUS_BADGE.error;
                                    return (
                                        <tr key={i}>
                                            <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{d.sku}</td>
                                            <td>
                                                <span style={{
                                                    display: 'inline-block',
                                                    padding: '3px 10px',
                                                    borderRadius: '12px',
                                                    background: badge.bg,
                                                    color: badge.color,
                                                    fontSize: '11px',
                                                    fontWeight: 600,
                                                    whiteSpace: 'nowrap',
                                                }}>
                                                    {badge.label}
                                                </span>
                                            </td>
                                            <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                                {d.message}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
