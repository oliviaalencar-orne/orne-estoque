/**
 * EnvironmentBadge.jsx — Faixa visual de ambiente não-produção (Frente §16.2)
 *
 * Renderizada uma única vez no App.jsx, antes do `.app-container`,
 * dentro do <ErrorBoundary>.
 *
 * Comportamento:
 *  - production: retorna null (badge não aparece)
 *  - staging/development: faixa fina full-width fixed no topo do
 *    viewport. Injeta classe `has-env-badge` no <body> via useEffect,
 *    que aciona regras em src/styles/global.css para empurrar
 *    .app-container, .mobile-header, .sidebar e .sb por
 *    var(--env-badge-height) (28px + safe-area-inset-top).
 *
 * Acessibilidade:
 *  - role="status" para anunciar mudança de ambiente a leitores de tela
 *  - aria-label sempre completo (mesmo quando o texto visível é truncado)
 *
 * Responsividade: 3 níveis de texto via @media em global.css.
 *
 * Spec: contexto-sistema-orne-estoque-v6.3-maio-2026.md §16.2.
 * Decisões CP1 (2026-05-19): Opção A (badge fixed + body.has-env-badge),
 * 3 níveis de texto, src/components/ui/, padding-top via env() para notch iOS.
 */
import { useEffect } from 'react';
import { getEnvironment } from '@/utils/environment';

// Texto por ambiente × breakpoint. ⚠ = ⚠, — = — (em dash).
// Manter como escapes Unicode evita o gotcha de JSX literal observado
// na Frente 5 (heurística do projeto sobre UTF-8 em JSX text nodes).
const TEXTS = {
  staging: {
    long: '⚠ AMBIENTE STAGING — Dados de teste, não use para operação real',
    med: '⚠ STAGING — Dados de teste',
    short: '⚠ STAGING',
  },
  development: {
    long: '⚠ AMBIENTE DESENVOLVIMENTO LOCAL — Dados de teste',
    med: '⚠ DEV LOCAL — Dados de teste',
    short: '⚠ DEV LOCAL',
  },
};

export default function EnvironmentBadge() {
  const env = getEnvironment();
  const active = env !== 'production';

  useEffect(() => {
    if (!active) return undefined;
    document.body.classList.add('has-env-badge');
    return () => document.body.classList.remove('has-env-badge');
  }, [active]);

  if (!active) return null;

  const t = TEXTS[env];

  return (
    <div
      role="status"
      aria-label={t.long}
      className="env-badge"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        // Altura do conteúdo é fixa em 28px; padding-top adiciona o
        // safe-area-inset-top (notch iOS) por cima. Box-sizing
        // content-box garante que a altura total = 28px + inset.
        boxSizing: 'content-box',
        height: 28,
        paddingTop: 'env(safe-area-inset-top, 0px)',
        background: '#FCD34D',
        color: '#1F2937',
        fontSize: 13,
        fontWeight: 600,
        textAlign: 'center',
        lineHeight: '28px',
        zIndex: 9999,
        userSelect: 'none',
        // Truncamento se o texto não couber no breakpoint atual.
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
        paddingLeft: 16,
        paddingRight: 16,
      }}
    >
      <span className="env-badge-text env-badge-text-long">{t.long}</span>
      <span className="env-badge-text env-badge-text-med">{t.med}</span>
      <span className="env-badge-text env-badge-text-short">{t.short}</span>
    </div>
  );
}
