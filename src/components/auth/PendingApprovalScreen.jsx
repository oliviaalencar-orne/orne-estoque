/**
 * PendingApprovalScreen.jsx — Shown when user profile status is 'pending'
 *
 * Extracted from index-legacy.html L2050-2072
 */
import React from 'react';

export default function PendingApprovalScreen({ onLogout }) {
  return (
    <div className="login-container">
      <div className="login-box">
        <img src="logo-orne.png" alt="Orne" className="login-logo" onError={(e) => e.target.style.display='none'} />
        <div style={{textAlign: 'center', marginBottom: '16px'}}>
          <div style={{width: '48px', height: '48px', borderRadius: '50%', background: 'var(--accent-warning-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px'}}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-warning)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </div>
          <h1 className="login-title">Aguardando Aprovação</h1>
          <p className="login-subtitle" style={{marginTop: '8px', lineHeight: '1.6'}}>
            Seu cadastro está sendo analisado pelo administrador.
            <br/>Você receberá acesso assim que for aprovado.
          </p>
        </div>
        <button className="btn-login" onClick={onLogout} style={{background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-default)'}}>
          Sair
        </button>
      </div>
    </div>
  );
}
