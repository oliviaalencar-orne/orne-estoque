/**
 * ConfidenceBadge.jsx — Badge visual de Alerta de Rastreio (Fase 1).
 *
 * Renderiza um círculo sólido pequeno (10px) com a cor do nível, sem
 * pílula ou label. O tooltip (title) consolida as informações para o
 * operador passar o mouse e ler.
 *
 * Clicabilidade:
 *   - Quando `canVerify=true`, o badge é SEMPRE clicável (inclusive ⚪).
 *     O modal decide o que mostrar:
 *       · 🟡/🔴  → formulário de verificação manual
 *       · ⚪ com verificacaoManual ativa → banner + desfazer
 *       · ⚪ natural (ENTREGUE/DEVOLVIDO/etc) → modal read-only
 *   - Quando `canVerify=false`, é apenas um span informativo com tooltip.
 */
import React from 'react';
import { classifyConfidence } from '@/utils/confidence';

const SIZE_PX = 10;

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

  const dotStyle = {
    display: 'inline-block',
    width: `${SIZE_PX}px`,
    height: `${SIZE_PX}px`,
    borderRadius: '50%',
    background: conf.color.fg,
    verticalAlign: 'middle',
  };

  if (canVerify) {
    // Botão transparente centraliza o dot e fornece área de clique maior (18x18)
    // sem mudar o tamanho visual do indicador.
    return (
      <button
        type="button"
        onClick={onClickVerify}
        title={`${tooltip}\n\nClique para ver detalhes.`}
        aria-label={`${conf.label}: ${conf.motivo}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '20px',
          height: '20px',
          padding: 0,
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          borderRadius: '50%',
          transition: 'transform 0.1s, box-shadow 0.1s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.15)';
          e.currentTarget.style.boxShadow = `0 0 0 2px ${conf.color.fg}30`;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        <span aria-hidden="true" style={dotStyle} />
      </button>
    );
  }

  return (
    <span
      title={tooltip}
      aria-label={`${conf.label}: ${conf.motivo}`}
      style={{ display: 'inline-flex', alignItems: 'center', width: '20px', height: '20px', justifyContent: 'center' }}
    >
      <span aria-hidden="true" style={dotStyle} />
    </span>
  );
}
