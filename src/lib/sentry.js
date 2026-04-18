/**
 * sentry.js — Inicialização do Sentry para frontend (Fase A).
 *
 * Responsabilidades:
 *  - Ler VITE_SENTRY_DSN do ambiente Vite (vazio = desativado, sem erro)
 *  - Não enviar dados de localhost (evitar poluição)
 *  - Detectar environment (production / staging / development) via hostname
 *  - Configurar Session Replay com privacidade máxima (mask all + block media)
 *  - Filtrar ruído (extensões, AbortError, ResizeObserver, promise rejection)
 *  - Scrub recursivo de campos sensíveis em beforeSend
 *
 * LGPD: cliente/fornecedor/endereço/telefone/CPF/CNPJ nunca saem do browser.
 * Scrub é defesa em profundidade (não confiar em server-side scrubber).
 */
import * as Sentry from '@sentry/react';

/**
 * Chaves cujos valores devem ser substituídos por '[scrubbed]' antes
 * de enviar qualquer evento ao Sentry. Comparação case-insensitive.
 */
const SENSITIVE_KEYS = [
  'supplier', 'client', 'cliente', 'fornecedor',
  'recebedor_nome', 'recebedornome',
  'email', 'telefone', 'phone',
  'cpf', 'cnpj',
  'chave_acesso', 'chaveacesso',
  'motivo_devolucao', 'motivodevolucao',
  'observacoes', 'observations',
  'destino', 'endereco', 'address',
];
const SENSITIVE_SET = new Set(SENSITIVE_KEYS.map((k) => k.toLowerCase()));

/**
 * Substitui recursivamente valores de chaves sensíveis.
 * Não muta o original — clona ao alterar.
 *
 * @param {*} value
 * @param {WeakSet} [seen] — evita ciclos
 * @returns {*}
 */
function scrubDeep(value, seen = new WeakSet()) {
  if (value == null) return value;
  if (typeof value !== 'object') return value;
  if (seen.has(value)) return value;
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((v) => scrubDeep(v, seen));
  }

  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (SENSITIVE_SET.has(k.toLowerCase())) {
      out[k] = '[scrubbed]';
    } else {
      out[k] = scrubDeep(v, seen);
    }
  }
  return out;
}

/**
 * Detecta o environment pelo hostname.
 * @returns {'production' | 'staging' | 'development'}
 */
function detectEnvironment() {
  if (typeof window === 'undefined') return 'development';
  const h = window.location.hostname;
  if (h === 'orne-estoque.vercel.app' || h === 'estoque.ornedecor.com') return 'production';
  if (h === 'orne-estoque-staging.vercel.app') return 'staging';
  return 'development';
}

/**
 * Decide se um evento deve ser descartado (retornar null em beforeSend).
 * Filtros de ruído comuns em SPAs.
 */
function shouldDropEvent(event, hint) {
  const msg =
    event?.message ||
    hint?.originalException?.message ||
    (typeof hint?.originalException === 'string' ? hint.originalException : '') ||
    '';
  const msgLower = String(msg).toLowerCase();

  // ResizeObserver: benign, gera muito barulho
  if (msgLower.includes('resizeobserver loop limit')) return true;
  if (msgLower.includes('resizeobserver loop completed with undelivered notifications')) return true;

  // Promise rejections não-Error (geralmente cancelamentos)
  if (msgLower.includes('non-error promise rejection captured')) return true;

  // AbortError (fetch cancelado, common em re-renders)
  const name = hint?.originalException?.name || '';
  if (name === 'AbortError') return true;
  if (msgLower.includes('the operation was aborted')) return true;
  if (msgLower.includes('aborterror')) return true;

  // Extensões do browser
  const frames = event?.exception?.values?.[0]?.stacktrace?.frames || [];
  const hasExtension = frames.some((f) => {
    const file = f.filename || '';
    return file.includes('chrome-extension://') || file.includes('moz-extension://');
  });
  if (hasExtension) return true;

  return false;
}

/**
 * Inicializa Sentry. Seguro para chamar múltiplas vezes (idempotente via flag).
 */
let initialized = false;
export function initSentry() {
  if (initialized) return;

  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) {
    console.warn('[Sentry] DSN não configurado, observabilidade desativada');
    return;
  }

  // Nunca enviar de localhost — poluição de desenvolvimento
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '') {
    console.info('[Sentry] localhost detectado, observabilidade desativada em dev local');
    return;
  }

  const environment = detectEnvironment();
  const release = import.meta.env.VITE_COMMIT_SHA || 'dev';

  Sentry.init({
    dsn,
    environment,
    release,

    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        maskAllInputs: true,
        blockAllMedia: true,
      }),
    ],

    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0, // não gravar sessões aleatórias
    replaysOnErrorSampleRate: 1.0, // gravar sempre que houver erro

    beforeSend(event, hint) {
      if (shouldDropEvent(event, hint)) return null;

      // Scrub recursivo nas seções que podem carregar dados da UI
      if (event.extra) event.extra = scrubDeep(event.extra);
      if (event.contexts) event.contexts = scrubDeep(event.contexts);
      if (event.request?.data) {
        event.request = { ...event.request, data: scrubDeep(event.request.data) };
      }
      if (Array.isArray(event.breadcrumbs)) {
        event.breadcrumbs = event.breadcrumbs.map((bc) => ({
          ...bc,
          ...(bc.data ? { data: scrubDeep(bc.data) } : {}),
        }));
      }

      return event;
    },
  });

  initialized = true;
}

// Export helpers para testes internos (não usados em runtime normal)
export const __internals = { scrubDeep, shouldDropEvent, detectEnvironment };
