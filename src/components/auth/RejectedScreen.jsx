/**
 * RejectedScreen.jsx — Shown when user profile status is 'rejected'
 *
 * Extracted from index-legacy.html L2076-2098
 */
import React from 'react';

export default function RejectedScreen({ onLogout }) {
  return (
    <div className="login-container">
      <div className="login-box">
        <img src="logo-orne.png" alt="Orne" className="login-logo" onError={(e) => e.target.style.display='none'} />
        <div style={{textAlign: 'center', marginBottom: '16px'}}>
          <div style={{width: '48px', height: '48px', borderRadius: '50%', background: 'var(--accent-error-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px'}}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-error)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          </div>
          <h1 className="login-title">Acesso Negado</h1>
          <p className="login-subtitle" style={{marginTop: '8px', lineHeight: '1.6'}}>
            Seu acesso foi negado pelo administrador.
            <br/>Entre em contato caso acredite ser um erro.
          </p>
        </div>
        <button className="btn-login" onClick={onLogout} style={{background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-default)'}}>
          Sair
        </button>
      </div>
    </div>
  );
}
