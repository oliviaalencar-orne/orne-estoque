/**
 * ManualVerificationModal.jsx — Modal de verificação manual de rastreio.
 *
 * Fase 1 de Confiança de Rastreio: quando o operador/admin identifica
 * um envio com sinal 🟡/🔴, abre este modal para registrar uma decisão
 * manual — seja "já chegou ao cliente" ou "ainda está em trânsito,
 * está tudo certo". A decisão é persistida em `shippings.verificacao_manual`
 * (JSONB) SEM alterar o `status`, preservando o fluxo de rastreio.
 *
 * Estrutura gravada (shippings.verificacao_manual):
 *   {
 *     decisao: 'confirmado_entregue' | 'ainda_em_transito' | null,
 *     por_usuario_id: uuid | null,
 *     por_usuario_nome: string | null,
 *     por_usuario_role: 'admin' | 'operador' | null,
 *     data: ISO8601 | null,
 *     nota: string | null,
 *     historico: [{
 *       decisao, data, por_usuario_id, por_usuario_nome, nota,
 *       desfeito_em?, desfeito_por_id?, desfeito_por_nome?
 *     }]
 *   }
 *
 * Estado "desfeito": decisao=null com a verificação anterior empilhada
 * em historico (marcada com desfeito_em). O badge do envio volta a ser
 * calculado pela regra automática (confidence.js ignora decisao null).
 *
 * Permissões: somente admin+operador (controlado na origem — o botão
 * que abre este modal só aparece quando canEdit=true).
 */
import React, { useState, useMemo, useEffect } from 'react';
import * as Sentry from '@sentry/react';
import { supabaseClient } from '@/config/supabase';
import { classifyConfidence } from '@/utils/confidence';
import { getTransportadoraReal } from '@/utils/transportadora';

function formatDateBR(iso) {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
        return String(iso);
    }
}

function decisaoLabel(decisao) {
    if (decisao === 'confirmado_entregue') return 'confirmado entregue';
    if (decisao === 'ainda_em_transito') return 'ainda em trânsito';
    return decisao || '—';
}

function decisaoEmoji(decisao) {
    if (decisao === 'confirmado_entregue') return '✅';
    if (decisao === 'ainda_em_transito') return '📦';
    return '•';
}

export default function ManualVerificationModal({ shipping, onClose, onSaved }) {
    const [nota, setNota] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const conf = useMemo(() => classifyConfidence(shipping), [shipping]);
    const transportadora = getTransportadoraReal(shipping);
    const historico = shipping.verificacaoManual?.historico || [];

    // "Ativa" = verificação com decisão não-nula. Pós-undo, decisao=null
    // e o modal volta a oferecer os 2 botões de criação.
    const verificacaoAtiva = shipping.verificacaoManual?.decisao ? shipping.verificacaoManual : null;

    // Nome do autor da verificação ativa. Prefere o que foi gravado no JSONB;
    // faz lookup no user_profiles para registros legados (sem por_usuario_nome).
    const [autorNome, setAutorNome] = useState(verificacaoAtiva?.por_usuario_nome || null);

    useEffect(() => {
        if (!verificacaoAtiva || autorNome) return;
        const uid = verificacaoAtiva.por_usuario_id;
        if (!uid) return;
        let cancelled = false;
        supabaseClient
            .from('user_profiles')
            .select('nome, email')
            .eq('id', uid)
            .maybeSingle()
            .then(({ data }) => {
                if (cancelled) return;
                if (data?.nome) setAutorNome(data.nome);
                else if (data?.email) setAutorNome(data.email);
            })
            .catch(() => {
                // falha no lookup é silenciosa: seguimos sem nome
            });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [verificacaoAtiva?.por_usuario_id]);

    // Busca dados do usuário logado (id + nome + role) — usado em salvar() e desfazer()
    async function fetchUsuarioAtual() {
        const { data: { user }, error: userErr } = await supabaseClient.auth.getUser();
        if (userErr || !user) throw new Error('Usuário não autenticado');
        const { data: profile } = await supabaseClient
            .from('user_profiles')
            .select('nome, role')
            .eq('id', user.id)
            .maybeSingle();
        return {
            id: user.id,
            nome: profile?.nome || user.email || null,
            role: profile?.role || 'operador',
        };
    }

    async function salvar(decisao) {
        if (saving) return;
        setSaving(true);
        setError('');
        try {
            const usuario = await fetchUsuarioAtual();
            const agora = new Date().toISOString();

            // Empilha verificação ativa no histórico (se houver)
            const novoHistorico = [...historico];
            if (verificacaoAtiva) {
                novoHistorico.push({
                    decisao: verificacaoAtiva.decisao,
                    data: verificacaoAtiva.data,
                    por_usuario_id: verificacaoAtiva.por_usuario_id,
                    por_usuario_nome: verificacaoAtiva.por_usuario_nome || autorNome || null,
                    nota: verificacaoAtiva.nota || null,
                });
            }

            const novaVerificacao = {
                decisao,
                por_usuario_id: usuario.id,
                por_usuario_nome: usuario.nome,
                por_usuario_role: usuario.role,
                data: agora,
                nota: nota.trim() || null,
                historico: novoHistorico,
            };

            // Persiste — SEM mexer no status (decisão explícita da Fase 1)
            const { error: updErr } = await supabaseClient
                .from('shippings')
                .update({ verificacao_manual: novaVerificacao })
                .eq('id', shipping.id)
                .select()
                .single();

            if (updErr) throw updErr;

            onSaved?.({ ...shipping, verificacaoManual: novaVerificacao });
        } catch (err) {
            Sentry.captureException(err, {
                tags: { feature: 'confianca_rastreio', action: 'salvar_verificacao' },
                extra: { shipping_id: shipping.id, nf_numero: shipping.nfNumero },
            });
            console.error('[ManualVerificationModal] erro ao salvar:', err);
            setError(err.message || 'Erro ao salvar verificação');
            setSaving(false);
        }
    }

    async function desfazer() {
        if (saving || !verificacaoAtiva) return;
        if (typeof window !== 'undefined' && !window.confirm(
            'Desfazer a verificação manual? O badge volta a ser calculado automaticamente pelo tempo sem movimento. O histórico é preservado.'
        )) return;

        setSaving(true);
        setError('');
        try {
            const usuario = await fetchUsuarioAtual();
            const agora = new Date().toISOString();

            // Move a verificação ativa para o histórico, marcando com desfeito_em.
            // Preserva TODO o histórico existente + adiciona a nova entrada desfeita.
            const entradaDesfeita = {
                decisao: verificacaoAtiva.decisao,
                data: verificacaoAtiva.data,
                por_usuario_id: verificacaoAtiva.por_usuario_id,
                por_usuario_nome: verificacaoAtiva.por_usuario_nome || autorNome || null,
                nota: verificacaoAtiva.nota || null,
                desfeito_em: agora,
                desfeito_por_id: usuario.id,
                desfeito_por_nome: usuario.nome,
            };

            const novaVerificacao = {
                decisao: null,
                por_usuario_id: null,
                por_usuario_nome: null,
                por_usuario_role: null,
                data: null,
                nota: null,
                historico: [...historico, entradaDesfeita],
            };

            const { error: updErr } = await supabaseClient
                .from('shippings')
                .update({ verificacao_manual: novaVerificacao })
                .eq('id', shipping.id)
                .select()
                .single();

            if (updErr) throw updErr;

            onSaved?.({ ...shipping, verificacaoManual: novaVerificacao });
        } catch (err) {
            Sentry.captureException(err, {
                tags: { feature: 'confianca_rastreio', action: 'desfazer_verificacao' },
                extra: { shipping_id: shipping.id, nf_numero: shipping.nfNumero },
            });
            console.error('[ManualVerificationModal] erro ao desfazer:', err);
            setError(err.message || 'Erro ao desfazer verificação');
            setSaving(false);
        }
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
                <h2 className="modal-title">Verificação manual de rastreio</h2>
                <p className="modal-subtitle">
                    NF <strong>{shipping.nfNumero || '-'}</strong> — {shipping.cliente || '-'}
                </p>

                {/* Resumo do estado atual (confiança calculada) */}
                <div style={{
                    background: conf.color.bg,
                    border: `1px solid ${conf.color.fg}40`,
                    borderRadius: '8px',
                    padding: '12px',
                    marginBottom: '16px',
                    fontSize: '13px',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <span style={{ fontSize: '18px' }}>{conf.emoji}</span>
                        <strong style={{ color: conf.color.fg }}>{conf.label}</strong>
                    </div>
                    <div style={{ color: 'var(--text-secondary)' }}>{conf.motivo}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '6px' }}>
                        {transportadora && <>Transportadora: <strong>{transportadora}</strong></>}
                        {shipping.codigoRastreio && (
                            <> · Código: <code style={{ fontSize: '11px' }}>{shipping.codigoRastreio}</code></>
                        )}
                    </div>
                </div>

                {/* Banner de verificação ATIVA — com botão Desfazer */}
                {verificacaoAtiva && (
                    <div style={{
                        background: '#FFF7ED',
                        border: '1px solid #FDBA74',
                        borderRadius: '8px',
                        padding: '12px',
                        marginBottom: '16px',
                        fontSize: '13px',
                    }}>
                        <div style={{ fontWeight: 600, marginBottom: '6px', color: '#9A3412', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>{decisaoEmoji(verificacaoAtiva.decisao)}</span>
                            <span>Verificação ativa</span>
                        </div>
                        <div style={{ color: '#7C2D12', lineHeight: 1.5 }}>
                            Marcado como <strong>"{decisaoLabel(verificacaoAtiva.decisao)}"</strong>
                            {autorNome && <> por <strong>{autorNome}</strong></>}
                            {verificacaoAtiva.data && <> em <strong>{formatDateBR(verificacaoAtiva.data)}</strong></>}
                            {verificacaoAtiva.nota && (
                                <> — nota: <em>"{verificacaoAtiva.nota}"</em></>
                            )}
                        </div>
                        <div style={{ marginTop: '10px' }}>
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={desfazer}
                                disabled={saving}
                                style={{ fontSize: '12px', padding: '4px 10px' }}
                                title="Remove a verificação ativa; o badge volta ao cálculo automático. Histórico preservado."
                            >
                                {saving ? 'Processando...' : '↺ Desfazer verificação'}
                            </button>
                        </div>
                    </div>
                )}

                <div className="form-group">
                    <label className="form-label">
                        Observação (opcional)
                        <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: '6px' }}>
                            — o que você verificou?
                        </span>
                    </label>
                    <textarea
                        className="form-input"
                        rows={3}
                        value={nota}
                        onChange={(e) => setNota(e.target.value)}
                        placeholder="Ex: falei com cliente no WhatsApp, confirmou recebimento hoje"
                        maxLength={500}
                        disabled={saving}
                    />
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        {nota.length}/500 caracteres
                    </div>
                </div>

                {error && (
                    <div className="alert alert-danger" style={{ marginBottom: '12px' }}>
                        {error}
                    </div>
                )}

                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px', fontStyle: 'italic' }}>
                    {verificacaoAtiva
                        ? 'Salvar uma nova decisão substitui a verificação ativa e empilha a anterior no histórico. Nenhuma opção altera o status do despacho.'
                        : 'Nenhuma destas opções altera o status do despacho. Ambas apenas registram a sua verificação manual no histórico.'}
                </div>

                <div className="btn-group" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                        className="btn btn-primary"
                        style={{ background: '#39845f', borderColor: '#39845f', flex: 1, minWidth: '180px' }}
                        onClick={() => salvar('confirmado_entregue')}
                        disabled={saving}
                    >
                        {saving ? 'Salvando...' : '✅ Confirmar entregue'}
                    </button>
                    <button
                        className="btn btn-secondary"
                        style={{ flex: 1, minWidth: '180px' }}
                        onClick={() => salvar('ainda_em_transito')}
                        disabled={saving}
                    >
                        {saving ? 'Salvando...' : '📦 Ainda em trânsito'}
                    </button>
                    <button
                        className="btn btn-secondary"
                        style={{ minWidth: '100px' }}
                        onClick={onClose}
                        disabled={saving}
                    >
                        Cancelar
                    </button>
                </div>

                {/* Histórico (collapsed, se existir) */}
                {historico.length > 0 && (
                    <details style={{ marginTop: '16px', fontSize: '12px' }}>
                        <summary style={{ cursor: 'pointer', color: 'var(--text-secondary)' }}>
                            Histórico de verificações anteriores ({historico.length})
                        </summary>
                        <div style={{ marginTop: '8px', paddingLeft: '12px', borderLeft: '2px solid #e5e7eb' }}>
                            {historico.slice().reverse().map((h, i) => (
                                <div key={i} style={{ marginBottom: '10px', fontSize: '12px' }}>
                                    <div style={{ color: 'var(--text-secondary)' }}>
                                        {decisaoEmoji(h.decisao)}{' '}
                                        <span style={{ textTransform: 'capitalize' }}>
                                            {decisaoLabel(h.decisao)}
                                        </span>
                                        {h.por_usuario_nome && <> por <strong>{h.por_usuario_nome}</strong></>}
                                        {h.data && <> · {formatDateBR(h.data)}</>}
                                        {h.desfeito_em && (
                                            <span style={{ marginLeft: '6px', color: '#9A3412', fontWeight: 600 }}>
                                                (desfeita{h.desfeito_por_nome ? ` por ${h.desfeito_por_nome}` : ''} em {formatDateBR(h.desfeito_em)})
                                            </span>
                                        )}
                                    </div>
                                    {h.nota && (
                                        <div style={{ fontStyle: 'italic', color: 'var(--text-muted)', marginTop: '2px' }}>
                                            "{h.nota}"
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </details>
                )}
            </div>
        </div>
    );
}
