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
 *     decisao: 'confirmado_entregue' | 'ainda_em_transito',
 *     por_usuario_id: uuid,
 *     por_usuario_role: 'admin' | 'operador',
 *     data: ISO8601,
 *     nota: string | null,
 *     historico: [{ decisao, data, por_usuario_id, nota }]
 *   }
 *
 * O histórico preserva verificações anteriores (audit trail). Cada
 * nova verificação empilha a anterior em `historico` antes de escrever
 * os campos top-level.
 *
 * Permissões: somente admin+operador (controlado na origem — o botão
 * que abre este modal só aparece quando canEdit=true).
 */
import React, { useState, useMemo } from 'react';
import { supabaseClient } from '@/config/supabase';
import { classifyConfidence } from '@/utils/confidence';
import { getTransportadoraReal } from '@/utils/transportadora';

export default function ManualVerificationModal({ shipping, onClose, onSaved }) {
    const [nota, setNota] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const conf = useMemo(() => classifyConfidence(shipping), [shipping]);
    const transportadora = getTransportadoraReal(shipping);
    const historico = shipping.verificacaoManual?.historico || [];
    const verificacaoAnterior = shipping.verificacaoManual?.decisao ? shipping.verificacaoManual : null;

    async function salvar(decisao) {
        if (saving) return;
        setSaving(true);
        setError('');
        try {
            // Busca o usuário logado para registrar autoria
            const { data: { user }, error: userErr } = await supabaseClient.auth.getUser();
            if (userErr || !user) throw new Error('Usuário não autenticado');

            // Busca role do usuário para auditoria
            const { data: profile } = await supabaseClient
                .from('user_profiles')
                .select('role')
                .eq('id', user.id)
                .maybeSingle();
            const role = profile?.role || 'operador';

            // Monta a nova entrada
            const agora = new Date().toISOString();
            const novaEntrada = {
                decisao,
                data: agora,
                por_usuario_id: user.id,
                nota: nota.trim() || null,
            };

            // Empilha verificação anterior no histórico (se houver)
            const novoHistorico = [...historico];
            if (verificacaoAnterior) {
                novoHistorico.push({
                    decisao: verificacaoAnterior.decisao,
                    data: verificacaoAnterior.data,
                    por_usuario_id: verificacaoAnterior.por_usuario_id,
                    nota: verificacaoAnterior.nota || null,
                });
            }

            const novaVerificacao = {
                decisao,
                por_usuario_id: user.id,
                por_usuario_role: role,
                data: agora,
                nota: nota.trim() || null,
                historico: novoHistorico,
            };

            // Persiste — SEM mexer no status (decisão explícita da Fase 1)
            const { data, error: updErr } = await supabaseClient
                .from('shippings')
                .update({ verificacao_manual: novaVerificacao })
                .eq('id', shipping.id)
                .select()
                .single();

            if (updErr) throw updErr;

            onSaved?.({ ...shipping, verificacaoManual: novaVerificacao });
        } catch (err) {
            console.error('[ManualVerificationModal] erro ao salvar:', err);
            setError(err.message || 'Erro ao salvar verificação');
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

                {/* Resumo do estado atual */}
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

                {/* Verificação anterior (se houver) */}
                {verificacaoAnterior && (
                    <div style={{
                        background: '#FFF7ED',
                        border: '1px solid #FDBA74',
                        borderRadius: '8px',
                        padding: '10px 12px',
                        marginBottom: '16px',
                        fontSize: '12px',
                    }}>
                        <div style={{ fontWeight: 600, marginBottom: '4px', color: '#9A3412' }}>
                            Já existe uma verificação anterior
                        </div>
                        <div>
                            {verificacaoAnterior.decisao === 'confirmado_entregue'
                                ? '✅ Confirmado entregue'
                                : '📦 Ainda em trânsito'}
                            {' · '}
                            {new Date(verificacaoAnterior.data).toLocaleString('pt-BR', {
                                dateStyle: 'short',
                                timeStyle: 'short',
                            })}
                        </div>
                        {verificacaoAnterior.nota && (
                            <div style={{ marginTop: '4px', fontStyle: 'italic', color: '#7C2D12' }}>
                                "{verificacaoAnterior.nota}"
                            </div>
                        )}
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
                    Nenhuma destas opções altera o status do despacho. Ambas apenas registram
                    a sua verificação manual no histórico.
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
                                <div key={i} style={{ marginBottom: '8px', fontSize: '12px' }}>
                                    <div style={{ color: 'var(--text-secondary)' }}>
                                        {h.decisao === 'confirmado_entregue' ? '✅' : '📦'}{' '}
                                        {h.decisao === 'confirmado_entregue' ? 'Confirmado entregue' : 'Ainda em trânsito'}
                                        {' · '}
                                        {h.data && new Date(h.data).toLocaleString('pt-BR', {
                                            dateStyle: 'short', timeStyle: 'short',
                                        })}
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
