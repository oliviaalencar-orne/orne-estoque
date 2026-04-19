/**
 * sentry-user.js — Helpers para setar/limpar o user context do Sentry.
 *
 * LGPD: enviamos APENAS id (UUID, não-PII) e role. Nunca email, nome,
 * telefone ou qualquer outro identificador pessoal.
 */
import * as Sentry from '@sentry/react';

/**
 * Seta o contexto de usuário no Sentry. Chamar quando login+profile
 * estiverem completos (id e role disponíveis).
 *
 * @param {{ id: string, role: 'admin' | 'operador' | 'equipe' | string } | null | undefined} user
 */
export function setSentryUser(user) {
  if (!user || !user.id) {
    return clearSentryUser();
  }
  Sentry.setUser({
    id: user.id,
    role: user.role || 'unknown',
  });
}

/**
 * Limpa o contexto de usuário. Chamar no logout.
 */
export function clearSentryUser() {
  Sentry.setUser(null);
}
