/**
 * ShippingList.jsx — Shipping list with filters, status, and tracking
 *
 * Extracted from ShippingManager (index-legacy.html L7300-7624)
 * Includes: filteredShippings, tracking updates, edit modal, status management
 */
import React, { useState, useMemo } from 'react';
import { Icon } from '@/utils/icons';
import PeriodFilter, { filterByPeriod } from '@/components/ui/PeriodFilter';
import { fetchTrackingInfo } from '@/services/trackingService';
import { supabaseClient } from '@/config/supabase';

export default function ShippingList({
    shippings, onUpdate, onDelete, isStockAdmin, locaisOrigem,
    statusList, transportadoras
}) {
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [shipPeriodFilter, setShipPeriodFilter] = useState('30');
    const [shipCustomMonth, setShipCustomMonth] = useState(new Date().getMonth());
    const [shipCustomYear, setShipCustomYear] = useState(new Date().getFullYear());
    const [editingShipping, setEditingShipping] = useState(null);
    const [atualizandoRastreio, setAtualizandoRastreio] = useState(false);
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');

    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        return date.toLocaleDateString('pt-BR') + ' ' + date.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'});
    };

    // Filtrar despachos
    const filteredShippings = useMemo(() => {
        let items = filterByPeriod(shippings, shipPeriodFilter, shipCustomMonth, shipCustomYear, 'date');
        items = items.filter(s => {
            const search = searchTerm.toLowerCase();
            const matchesSearch = (s.nfNumero || '').toLowerCase().includes(search) ||
                                 (s.cliente || '').toLowerCase().includes(search) ||
                                 (s.codigoRastreio || '').toLowerCase().includes(search);
            const matchesStatus = statusFilter === 'all' || s.status === statusFilter;
            return matchesSearch && matchesStatus;
        });
        return items.sort((a, b) => new Date(b.date) - new Date(a.date));
    }, [shippings, searchTerm, statusFilter, shipPeriodFilter, shipCustomMonth, shipCustomYear]);

    // Atualizar rastreio via Melhor Envio (individual)
    const atualizarRastreioMelhorEnvio = async (shipping) => {
        if (!shipping.melhorEnvioId && !shipping.codigoRastreio) {
            setError('Informe o ID da etiqueta ou código de rastreio');
            return;
        }
        setAtualizandoRastreio(true);
        try {
            const info = await fetchTrackingInfo(shipping);
            if (info && info.status) {
                await onUpdate(shipping.id, {
                    status: info.status,
                    codigoRastreio: info.codigoRastreio || shipping.codigoRastreio,
                    ultimaAtualizacaoRastreio: new Date().toISOString(),
                    rastreioInfo: info,
                });
                setSuccess(`Rastreio atualizado: ${info.status}`);
                setTimeout(() => setSuccess(''), 3000);
            }
        } catch (err) {
            setError('Erro ao atualizar rastreio: ' + err.message);
            setTimeout(() => setError(''), 5000);
        } finally {
            setAtualizandoRastreio(false);
        }
    };

    // Atualizar todos os rastreios pendentes
    const atualizarTodosRastreios = async () => {
        const pendentes = shippings.filter(s =>
            s.status !== 'ENTREGUE' &&
            s.status !== 'CANCELADO' &&
            s.status !== 'DEVOLVIDO' &&
            (s.melhorEnvioId || s.codigoRastreio)
        );
        if (pendentes.length === 0) {
            setError('Nenhum despacho pendente para atualizar');
            return;
        }
        setAtualizandoRastreio(true);
        let atualizados = 0;
        for (const shipping of pendentes) {
            try {
                const info = await fetchTrackingInfo(shipping);
                if (info && info.status) {
                    await onUpdate(shipping.id, {
                        status: info.status,
                        codigoRastreio: info.codigoRastreio || shipping.codigoRastreio,
                        ultimaAtualizacaoRastreio: new Date().toISOString(),
                        rastreioInfo: info,
                    });
                    atualizados++;
                }
            } catch (err) {
                console.error('Erro ao atualizar rastreio:', shipping.nfNumero, err);
            }
        }
        setAtualizandoRastreio(false);
        setSuccess(`${atualizados} rastreio(s) atualizado(s)`);
        setTimeout(() => setSuccess(''), 5000);
    };

    // Atualizar status
    const handleUpdateStatus = async (shipping, newStatus) => {
        await onUpdate(shipping.id, {
            status: newStatus,
            [`status_${newStatus}_date`]: new Date().toISOString()
        });
    };

    // Gerar link de rastreio baseado na transportadora
    const gerarLinkRastreio = (transportadora, codigo) => {
        if (!codigo) return '';
        const links = {
            'Correios': `https://rastreamento.correios.com.br/app/index.php?objetos=${codigo}`,
            'Jadlog': `https://www.jadlog.com.br/jadlog/tracking?cte=${codigo}`,
            'Total Express': `https://totalexpress.com.br/rastreamento/?codigo=${codigo}`,
            'TNT': `https://radar.tntbrasil.com.br/radar/${codigo}`,
        };
        return links[transportadora] || '';
    };

    return (
        <div className="card">
            {success && <div className="alert alert-success">{success}</div>}
            {error && <div className="alert alert-danger">{error}</div>}

            <div style={{display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center'}}>
                <div className="search-box" style={{flex: 1, minWidth: '200px', marginBottom: 0}}>
                    <span className="search-icon"><Icon name="search" size={14} /></span>
                    <input
                        type="text"
                        className="search-input"
                        placeholder="Buscar por NF, cliente ou rastreio..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <button
                    className="btn btn-primary"
                    onClick={atualizarTodosRastreios}
                    disabled={atualizandoRastreio}
                    style={{whiteSpace: 'nowrap'}}
                >
                    {atualizandoRastreio ? 'Atualizando...' : 'Atualizar Rastreios'}
                </button>
            </div>

            <div className="filter-tabs" style={{marginBottom: '12px'}}>
                <button className={`filter-tab ${statusFilter === 'all' ? 'active' : ''}`} onClick={() => setStatusFilter('all')}>
                    Todos ({shippings.length})
                </button>
                {Object.entries(statusList).map(([key, val]) => (
                    <button
                        key={key}
                        className={`filter-tab ${statusFilter === key ? 'active' : ''}`}
                        onClick={() => setStatusFilter(key)}
                    >
                        {val.label} ({shippings.filter(s => s.status === key).length})
                    </button>
                ))}
            </div>

            <PeriodFilter
                periodFilter={shipPeriodFilter} setPeriodFilter={setShipPeriodFilter}
                customMonth={shipCustomMonth} setCustomMonth={setShipCustomMonth}
                customYear={shipCustomYear} setCustomYear={setShipCustomYear}
            />

            {filteredShippings.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-state-icon"><Icon name="shipping" size={48} /></div>
                    <h3>Nenhum despacho encontrado</h3>
                    <p>Importe uma NF ou cadastre manualmente</p>
                </div>
            ) : (
                <div className="table-container">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>NF</th>
                                <th>Cliente</th>
                                <th>Origem</th>
                                <th>Transportadora</th>
                                <th>Rastreio</th>
                                <th>Status</th>
                                {isStockAdmin && <th>Ações</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredShippings.map(s => (
                                <tr key={s.id}>
                                    <td>
                                        <strong>{s.nfNumero}</strong>
                                        <div style={{fontSize: '10px', color: 'var(--text-muted)'}}>{formatDate(s.date)}</div>
                                    </td>
                                    <td>
                                        {s.cliente}
                                        {s.destino && <div style={{fontSize: '10px', color: 'var(--text-muted)'}}>{s.destino.substring(0, 30)}...</div>}
                                    </td>
                                    <td style={{fontSize: '12px'}}>{s.localOrigem}</td>
                                    <td style={{fontSize: '12px'}}>{s.transportadora || '-'}</td>
                                    <td>
                                        {s.codigoRastreio ? (
                                            <div>
                                                <code style={{fontSize: '11px'}}>{s.codigoRastreio}</code>
                                                {s.linkRastreio && (
                                                    <a href={s.linkRastreio} target="_blank" rel="noopener noreferrer"
                                                       style={{marginLeft: '8px', fontSize: '11px'}}>
                                                        Rastrear
                                                    </a>
                                                )}
                                            </div>
                                        ) : (
                                            <button
                                                className="btn btn-secondary btn-sm"
                                                onClick={() => setEditingShipping({...s})}
                                                style={{fontSize: '11px', padding: '4px 8px'}}
                                            >
                                                + Adicionar
                                            </button>
                                        )}
                                    </td>
                                    <td>
                                        <select
                                            value={s.status}
                                            onChange={(e) => handleUpdateStatus(s, e.target.value)}
                                            style={{
                                                background: statusList[s.status]?.bg,
                                                color: statusList[s.status]?.color,
                                                border: 'none',
                                                borderRadius: '12px',
                                                padding: '4px 8px',
                                                fontSize: '11px',
                                                fontWeight: '600',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            {Object.entries(statusList).map(([key, val]) => (
                                                <option key={key} value={key}>{val.label}</option>
                                            ))}
                                        </select>
                                        {s.ultimaAtualizacaoRastreio && (
                                            <div style={{fontSize: '9px', color: 'var(--text-muted)', marginTop: '2px'}}>
                                                Atualizado: {formatDate(s.ultimaAtualizacaoRastreio)}
                                            </div>
                                        )}
                                    </td>
                                    <td>
                                        <div style={{display: 'flex', gap: '4px'}}>
                                            {(s.melhorEnvioId || s.transportadora === 'Melhor Envio') && (
                                                <button
                                                    className="btn btn-icon btn-primary btn-sm"
                                                    onClick={() => atualizarRastreioMelhorEnvio(s)}
                                                    disabled={atualizandoRastreio}
                                                    title="Atualizar status via Melhor Envio"
                                                    style={{fontSize: '10px'}}
                                                >
                                                    {atualizandoRastreio ? '...' : ''}
                                                </button>
                                            )}
                                            {isStockAdmin && (<button
                                                className="btn btn-icon btn-secondary btn-sm"
                                                onClick={() => setEditingShipping({...s})}
                                                title="Editar despacho"
                                            ><Icon name="edit" size={14} /></button>)}
                                            {isStockAdmin && (<button
                                                className="btn btn-icon btn-secondary btn-sm"
                                                onClick={() => {
                                                    if(confirm('Excluir este despacho?')) onDelete(s.id);
                                                }}
                                                title="Excluir"
                                            ><Icon name="delete" size={14} /></button>)}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modal Editar Despacho Completo */}
            {editingShipping && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{maxWidth: '600px'}}>
                        <h2 className="modal-title">Editar Despacho</h2>
                        <p className="modal-subtitle">Atualize as informações do despacho</p>

                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">Número da NF</label>
                                <input type="text" className="form-input" value={editingShipping.nfNumero || ''} onChange={(e) => setEditingShipping({...editingShipping, nfNumero: e.target.value})} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Cliente</label>
                                <input type="text" className="form-input" value={editingShipping.cliente || ''} onChange={(e) => setEditingShipping({...editingShipping, cliente: e.target.value})} />
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Endereço de Destino</label>
                            <input type="text" className="form-input" value={editingShipping.destino || ''} onChange={(e) => setEditingShipping({...editingShipping, destino: e.target.value})} />
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">Local de Origem</label>
                                <select className="form-select" value={editingShipping.localOrigem || ''} onChange={(e) => setEditingShipping({...editingShipping, localOrigem: e.target.value})}>
                                    {locaisOrigem.map(l => <option key={l} value={l}>{l}</option>)}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Transportadora</label>
                                <select className="form-select" value={editingShipping.transportadora || ''} onChange={(e) => setEditingShipping({...editingShipping, transportadora: e.target.value})}>
                                    <option value="">Selecione...</option>
                                    {transportadoras.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">Código de Rastreio</label>
                                <input type="text" className="form-input" value={editingShipping.codigoRastreio || ''} onChange={(e) => {
                                    const codigo = e.target.value;
                                    const link = gerarLinkRastreio(editingShipping.transportadora, codigo);
                                    setEditingShipping({...editingShipping, codigoRastreio: codigo, linkRastreio: link || editingShipping.linkRastreio});
                                }} placeholder="Ex: AA123456789BR" />
                            </div>
                            <div className="form-group">
                                <label className="form-label">ID Melhor Envio</label>
                                <input type="text" className="form-input" value={editingShipping.melhorEnvioId || ''} onChange={(e) => setEditingShipping({...editingShipping, melhorEnvioId: e.target.value})} placeholder="UUID da etiqueta" />
                            </div>
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">Link de Rastreio</label>
                                <input type="url" className="form-input" value={editingShipping.linkRastreio || ''} onChange={(e) => setEditingShipping({...editingShipping, linkRastreio: e.target.value})} placeholder="https://..." />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Status</label>
                                <select className="form-select" value={editingShipping.status || 'PENDENTE'} onChange={(e) => setEditingShipping({...editingShipping, status: e.target.value})}>
                                    {Object.entries(statusList).map(([key, val]) => (
                                        <option key={key} value={key}>{val.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Link de Rastreio</label>
                            <input type="url" className="form-input" value={editingShipping.linkRastreio || ''} onChange={(e) => setEditingShipping({...editingShipping, linkRastreio: e.target.value})} placeholder="https://..." />
                            <span className="form-help">Gerado automaticamente para transportadoras conhecidas</span>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Observações</label>
                            <textarea className="form-textarea" value={editingShipping.observacoes || ''} onChange={(e) => setEditingShipping({...editingShipping, observacoes: e.target.value})} placeholder="Informações adicionais..." />
                        </div>

                        <div className="btn-group">
                            <button
                                className="btn btn-primary"
                                onClick={async () => {
                                    await onUpdate(editingShipping.id, {
                                        nfNumero: editingShipping.nfNumero,
                                        cliente: editingShipping.cliente,
                                        destino: editingShipping.destino,
                                        localOrigem: editingShipping.localOrigem,
                                        transportadora: editingShipping.transportadora,
                                        codigoRastreio: editingShipping.codigoRastreio,
                                        linkRastreio: editingShipping.linkRastreio,
                                        melhorEnvioId: editingShipping.melhorEnvioId,
                                        status: editingShipping.status,
                                        observacoes: editingShipping.observacoes,
                                        updatedAt: new Date().toISOString()
                                    });
                                    setEditingShipping(null);
                                    setSuccess('Despacho atualizado com sucesso!');
                                    setTimeout(() => setSuccess(''), 3000);
                                }}
                            >
                                Salvar Alterações
                            </button>
                            <button className="btn btn-secondary" onClick={() => setEditingShipping(null)}>Cancelar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
