/**
 * ResetPassword.jsx — Password reset form
 *
 * Shown when user clicks the recovery link from email.
 * Uses supabase.auth.updateUser() to set the new password.
 */
import React, { useState } from 'react';
import { supabaseClient } from '@/config/supabase';

export default function ResetPassword({ onComplete }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres');
      return;
    }

    if (password !== confirmPassword) {
      setError('As senhas não coincidem');
      return;
    }

    setIsLoading(true);
    try {
      const { error: updateError } = await supabaseClient.auth.updateUser({
        password,
      });
      if (updateError) throw updateError;

      setSuccess('Senha alterada com sucesso!');
      // Clean URL hash
      if (window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname);
      }
      // Redirect to main app after 2 seconds
      setTimeout(() => {
        if (onComplete) onComplete();
      }, 2000);
    } catch (err) {
      setError(err.message || 'Erro ao alterar senha');
    }
    setIsLoading(false);
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <img src="logo-orne.png" alt="Orne" className="login-logo" onError={(e) => e.target.style.display='none'} />
        <h1 className="login-title">Nova Senha</h1>
        <p className="login-subtitle">Defina sua nova senha de acesso</p>

        {success && (
          <div style={{
            padding: '12px 16px',
            borderRadius: '8px',
            background: 'var(--accent-success-subtle)',
            color: 'var(--accent-success)',
            fontSize: '13px',
            marginBottom: '16px',
            lineHeight: '1.5',
            border: '1px solid rgba(61, 139, 95, 0.2)'
          }}>
            {success}
          </div>
        )}

        {!success && (
          <form className="login-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Nova Senha</label>
              <input
                type="password"
                className="form-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                required
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label">Confirmar Senha</label>
              <input
                type="password"
                className="form-input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita a nova senha"
                required
              />
            </div>
            <button type="submit" className="btn-login" disabled={isLoading}>
              {isLoading ? 'Aguarde...' : 'Salvar Nova Senha'}
            </button>
          </form>
        )}

        {error && <div className="login-error">{error}</div>}
      </div>
    </div>
  );
}
