/**
 * ReclassificationModal.jsx — Reclassificação manual entre terminais de devolução.
 *
 * Entrega 1 da Taxonomia de Devolução. Admin-only. Permite mover um envio
 * entre os três status terminais negativos:
 *
 *   - DEVOLVIDO          — pacote retornou fisicamente ao remetente
 *   - ETIQUETA_CANCELADA — etiqueta foi cancelada, nada foi enviado
 *   - EXTRAVIADO         — pacote perdido no caminho
 *
 * Regras:
 *  - Só 1 destino pode ser selecionado por vez, diferente do status atual.
 *  - Nota obrigatória (min 3 caracteres) para rastreabilidade.
 *  - Grava o UPDATE diretamente em `shippings` (status + reclassificacao_manual
 *    JSONB com histórico acumulado).
 *  - NÃO mexe em verificacaoManual, reclassificacaoAutomatica (legado do
 *    script admin), nem em entrada de estoque. Só status + auditoria.
 *
 * Estrutura gravada (shippings.reclassificacao_manual, JSONB):
 *   {
 *     ultima: {
 *       data: ISO, de: status_anterior, para: status_novo,
 *       nota: string, por_usuario_id, por_usuario_nome, por_usuario_email,
 *     },
 *     historico: [...ultima_anterior, ...]
 *   }
 *
 * Permissão: o componente confia que o caller só o renderiza para admin
 * (isStockAdmin=true). Defesa em profundidade: também verifica via RLS no
 * update — se o usuário não for admin o UPDATE falha.
 */
import React, { useState, useMemo } from 'react';
import * as Sentry from '@sentry/react';
import { supabaseClient } from '@/config/supabase';
import { statusList } from '@/components/shipping/ShippingManager';

const OPCOES = [
  {
    key: 'DEVOLVIDO',
    label: 'Devolução real',
    descricao: 'Pacote retornou fisicamente ao remetente.',
  },
  {
    key: 'ETIQUETA_CANCELADA',
    label: 'Etiqueta cancelada',
    descricao: 'Etiqueta foi cancelada na transportadora — nada chegou a sair.',
  },
  {
    key: 'EXTRAVIADO',
    label: 'Extraviado',
    descricao: 'Pacote marcado como perdido pela transportadora.',
  },
];

const MIN_NOTA = 3;

function formatDateBR(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return String(iso);
  }
}

export default function ReclassificationModal({ shipping, onClose, onSaved }) {
  const [destino, setDestino] = useState('');
  const [nota, setNota] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const statusAtual = shipping?.status || '';
  const reclassManual = shipping?.reclassificacaoManual || null;
  const historico = useMemo(() => {
    if (!reclassManual) return [];
    const items = Array.isArray(reclassManual.historico) ? [...reclassManual.historico] : [];
    if (reclassManual.ultima) items.push(reclassManual.ultima);
    return items;
  }, [reclassManual]);

  const reclassAuto = shipping?.reclassificacaoAutomatica || null;

  const podeSalvar = destino && destino !== statusAtual && nota.trim().length >= MIN_NOTA && !saving;

  async function fetchUsuarioAtual() {
    const { data: { user }, error: userErr } = await supabaseClient.auth.getUser();
    if (userErr || !user) throw new Error('Usuário não autenticado');
    const { data: profile } = await supabaseClient
      .from('user_profiles')
      .select('nome, email, role')
      .eq('id', user.id)
      .maybeSingle();
    return {
      id: user.id,
      nome: profile?.nome || user.email || null,
      email: profile?.email || user.email || null,
      role: profile?.role || null,
    };
  }

  async function salvar() {
    if (!podeSalvar) return;
    setSaving(true);
    setError('');
    try {
      const usuario = await fetchUsuarioAtual();
      if (usuario.role !== 'admin') {
        throw new Error('Apenas administradores podem reclassificar devoluções.');
      }
      const agora = new Date().toISOString();

      // Empilha a `ultima` anterior em `historico` (mantém rastreio acumulado).
      const novoHistorico = Array.isArray(reclassManual?.historico) ? [...reclassManual.historico] : [];
      if (reclassManual?.ultima) novoHistorico.push(reclassManual.ultima);

      const ultima = {
        data: agora,
        de: statusAtual,
        para: destino,
        nota: nota.trim(),
        por_usuario_id: usuario.id,
        por_usuario_nome: usuario.nome,
        por_usuario_email: usuario.email,
      };

      const payload = {
        status: destino,
        reclassificacao_manual: {
          ultima,
          historico: novoHistorico,
        },
      };

      const { error: updErr } = await supabaseClient
        .from('shippings')
        .update(payload)
        .eq('id', shipping.id)
        .eq('status', statusAtual) // guard contra race
        .select()
        .single();

      if (updErr) throw updErr;

      onSaved?.({
        ...shipping,
        status: destino,
        reclassificacaoManual: payload.reclassificacao_manual,
      });
    } catch (err) {
      Sentry.captureException(err, {
        tags: { feature: 'taxonomia_devolucao', action: 'reclassificar_manual' },
        extra: {
          shipping_id: shipping?.id,
          nf_numero: shipping?.nfNumero,
          de: statusAtual,
          para: destino,
        },
      });
      console.error('[ReclassificationModal] erro ao salvar:', err);
      setError(err.message || 'Erro ao reclassificar');
      setSaving(false);
    }
  }

  const statusAtualMeta = statusList[statusAtual] || { label: statusAtual };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '540px' }} onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Reclassificar devolução</h2>
        <p className="modal-subtitle">
          NF <strong>{shipping?.nfNumero || '-'}</strong> — {shipping?.cliente || '-'}
        </p>

        {/* Status atual */}
        <div style={{
          background: statusAtualMeta.bg || 'var(--bg-tertiary)',
          border: `1px solid ${statusAtualMeta.color || 'var(--border-default)'}40`,
          borderRadius: '4px',
          padding: '10px 12px',
          marginBottom: '16px',
          fontSize: '13px',
        }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginBottom: '2px' }}>
            Status atual
          </div>
          <strong style={{ color: statusAtualMeta.textColor || statusAtualMeta.color || 'var(--text-primary)' }}>
            {statusAtualMeta.label || statusAtual}
          </strong>
        </div>

        {/* Auditoria do script legado (se houver) */}
        {reclassAuto && (
          <div style={{
            background: '#FFFBEB',
            border: '1px solid #FDE68A',
            borderRadius: '4px',
            padding: '10px 12px',
            marginBottom: '12px',
            fontSize: '12px',
            color: '#78350F',
          }}>
            <div style={{ fontWeight: 600, marginBottom: '2px' }}>
              Reclassificação automática anterior
            </div>
            <div>
              {reclassAuto.de} → <strong>{reclassAuto.para}</strong>
              {reclassAuto.data && <> em {formatDateBR(reclassAuto.data)}</>}
              {reclassAuto.motivo_match && (
                <> — motivo: <em>"{reclassAuto.motivo_match}"</em></>
              )}
            </div>
          </div>
        )}

        {/* Opções de destino */}
        <div className="form-group" style={{ marginBottom: '12px' }}>
          <label className="form-label">Novo status</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {OPCOES.map(opt => {
              const isAtual = opt.key === statusAtual;
              const isSelected = destino === opt.key;
              const disabled = isAtual || saving;
              const meta = statusList[opt.key] || {};
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => { if (!disabled) setDestino(opt.key); }}
                  disabled={disabled}
                  style={{
                    textAlign: 'left',
                    padding: '10px 12px',
                    borderRadius: '4px',
                    border: `1px solid ${isSelected ? (meta.color || '#8c52ff') : '#e5e7eb'}`,
                    background: isSelected ? `${meta.color || '#8c52ff'}15` : isAtual ? '#f9fafb' : '#fff',
                    color: isAtual ? 'var(--text-muted)' : 'var(--text-primary)',
                    cursor: disabled ? 'default' : 'pointer',
                    fontSize: '13px',
                    transition: 'background 0.15s, border-color 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                    <span style={{
                      display: 'inline-block',
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      background: meta.color || '#9ca3af',
                      opacity: disabled ? 0.4 : 1,
                    }} />
                    {opt.label}
                    {isAtual && (
                      <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>
                        atual
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', paddingLeft: '18px' }}>
                    {opt.descricao}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Nota obrigatória */}
        <div className="form-group" style={{ marginBottom: '12px' }}>
          <label className="form-label">
            Motivo da reclassificação
            <span style={{ color: '#DC2626', marginLeft: '4px' }}>*</span>
            <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: '6px' }}>
              — mínimo {MIN_NOTA} caracteres
            </span>
          </label>
          <textarea
            className="form-input"
            rows={3}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Ex: cliente confirmou que pacote nunca saiu; etiqueta cancelada pela Correios"
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
          A reclassificação altera apenas o status e registra a auditoria. Estoque,
          entradas/saídas e verificações manuais não são afetados.
        </div>

        <div className="btn-group" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            className="btn btn-secondary"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            className="btn btn-primary"
            onClick={salvar}
            disabled={!podeSalvar}
            title={!destino ? 'Selecione o novo status' : nota.trim().length < MIN_NOTA ? 'Preencha o motivo' : 'Salvar reclassificação'}
          >
            {saving ? 'Salvando...' : 'Reclassificar'}
          </button>
        </div>

        {/* Histórico acumulado */}
        {historico.length > 0 && (
          <details style={{ marginTop: '16px', fontSize: '12px' }}>
            <summary style={{ cursor: 'pointer', color: 'var(--text-secondary)' }}>
              Histórico de reclassificações ({historico.length})
            </summary>
            <div style={{ marginTop: '8px', paddingLeft: '12px', borderLeft: '2px solid #e5e7eb' }}>
              {historico.slice().reverse().map((h, i) => (
                <div key={i} style={{ marginBottom: '10px', fontSize: '12px' }}>
                  <div style={{ color: 'var(--text-secondary)' }}>
                    <strong>{h.de}</strong> → <strong>{h.para}</strong>
                    {h.por_usuario_nome && <> por <strong>{h.por_usuario_nome}</strong></>}
                    {h.data && <> · {formatDateBR(h.data)}</>}
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
