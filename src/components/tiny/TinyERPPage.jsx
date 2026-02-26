/**
 * TinyERPPage.jsx — Tiny ERP integration page (config, sync, history)
 *
 * Extracted from index-legacy.html L10438-11157
 * Keeps ALL Edge Function calls (tiny-auth, tiny-sync-products, tiny-sync-stock, tiny-sync-nfe)
 */
import React, { useState, useEffect } from 'react';
import { Icon } from '@/utils/icons';
import { supabaseClient, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/config/supabase';
import PeriodFilter, { filterByPeriod } from '@/components/ui/PeriodFilter';

export default function TinyERPPage({ user, onDataChanged, products, entries, exits, stock, onAddEntry, onAddExit, onAddProduct, categories, locaisOrigem, onUpdateLocais, onAddCategory, onUpdateCategory, onDeleteCategory }) {
    const [activeSection, setActiveSectionRaw] = useState(() => {
        try { const s = sessionStorage.getItem('tiny_activeSection'); return (s && s !== 'nfe') ? s : 'config'; } catch(e) { return 'config'; }
    });
    const setActiveSection = (section) => {
        setActiveSectionRaw(section);
        try { sessionStorage.setItem('tiny_activeSection', section); } catch(e) {}
    };
    const [clientId, setClientId] = useState('');
    const [clientSecret, setClientSecret] = useState('');
    const [status, setStatus] = useState(() => {
        try { const c = sessionStorage.getItem('tiny_status'); return c ? JSON.parse(c) : null; } catch(e) { return null; }
    });
    const [statusLoading, setStatusLoading] = useState(() => {
        try { return !sessionStorage.getItem('tiny_status'); } catch(e) { return true; }
    });
    const [loading, setLoading] = useState(false);
    const [testResult, setTestResult] = useState(null);
    const [syncLogs, setSyncLogs] = useState(() => {
        try { const c = sessionStorage.getItem('tiny_syncLogs'); return c ? JSON.parse(c) : []; } catch(e) { return []; }
    });
    const [syncProgress, setSyncProgress] = useState(null);
    const [syncLock, setSyncLock] = useState(false);
    const [histPeriodFilter, setHistPeriodFilter] = useState('30');
    const [histCustomMonth, setHistCustomMonth] = useState(new Date().getMonth());
    const [histCustomYear, setHistCustomYear] = useState(new Date().getFullYear());
    const [nfeDateFrom, setNfeDateFrom] = useState('');
    const [nfeDateTo, setNfeDateTo] = useState('');
    const [nfeNumber, setNfeNumber] = useState('');

    const FUNC_BASE = `${SUPABASE_URL}/functions/v1`;

    const getAuthHeaders = async () => {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) throw new Error('Sessao expirada. Faca login novamente.');
        return {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
        };
    };

    const callFunction = async (name, body) => {
        const headers = await getAuthHeaders();
        const res = await fetch(`${FUNC_BASE}/${name}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `Erro ${res.status}`);
        }
        return await res.json();
    };

    // Load status on mount + retomar polling se sync estava running + cleanup stuck syncs
    useEffect(() => {
        loadStatus();
        loadSyncLogs();

        // Auto-cleanup: limpar syncs stuck (>5 min com status running)
        supabaseClient.from('sync_log')
            .update({ status: 'error', message: 'Timeout — limpeza automatica', finished_at: new Date().toISOString() })
            .eq('status', 'running')
            .lt('started_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
            .then(() => loadSyncLogs());

        // Verificar se ha um sync em andamento (backend pode estar rodando)
        (async () => {
            const { data: runningLog } = await supabaseClient
                .from('sync_log')
                .select('id, status, message, items_synced, items_total, next_offset')
                .eq('type', 'products')
                .eq('status', 'running')
                .order('started_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            if (runningLog) {
                setSyncLock(true);
                setSyncProgress({ type: 'products', status: 'running', message: runningLog.message || 'Sincronizacao em andamento...' });
                // Iniciar polling
                const pollInterval = setInterval(async () => {
                    const { data: log } = await supabaseClient
                        .from('sync_log')
                        .select('status, message')
                        .eq('id', runningLog.id)
                        .single();
                    if (!log || log.status === 'success') {
                        clearInterval(pollInterval);
                        setSyncLock(false);
                        setSyncProgress(log ? { type: 'products', status: 'success', message: log.message } : null);
                        await loadSyncLogs();
                        if (onDataChanged) await onDataChanged();
                    } else if (log.status === 'error') {
                        clearInterval(pollInterval);
                        setSyncLock(false);
                        setSyncProgress({ type: 'products', status: 'error', message: log.message });
                    } else {
                        setSyncProgress({ type: 'products', status: 'running', message: log.message || 'Sincronizando...' });
                    }
                }, 3000);
            }
        })();
    }, []);

    const loadStatus = async () => {
        try {
            // Se ja tem cache, nao mostra loading (refresh silencioso)
            if (!status) setStatusLoading(true);
            const data = await callFunction('tiny-auth', { action: 'status' });
            setStatus(data);
            // Pre-preencher credenciais do config compartilhado
            if (data.client_id && !clientId) setClientId(data.client_id);
            if (data.client_secret && !clientSecret) setClientSecret(data.client_secret);
            try { sessionStorage.setItem('tiny_status', JSON.stringify(data)); } catch(e) {}
        } catch (e) {
            console.error('Failed to load Tiny status:', e);
        } finally {
            setStatusLoading(false);
        }
    };

    const loadSyncLogs = async () => {
        try {
            const { data, error } = await supabaseClient
                .from('sync_log')
                .select('*')
                .order('started_at', { ascending: false })
                .limit(50);
            if (!error && data) {
                setSyncLogs(data);
                try { sessionStorage.setItem('tiny_syncLogs', JSON.stringify(data)); } catch(e) {}
            }
        } catch (e) {
            console.error('Failed to load sync logs:', e);
        }
    };

    const deleteSyncLog = async (logId) => {
        if (!confirm('Excluir este registro de sincronizacao?')) return;
        const { error } = await supabaseClient.from('sync_log').delete().eq('id', logId);
        if (error) { console.error('Erro ao excluir log:', error); alert('Erro ao excluir registro: ' + error.message); return; }
        await loadSyncLogs();
    };

    const handleConnect = async () => {
        // Se ja tem credentials salvos, reconectar sem enviar client_id/secret (usa os do shared)
        const hasStoredCredentials = status?.has_credentials;
        if (!hasStoredCredentials && (!clientId || !clientSecret)) return;
        setLoading(true);
        try {
            // Redirect URI fixo: sempre producao (registrado no app Tiny)
            const redirectUri = 'https://orne-estoque.vercel.app/tiny-callback';

            const body = {
                action: 'get_auth_url',
                redirect_uri: redirectUri,
            };
            // So envia credentials na primeira configuracao
            if (!hasStoredCredentials) {
                body.client_id = clientId;
                body.client_secret = clientSecret;
            }

            const data = await callFunction('tiny-auth', body);

            if (data.url) {
                // Store redirect_uri for the callback
                localStorage.setItem('tiny_redirect_uri', redirectUri);
                // Open Tiny authorization page
                window.open(data.url, 'tiny_auth', 'width=600,height=700');
            } else {
                alert(data.error || 'Erro ao gerar URL de autorizacao');
            }
        } catch (e) {
            alert('Erro: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    // Listen for OAuth callback
    useEffect(() => {
        const handleMessage = async (event) => {
            if (event.data?.type === 'tiny_oauth_callback' && event.data?.code) {
                const redirectUri = localStorage.getItem('tiny_redirect_uri');
                setLoading(true);
                try {
                    const data = await callFunction('tiny-auth', {
                        action: 'exchange_code',
                        code: event.data.code,
                        redirect_uri: redirectUri,
                    });
                    if (data.success) {
                        await loadStatus();
                        setTestResult({ success: true, message: 'Conectado com sucesso!' });
                    } else {
                        setTestResult({ success: false, message: data.error || 'Falha na autorizacao' });
                    }
                } catch (e) {
                    setTestResult({ success: false, message: e.message });
                } finally {
                    setLoading(false);
                }
            }
        };

        window.addEventListener('message', handleMessage);

        // Also check URL params (in case callback came to this window)
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        if (code && window.location.pathname === '/tiny-callback') {
            window.opener?.postMessage({ type: 'tiny_oauth_callback', code }, '*');
            window.close();
        }

        return () => window.removeEventListener('message', handleMessage);
    }, []);

    const handleSaveConfig = async () => {
        if (!clientId || !clientSecret) return;
        setLoading(true);
        try {
            const data = await callFunction('tiny-auth', {
                action: 'save_config',
                client_id: clientId,
                client_secret: clientSecret,
            });
            if (data.success) {
                await loadStatus();
                setTestResult({ success: true, message: 'Credenciais salvas!' });
            } else {
                setTestResult({ success: false, message: data.error });
            }
        } catch (e) {
            setTestResult({ success: false, message: e.message });
        } finally {
            setLoading(false);
        }
    };

    const handleTestConnection = async () => {
        setLoading(true);
        setTestResult(null);
        try {
            const data = await callFunction('tiny-auth', { action: 'test' });
            setTestResult({
                success: data.connected,
                message: data.connected ? 'Conexao OK! API respondendo.' : (data.error || 'Falha na conexao'),
            });
        } catch (e) {
            setTestResult({ success: false, message: e.message });
        } finally {
            setLoading(false);
        }
    };

    const handleDisconnect = async () => {
        if (!confirm('Desconectar do Tiny ERP?')) return;
        setLoading(true);
        try {
            await callFunction('tiny-auth', { action: 'disconnect' });
            await loadStatus();
            setTestResult(null);
        } catch (e) {
            alert('Erro: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSync = async (type) => {
        if (syncLock) return; // Ja tem sync rodando — impede race condition
        setSyncLock(true);
        setSyncProgress({ type, status: 'running' });
        try {
            if (type === 'products') {
                // UMA chamada inicia o sync — o backend continua sozinho
                setSyncProgress({ type, status: 'running', message: 'Iniciando sincronizacao...' });
                const data = await callFunction('tiny-sync-products', {});
                if (!data.success) throw new Error(data.error || 'Erro na sincronizacao');

                const logId = data.log_id;
                if (!logId) {
                    // Fallback se nao retornou log_id
                    setSyncProgress({ type, status: 'success', message: `${data.synced} produtos sincronizados.` });
                } else {
                    // Polling do sync_log — backend continua independentemente
                    let finished = data.finished;
                    while (!finished) {
                        await new Promise(r => setTimeout(r, 3000));
                        const { data: log } = await supabaseClient
                            .from('sync_log')
                            .select('status, message, items_synced, items_total, next_offset')
                            .eq('id', logId)
                            .single();
                        if (!log) break;
                        setSyncProgress({ type, status: 'running', message: log.message || 'Sincronizando...' });
                        if (log.status === 'success') {
                            finished = true;
                            setSyncProgress({ type, status: 'success', message: log.message });
                        } else if (log.status === 'error') {
                            throw new Error(log.message || 'Erro na sincronizacao');
                        }
                        // status === 'running' → continua polling
                    }
                }
            } else if (type === 'stock') {
                const data = await callFunction('tiny-sync-stock', {});
                setSyncProgress({ type, status: data.success ? 'success' : 'error',
                    message: data.success ? `${data.adjustments || 0} ajustes realizados` : (data.error || 'Erro') });
            } else if (type === 'nfe') {
                const data = await callFunction('tiny-sync-nfe', {
                    date_from: nfeDateFrom || undefined,
                    date_to: nfeDateTo || undefined,
                    nf_number: nfeNumber || undefined,
                });
                setSyncProgress({ type, status: data.success ? 'success' : 'error',
                    message: data.success ? `${data.imported || 0} itens processados` : (data.error || 'Erro') });
            }
            await loadSyncLogs();
            if (onDataChanged) await onDataChanged();
        } catch (e) {
            let msg = e.message || 'Erro desconhecido';
            if (msg.match(/401|nao autorizado/i) || msg.match(/token.*expir/i) || msg.match(/reconecte/i)) {
                msg = 'Sessao Tiny expirada. Va na aba Conexao e clique "Autorizar via OAuth2" para reconectar.';
            } else if (msg.match(/429/i)) {
                msg = 'Limite de requisicoes atingido. Aguarde alguns minutos e tente novamente.';
            } else if (msg.match(/5\d{2}/i)) {
                msg = 'Erro no servidor Tiny. Tente novamente em alguns minutos.';
            } else if (msg.match(/failed to fetch|network|rede/i)) {
                msg = 'Erro de conexao. Verifique sua internet e tente novamente.';
            }
            setSyncProgress({ type, status: 'error', message: msg });
        } finally {
            setSyncLock(false);
        }
    };

    const formatDate = (d) => {
        if (!d) return '-';
        return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    const tabStyle = (tab) => ({
        padding: '8px 16px',
        fontSize: '13px',
        fontWeight: activeSection === tab ? '600' : '400',
        color: activeSection === tab ? 'var(--accent)' : 'var(--text-secondary)',
        borderBottom: activeSection === tab ? '2px solid var(--accent)' : '2px solid transparent',
        cursor: 'pointer',
        background: 'none',
        border: 'none',
        borderBottomWidth: '2px',
        borderBottomStyle: 'solid',
        borderBottomColor: activeSection === tab ? 'var(--accent)' : 'transparent',
    });

    const cardStyle = {
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: '24px',
        marginBottom: '16px',
    };

    return (
        <div>
            <div className="page-header" style={{marginBottom: '24px'}}>
                <div className="page-header-flex">
                    <div>
                        <h1 className="page-title">Tiny ERP</h1>
                        <p className="page-subtitle">Integracao e sincronizacao com Tiny ERP (Olist)</p>
                    </div>
                    {statusLoading ? (
                        <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                            <span className="spinner" style={{width: '14px', height: '14px'}}></span>
                            <span style={{fontSize: '13px', color: 'var(--text-muted)', fontWeight: '500'}}>Verificando...</span>
                        </div>
                    ) : status?.connected && (
                        <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                            <span style={{width: '8px', height: '8px', borderRadius: '50%', background: 'var(--success)', display: 'inline-block'}}></span>
                            <span style={{fontSize: '13px', color: 'var(--success)', fontWeight: '500'}}>Conectado</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <div style={{display: 'flex', gap: '0', borderBottom: '1px solid var(--border)', marginBottom: '24px'}}>
                <button style={tabStyle('config')} onClick={() => setActiveSection('config')}>Configuracao</button>
                <button style={tabStyle('sync')} onClick={() => setActiveSection('sync')}>Sincronizacao</button>
                <button style={tabStyle('history')} onClick={() => setActiveSection('history')}>Historico</button>
            </div>

            {/* === CONFIG TAB === */}
            {activeSection === 'config' && (
                <div>
                    {/* Status card */}
                    <div style={cardStyle}>
                        <div style={{display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px'}}>
                            <div style={{width: '40px', height: '40px', borderRadius: 'var(--radius-sm)', background: statusLoading ? 'var(--bg-tertiary)' : status?.connected ? 'var(--success-light)' : 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                                {statusLoading
                                    ? <span className="spinner" style={{width: '20px', height: '20px'}}></span>
                                    : <Icon name={status?.connected ? 'check' : 'plug'} size={20} style={{color: status?.connected ? 'var(--success)' : 'var(--text-muted)'}} />
                                }
                            </div>
                            <div>
                                <div style={{fontWeight: '600', fontSize: '14px'}}>
                                    {statusLoading ? 'Verificando conexao...' : status?.connected ? 'Conectado ao Tiny ERP' : status?.token_expired ? 'Token expirado — reconecte' : status?.has_credentials ? 'Credenciais salvas, autorizacao pendente' : 'Nao configurado'}
                                </div>
                                <div style={{fontSize: '12px', color: 'var(--text-muted)'}}>
                                    {statusLoading ? 'Carregando status da integracao' : status?.connected ? `Token valido ate ${formatDate(status.expires_at)}` : status?.token_expired ? 'Clique em "Autorizar via OAuth2" para reconectar' : 'Configure suas credenciais OAuth2 abaixo'}
                                </div>
                            </div>
                        </div>

                        {/* Info box */}
                        <div style={{background: 'var(--info-light)', border: '1px solid var(--accent-light)', borderRadius: 'var(--radius-sm)', padding: '12px 16px', marginBottom: '20px', fontSize: '12px', color: 'var(--text-secondary)'}}>
                            <div style={{fontWeight: '600', marginBottom: '4px', color: 'var(--text-primary)'}}>
                                <Icon name="info" size={14} style={{marginRight: '6px', verticalAlign: 'middle'}} />
                                Como configurar
                            </div>
                            1. Acesse o Tiny ERP &rarr; Configuracoes &rarr; Geral &rarr; Aplicativos<br/>
                            2. Crie um novo aplicativo com permissoes de leitura para Produtos, Estoque e NF-e<br/>
                            3. Copie o Client ID e Client Secret gerados e cole abaixo
                        </div>

                        {/* Credentials form */}
                        <div style={{display: 'grid', gap: '16px'}}>
                            <div>
                                <label className="form-label">Client ID</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="Cole o Client ID do aplicativo Tiny"
                                    value={status?.has_credentials ? clientId : clientId}
                                    onChange={e => setClientId(e.target.value)}
                                    readOnly={!!status?.has_credentials}
                                    style={status?.has_credentials ? {background: 'var(--bg-secondary)', cursor: 'not-allowed'} : {}}
                                />
                            </div>
                            <div>
                                <label className="form-label">Client Secret</label>
                                <input
                                    type="password"
                                    className="form-input"
                                    placeholder="Cole o Client Secret"
                                    value={status?.has_credentials ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022' : clientSecret}
                                    onChange={e => { if (!status?.has_credentials) setClientSecret(e.target.value); }}
                                    readOnly={!!status?.has_credentials}
                                    style={status?.has_credentials ? {background: 'var(--bg-secondary)', cursor: 'not-allowed'} : {}}
                                />
                                {status?.has_credentials && (
                                    <div style={{fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px'}}>
                                        Credenciais salvas. Para alterar, desconecte primeiro.
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Actions */}
                        <div style={{display: 'flex', gap: '12px', marginTop: '20px', flexWrap: 'wrap'}}>
                            {!status?.has_credentials ? (
                                <React.Fragment>
                                    <button className="btn btn-primary" onClick={handleConnect} disabled={loading || !clientId || !clientSecret}>
                                        {loading ? <Icon name="spinner" size={14} style={{animation: 'spin 1s linear infinite'}} /> : <Icon name="tiny" size={14} />}
                                        <span style={{marginLeft: '6px'}}>{loading ? 'Conectando...' : 'Autorizar via OAuth2'}</span>
                                    </button>
                                    <button className="btn btn-secondary" onClick={handleSaveConfig} disabled={loading || !clientId || !clientSecret}>
                                        <Icon name="check" size={14} />
                                        <span style={{marginLeft: '6px'}}>Salvar Credenciais</span>
                                    </button>
                                </React.Fragment>
                            ) : !status?.connected ? (
                                <button className="btn btn-primary" onClick={handleConnect} disabled={loading}>
                                    {loading ? <Icon name="spinner" size={14} style={{animation: 'spin 1s linear infinite'}} /> : <Icon name="tiny" size={14} />}
                                    <span style={{marginLeft: '6px'}}>{loading ? 'Conectando...' : 'Reconectar OAuth2'}</span>
                                </button>
                            ) : null}
                            {status?.connected && (
                                <button className="btn btn-secondary" onClick={handleTestConnection} disabled={loading}>
                                    <Icon name="sync" size={14} />
                                    <span style={{marginLeft: '6px'}}>Testar Conexao</span>
                                </button>
                            )}
                            {status?.has_token && (
                                <button className="btn" style={{color: 'var(--danger)', border: '1px solid var(--danger)', background: 'transparent'}} onClick={handleDisconnect} disabled={loading}>
                                    <Icon name="close" size={14} />
                                    <span style={{marginLeft: '6px'}}>Desconectar</span>
                                </button>
                            )}
                        </div>

                        {/* Test result */}
                        {testResult && (
                            <div style={{
                                marginTop: '16px',
                                padding: '12px 16px',
                                borderRadius: 'var(--radius-sm)',
                                background: testResult.success ? 'var(--success-light)' : 'var(--danger-light)',
                                color: testResult.success ? 'var(--success-dark)' : 'var(--danger-dark)',
                                fontSize: '13px',
                                fontWeight: '500',
                            }}>
                                <Icon name={testResult.success ? 'success' : 'error'} size={14} style={{marginRight: '8px', verticalAlign: 'middle'}} />
                                {testResult.message}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* === SYNC TAB === */}
            {activeSection === 'sync' && (
                <div>
                    {!status?.connected && (
                        <div style={{...cardStyle, textAlign: 'center', padding: '48px 24px'}}>
                            <Icon name="plug" size={32} style={{color: 'var(--text-muted)', marginBottom: '12px'}} />
                            <div style={{fontWeight: '600', fontSize: '14px', marginBottom: '4px'}}>Nao conectado</div>
                            <div style={{fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px'}}>Configure suas credenciais na aba Configuracao primeiro.</div>
                            <button className="btn btn-primary" onClick={() => setActiveSection('config')}>
                                Ir para Configuracao
                            </button>
                        </div>
                    )}

                    {status?.connected && (
                        <div style={{display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))'}}>
                            {/* Products sync card */}
                            <div style={cardStyle}>
                                <div style={{display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px'}}>
                                    <div style={{width: '36px', height: '36px', borderRadius: 'var(--radius-sm)', background: 'var(--accent-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                                        <Icon name="stock" size={18} style={{color: 'var(--accent)'}} />
                                    </div>
                                    <div>
                                        <div style={{fontWeight: '600', fontSize: '14px'}}>Produtos</div>
                                        <div style={{fontSize: '12px', color: 'var(--text-muted)'}}>Importar catalogo do Tiny</div>
                                    </div>
                                </div>
                                <p style={{fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px'}}>
                                    Sincroniza produtos do Tiny ERP para o Orne Estoque. Produtos existentes sao atualizados pelo SKU.
                                </p>
                                <button
                                    className="btn btn-primary"
                                    style={{width: '100%'}}
                                    onClick={() => handleSync('products')}
                                    disabled={syncLock}
                                >
                                    {syncProgress?.type === 'products' && syncProgress?.status === 'running'
                                        ? <><Icon name="spinner" size={14} style={{animation: 'spin 1s linear infinite'}} /> <span style={{marginLeft: '6px'}}>Sincronizando...</span></>
                                        : <><Icon name="sync" size={14} /> <span style={{marginLeft: '6px'}}>Sincronizar Produtos</span></>
                                    }
                                </button>
                                {syncProgress?.type === 'products' && syncProgress?.status === 'running' && syncProgress?.message && (
                                    <div style={{
                                        marginTop: '8px',
                                        padding: '6px 10px',
                                        borderRadius: 'var(--radius-xs)',
                                        background: 'var(--accent-bg)',
                                        fontSize: '11px',
                                        color: 'var(--accent)',
                                        fontWeight: '500',
                                    }}>
                                        {syncProgress.message}
                                    </div>
                                )}
                                {syncProgress?.type === 'products' && syncProgress?.status !== 'running' && (
                                    <div style={{
                                        marginTop: '12px',
                                        padding: '8px 12px',
                                        borderRadius: 'var(--radius-xs)',
                                        background: syncProgress.status === 'success' ? 'var(--success-light)' : 'var(--danger-light)',
                                        fontSize: '12px',
                                        color: syncProgress.status === 'success' ? 'var(--success-dark)' : 'var(--danger-dark)',
                                    }}>
                                        {syncProgress.message}
                                    </div>
                                )}
                            </div>

                            {/* Stock sync card */}
                            <div style={cardStyle}>
                                <div style={{display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px'}}>
                                    <div style={{width: '36px', height: '36px', borderRadius: 'var(--radius-sm)', background: 'var(--success-light)', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                                        <Icon name="chart" size={18} style={{color: 'var(--success)'}} />
                                    </div>
                                    <div>
                                        <div style={{fontWeight: '600', fontSize: '14px'}}>Estoque</div>
                                        <div style={{fontSize: '12px', color: 'var(--text-muted)'}}>Ajustar quantidades</div>
                                    </div>
                                </div>
                                <p style={{fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px'}}>
                                    Compara estoque do Tiny com o Orne e cria ajustes automaticos (entradas/saidas) para igualar.
                                </p>
                                <button
                                    className="btn btn-primary"
                                    style={{width: '100%'}}
                                    onClick={() => handleSync('stock')}
                                    disabled={syncLock}
                                >
                                    {syncProgress?.type === 'stock' && syncProgress?.status === 'running'
                                        ? <><Icon name="spinner" size={14} style={{animation: 'spin 1s linear infinite'}} /> <span style={{marginLeft: '6px'}}>Sincronizando...</span></>
                                        : <><Icon name="sync" size={14} /> <span style={{marginLeft: '6px'}}>Sincronizar Estoque</span></>
                                    }
                                </button>
                                {syncProgress?.type === 'stock' && syncProgress?.status !== 'running' && (
                                    <div style={{
                                        marginTop: '12px',
                                        padding: '8px 12px',
                                        borderRadius: 'var(--radius-xs)',
                                        background: syncProgress.status === 'success' ? 'var(--success-light)' : 'var(--danger-light)',
                                        fontSize: '12px',
                                        color: syncProgress.status === 'success' ? 'var(--success-dark)' : 'var(--danger-dark)',
                                    }}>
                                        {syncProgress.message}
                                    </div>
                                )}
                            </div>

                            {/* NF-e import removido — funcionalidade integrada em Entrada/Saida */}
                        </div>
                    )}
                </div>
            )}

            {/* === HISTORY TAB === */}
            {activeSection === 'history' && (() => {
                const filteredLogs = filterByPeriod(syncLogs, histPeriodFilter, histCustomMonth, histCustomYear, 'started_at')
                    .sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
                return (
                <div>
                    <div style={{display: 'flex', justifyContent: 'flex-end', marginBottom: '16px'}}>
                        <button className="btn btn-secondary" onClick={loadSyncLogs}>
                            <Icon name="refresh" size={14} />
                            <span style={{marginLeft: '6px'}}>Atualizar</span>
                        </button>
                    </div>

                    <PeriodFilter
                        periodFilter={histPeriodFilter} setPeriodFilter={setHistPeriodFilter}
                        customMonth={histCustomMonth} setCustomMonth={setHistCustomMonth}
                        customYear={histCustomYear} setCustomYear={setHistCustomYear}
                    />

                    {filteredLogs.length === 0 ? (
                        <div style={{...cardStyle, textAlign: 'center', padding: '48px 24px'}}>
                            <Icon name="empty" size={32} style={{color: 'var(--text-muted)', marginBottom: '12px'}} />
                            <div style={{fontWeight: '600', fontSize: '14px', marginBottom: '4px'}}>Nenhum registro</div>
                            <div style={{fontSize: '13px', color: 'var(--text-muted)'}}>Os registros de sincronizacao aparecerao aqui.</div>
                        </div>
                    ) : (
                        <div className="table-container" style={{border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden'}}>
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Tipo</th>
                                        <th>Status</th>
                                        <th>Itens</th>
                                        <th>Mensagem</th>
                                        <th>Inicio</th>
                                        <th>Fim</th>
                                        <th style={{width: '50px'}}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredLogs.map(log => (
                                        <tr key={log.id}>
                                            <td>
                                                <span className={`badge ${log.type === 'products' ? 'badge-info' : log.type === 'stock' ? 'badge-success' : 'badge-purple'}`} style={log.type === 'nfe' ? {background: 'var(--purple-bg)', color: 'var(--purple)'} : {}}>
                                                    {log.type === 'products' ? 'Produtos' : log.type === 'stock' ? 'Estoque' : 'NF-e'}
                                                </span>
                                            </td>
                                            <td>
                                                <span style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    fontSize: '12px',
                                                    fontWeight: '500',
                                                    color: log.status === 'success' ? 'var(--success)' : log.status === 'error' ? 'var(--danger)' : 'var(--warning)',
                                                }}>
                                                    <Icon name={log.status === 'success' ? 'check' : log.status === 'error' ? 'error' : 'spinner'} size={12} />
                                                    {log.status === 'success' ? 'Sucesso' : log.status === 'error' ? 'Erro' : 'Em andamento'}
                                                </span>
                                            </td>
                                            <td style={{fontSize: '13px', fontWeight: '500'}}>
                                                {log.items_synced}/{log.items_total}
                                            </td>
                                            <td style={{fontSize: '12px', color: 'var(--text-secondary)', maxWidth: '300px'}}>
                                                {log.message || '-'}
                                            </td>
                                            <td style={{fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap'}}>
                                                {formatDate(log.started_at)}
                                            </td>
                                            <td style={{fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap'}}>
                                                {formatDate(log.finished_at)}
                                            </td>
                                            <td>
                                                <button className="btn btn-icon btn-secondary" onClick={() => deleteSyncLog(log.id)} title="Excluir" style={{padding: '4px 6px'}}>
                                                    <Icon name="delete" size={13} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
                );
            })()}
        </div>
    );
}
