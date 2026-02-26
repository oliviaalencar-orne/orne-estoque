/**
 * AccessRestricted.jsx — Permission gate for non-admin users
 *
 * Extracted from index-legacy.html L2102-2113
 */
import React from 'react';

export default function AccessRestricted({ message }) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
      <div style={{ fontSize: '48px', marginBottom: '16px' }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      </div>
      <h3 style={{ color: 'var(--text-primary)', marginBottom: '8px' }}>Acesso Restrito</h3>
      <p>{message || 'Apenas administradores de estoque podem acessar esta funcionalidade.'}</p>
    </div>
  );
}
