/**
 * AdminPanel.jsx — User management panel (approve/reject/role)
 *
 * Extracted from index-legacy.html L2117-2238
 */
import React, { useState, useEffect } from 'react';
import { supabaseClient } from '@/config/supabase';

export default function AdminPanel({ currentUserId }) {
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);

  useEffect(() => {
    loadUsers();
    const channel = supabaseClient.channel('admin-user-profiles')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_profiles' }, () => loadUsers())
      .subscribe();
    return () => supabaseClient.removeChannel(channel);
  }, []);

  const loadUsers = async () => {
    const { data } = await supabaseClient.from('user_profiles').select('*').order('created_at', { ascending: false });
    if (data) setUsers(data);
    setLoadingUsers(false);
  };

  const updateUser = async (userId, updates) => {
    setActionLoading(userId);
    await supabaseClient.from('user_profiles').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', userId);
    await loadUsers();
    setActionLoading(null);
  };

  const statusBadge = (status) => {
    const map = {
      'approved': { label: 'Aprovado', cls: 'badge-success' },
      'pending': { label: 'Pendente', cls: 'badge-warning' },
      'rejected': { label: 'Rejeitado', cls: 'badge-danger' }
    };
    const s = map[status] || { label: status, cls: '' };
    return <span className={`badge ${s.cls}`}>{s.label}</span>;
  };

  const roleBadge = (role) => {
    return role === 'admin'
      ? <span className="badge badge-info">Admin</span>
      : <span className="badge" style={{background: 'var(--bg-tertiary)', color: 'var(--text-secondary)'}}>Usuário</span>;
  };

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Gerenciar Usuários</h1>
        <p className="page-subtitle">Aprove ou rejeite cadastros de novos usuários</p>
      </div>

      {loadingUsers ? (
        <div style={{textAlign: 'center', padding: '40px'}}>
          <div className="loading-spinner" style={{margin: '0 auto'}}></div>
        </div>
      ) : (
        <div className="card">
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>E-mail</th>
                  <th>Função</th>
                  <th>Status</th>
                  <th>Cadastro</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td style={{fontWeight: 500}}>{u.email || '—'}</td>
                    <td>{roleBadge(u.role)}</td>
                    <td>{statusBadge(u.status)}</td>
                    <td style={{fontSize: '12px', color: 'var(--text-secondary)'}}>{formatDate(u.created_at)}</td>
                    <td>
                      <div style={{display: 'flex', gap: '6px', flexWrap: 'wrap'}}>
                        {u.status !== 'approved' && (
                          <button
                            className="btn btn-primary"
                            style={{fontSize: '12px', padding: '4px 10px', minHeight: 'auto', background: 'var(--accent-success)', borderColor: 'var(--accent-success)'}}
                            disabled={actionLoading === u.id}
                            onClick={() => updateUser(u.id, { status: 'approved' })}
                          >Aprovar</button>
                        )}
                        {u.status !== 'rejected' && u.id !== currentUserId && (
                          <button
                            className="btn btn-secondary"
                            style={{fontSize: '12px', padding: '4px 10px', minHeight: 'auto', color: 'var(--accent-error)', borderColor: 'var(--accent-error)'}}
                            disabled={actionLoading === u.id}
                            onClick={() => updateUser(u.id, { status: 'rejected' })}
                          >Rejeitar</button>
                        )}
                        {u.status === 'approved' && u.role !== 'admin' && (
                          <button
                            className="btn btn-secondary"
                            style={{fontSize: '12px', padding: '4px 10px', minHeight: 'auto'}}
                            disabled={actionLoading === u.id}
                            onClick={() => updateUser(u.id, { role: 'admin' })}
                          >Tornar Admin</button>
                        )}
                        {u.role === 'admin' && u.id !== currentUserId && (
                          <button
                            className="btn btn-secondary"
                            style={{fontSize: '12px', padding: '4px 10px', minHeight: 'auto'}}
                            disabled={actionLoading === u.id}
                            onClick={() => updateUser(u.id, { role: 'user' })}
                          >Remover Admin</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
