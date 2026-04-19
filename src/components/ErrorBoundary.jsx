/**
 * ErrorBoundary.jsx — Wrapper sobre Sentry.ErrorBoundary com fallback UI.
 *
 * Para o usuário: tela amigável com opção de recarregar ou voltar ao
 * início, e "ID do erro" (eventId do Sentry) para suporte.
 *
 * Para o Sentry: captura automática via Sentry.ErrorBoundary.
 */
import React from 'react';
import * as Sentry from '@sentry/react';
import { Icon } from '@/utils/icons';

function FallbackUI({ eventId }) {
    return (
        <div
            role="alert"
            style={{
                minHeight: '100vh',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#FAFAFA',
                padding: '48px 24px',
                textAlign: 'center',
                fontFamily: 'Inter, system-ui, sans-serif',
            }}
        >
            <div style={{ color: '#893030', marginBottom: 24 }}>
                <Icon name="warning" size={48} />
            </div>
            <h1
                style={{
                    fontSize: 24,
                    fontWeight: 700,
                    marginBottom: 16,
                    color: '#1E1E1E',
                    margin: 0,
                }}
            >
                Algo deu errado
            </h1>
            <p
                style={{
                    fontSize: 14,
                    color: '#666',
                    maxWidth: 480,
                    marginTop: 16,
                    marginBottom: 32,
                    lineHeight: 1.5,
                }}
            >
                Registramos o problema e nossa equipe já foi notificada.
                Tente recarregar a página ou volte ao início.
            </p>
            <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
                <button
                    type="button"
                    onClick={() => window.location.reload()}
                    style={{
                        background: '#8c52ff',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 8,
                        padding: '10px 20px',
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: 'pointer',
                    }}
                >
                    Recarregar página
                </button>
                <button
                    type="button"
                    onClick={() => {
                        window.location.href = '/';
                    }}
                    style={{
                        background: '#fff',
                        color: '#1E1E1E',
                        border: '1px solid #D4D4D4',
                        borderRadius: 8,
                        padding: '10px 20px',
                        fontSize: 14,
                        fontWeight: 500,
                        cursor: 'pointer',
                    }}
                >
                    Voltar ao início
                </button>
            </div>
            {eventId && (
                <p
                    style={{
                        fontSize: 11,
                        color: '#b4b4b4',
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        marginTop: 8,
                    }}
                >
                    ID do erro: {eventId}
                </p>
            )}
        </div>
    );
}

/**
 * Wrapper ao redor de children que captura erros React e renderiza fallback.
 * Reporta automaticamente ao Sentry via Sentry.ErrorBoundary.
 */
export function ErrorBoundary({ children }) {
    return (
        <Sentry.ErrorBoundary
            fallback={({ eventId }) => <FallbackUI eventId={eventId} />}
        >
            {children}
        </Sentry.ErrorBoundary>
    );
}

export default ErrorBoundary;
