/**
 * ConfidenceBadge.jsx — Badge visual de Confiança de Rastreio (Fase 1).
 *
 * Mostra 🟢/🟡/🔴/⚪ com cor de fundo da paleta Orne e tooltip com motivo.
 * Quando o nível é 🟡 ou 🔴 e o usuário pode verificar (admin/operador),
 * o badge vira botão clicável que abre o modal de verificação manual.
 * Caso contrário, é apenas um span informativo.
 */
import React from 'react';
import { classifyConfidence, CONFIANCA_NIVEIS } from '@/utils/confidence';

export default function ConfidenceBadge({ shipping, canVerify, onClickVerify }) {
  const conf = classifyConfidence(shipping);

  // Texto do tooltip consolida info por linha.
  const tooltipParts = [
    `${conf.emoji} ${conf.label}`,
    conf.motivo,
  ];
  if (conf.transporte && conf.transporte !== 'local') {
    tooltipParts.push(`Transporte: ${conf.transporte}`);
  }
  if (shipping.verificacaoManual?.decisao) {
    const v = shipping.verificacaoManual;
    const decisaoLbl = v.decisao === 'confirmado_entregue' ? 'Confirmado entregue' : 'Ainda em trânsito';
    tooltipParts.push(`Última verificação: ${decisaoLbl}${v.nota ? ` — ${v.nota}` : ''}`);
  }
  const tooltip = tooltipParts.join('\n');

  const isActionable = canVerify
    && (conf.nivel === CONFIANCA_NIVEIS.URGENTE || conf.nivel === CONFIANCA_NIVEIS.ATENCAO);

  const baseStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    padding: '3px 10px',
    borderRadius: '12px',
    background: conf.color.bg,
    color: conf.color.fg,
    fontSize: '12px',
    fontWeight: 600,
    lineHeight: '1.4',
    whiteSpace: 'nowrap',
    border: `1px solid ${conf.color.fg}30`,
  };

  if (isActionable) {
    return (
      <button
        type="button"
        onClick={onClickVerify}
        title={`${tooltip}\n\nClique para verificar manualmente.`}
        style={{
          ...baseStyle,
          cursor: 'pointer',
          transition: 'transform 0.1s, box-shadow 0.1s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.04)';
          e.currentTarget.style.boxShadow = `0 0 0 2px ${conf.color.fg}30`;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        <span aria-hidden="true">{conf.emoji}</span>
        <span>{conf.label}</span>
      </button>
    );
  }

  return (
    <span title={tooltip} style={baseStyle}>
      <span aria-hidden="true">{conf.emoji}</span>
      <span>{conf.label}</span>
    </span>
  );
}
