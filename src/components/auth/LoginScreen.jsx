/**
 * LoginScreen.jsx — Login / Sign-up screen
 *
 * Extracted from index-legacy.html L2239-2327
 */
import React, { useState } from 'react';
import { supabaseClient } from '@/config/supabase';

export default function LoginScreen({ loading }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nome, setNome] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <span style={{color: 'var(--text-muted)', fontSize: '13px'}}>Carregando...</span>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setIsLoading(true);

    try {
      if (isForgotPassword) {
        const { error: resetError } = await supabaseClient.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + '/reset-password',
        });
        if (resetError) throw resetError;
        setSuccessMsg('E-mail de recuperação enviado! Verifique sua caixa de entrada.');
        setIsForgotPassword(false);
      } else if (isLogin) {
        const { data, error: authError } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
      } else {
        if (!nome.trim()) {
          setError('Informe seu nome');
          setIsLoading(false);
          return;
        }
        const { data, error: authError } = await supabaseClient.auth.signUp({
          email,
          password,
          options: { data: { nome: nome.trim() } },
        });
        if (authError) throw authError;

        // Save nome to user_profiles (the trigger creates the profile, we update with nome)
        // Small delay for the trigger to fire
        await new Promise((r) => setTimeout(r, 1000));
        const { data: { user: newUser } } = await supabaseClient.auth.getUser();
        if (newUser) {
          await supabaseClient.from('user_profiles').update({ nome: nome.trim() }).eq('id', newUser.id);
        }

        // Sign out so they see the success message
        await supabaseClient.auth.signOut();
        setSuccessMsg('Conta criada com sucesso! Aguarde a aprovação do administrador.');
        setIsLogin(true);
        setNome('');
      }
    } catch (err) {
      const messages = {
        'invalid_credentials': 'E-mail ou senha incorretos',
        'user_already_exists': 'E-mail já cadastrado',
        'weak_password': 'Senha muito fraca (mínimo 6 caracteres)',
        'invalid_email': 'E-mail inválido',
        'email_not_confirmed': 'E-mail não confirmado',
        'signup_disabled': 'Cadastro desabilitado'
      };
      setError(messages[err.code] || err.message || 'Erro ao autenticar');
    }
    setIsLoading(false);
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <img src="logo-orne.png" alt="Orne" className="login-logo" onError={(e) => e.target.style.display='none'} />
        <h1 className="login-title">
          {isForgotPassword ? 'Recuperar Senha' : isLogin ? 'Entrar' : 'Criar conta'}
        </h1>
        <p className="login-subtitle">
          {isForgotPassword
            ? 'Informe seu e-mail para receber o link de recuperação'
            : 'Sistema de Gestão de Estoque'}
        </p>

        {successMsg && (
          <div style={{padding: '12px 16px', borderRadius: '8px', background: 'var(--accent-success-subtle)', color: 'var(--accent-success)', fontSize: '13px', marginBottom: '16px', lineHeight: '1.5', border: '1px solid rgba(61, 139, 95, 0.2)'}}>
            {successMsg}
          </div>
        )}

        <form className="login-form" onSubmit={handleSubmit}>
          {!isLogin && !isForgotPassword && (
            <div className="form-group">
              <label className="form-label">Nome</label>
              <input type="text" className="form-input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome completo" required />
            </div>
          )}
          <div className="form-group">
            <label className="form-label">E-mail</label>
            <input type="email" className="form-input" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          {!isForgotPassword && (
            <div className="form-group">
              <label className="form-label">Senha</label>
              <input type="password" className="form-input" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
          )}
          <button type="submit" className="btn-login" disabled={isLoading}>
            {isLoading ? 'Aguarde...' : isForgotPassword ? 'Enviar Link' : isLogin ? 'Entrar' : 'Criar conta'}
          </button>
        </form>

        {error && <div className="login-error">{error}</div>}

        {isLogin && !isForgotPassword && (
          <div style={{ textAlign: 'center', marginTop: '12px' }}>
            <button
              onClick={() => { setIsForgotPassword(true); setError(''); setSuccessMsg(''); }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--accent-primary)',
                cursor: 'pointer',
                fontSize: '13px',
                textDecoration: 'underline',
                fontFamily: 'inherit',
              }}
            >
              Esqueceu a senha?
            </button>
          </div>
        )}

        <div className="login-toggle">
          {isForgotPassword ? (
            <button onClick={() => { setIsForgotPassword(false); setError(''); setSuccessMsg(''); }}>
              Voltar ao login
            </button>
          ) : (
            <>
              {isLogin ? 'Não tem conta? ' : 'Já tem conta? '}
              <button onClick={() => { setIsLogin(!isLogin); setIsForgotPassword(false); setError(''); setSuccessMsg(''); }}>
                {isLogin ? 'Criar conta' : 'Fazer login'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
