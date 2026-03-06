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
    statusList, statusTransitions, transportadoras
}) {
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [shipPeriodFilter, setShipPeriodFilter] = useState('30');
    const [shipCustomMonth, setShipCustomMonth] = useState(new Date().getMonth());
    const [shipCustomYear, setShipCustomYear] = useState(new Date().getFullYear());
    const [editingShipping, setEditingShipping] = useState(null);
    const [atualizandoRastreio, setAtualizandoRastreio] = useState(false);
    const [openStatusMenu, setOpenStatusMenu] = useState(null);
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

    // Status progression — only advances, never regresses
    const STATUS_RANK = { DESPACHADO: 0, EM_TRANSITO: 1, ENTREGUE: 2, DEVOLVIDO: 2 };
    const VALID_STATUSES = ['DESPACHADO', 'EM_TRANSITO', 'ENTREGUE', 'DEVOLVIDO'];

    const shouldUpdateStatus = (currentStatus, newStatus) => {
        if (!VALID_STATUSES.includes(newStatus)) return false;
        if (currentStatus === 'ENTREGUE' || currentStatus === 'DEVOLVIDO') return false;
        return (STATUS_RANK[newStatus] ?? -1) > (STATUS_RANK[currentStatus] ?? -1);
    };

    // Atualizar rastreio (individual)
    const atualizarRastreioMelhorEnvio = async (shipping) => {
        if (!shipping.melhorEnvioId && !shipping.codigoRastreio) {
            setError('Informe o ID da etiqueta ou código de rastreio');
            return;
        }
        setAtualizandoRastreio(true);
        try {
            const info = await fetchTrackingInfo(shipping);
            if (info) {
                const updateData = {
                    ultimaAtualizacaoRastreio: new Date().toISOString(),
                    rastreioInfo: info,
                };
                // Only update status if it's a valid progression
                if (info.status && shouldUpdateStatus(shipping.status, info.status)) {
                    updateData.status = info.status;
                }
                if (info.codigoRastreio) {
                    updateData.codigoRastreio = info.codigoRastreio;
                }
                // Save tracking link from Edge Function (carrier detection)
                if (info.linkRastreio) {
                    updateData.linkRastreio = info.linkRastreio;
                }
                await onUpdate(shipping.id, updateData);

                const statusMsg = updateData.status
                    ? `${shipping.status} → ${updateData.status}`
                    : shipping.status;
                const eventoMsg = info.ultimoEvento
                    ? ` | ${info.ultimoEvento}`
                    : '';
                setSuccess(`Rastreio atualizado: ${statusMsg}${eventoMsg}`);
                setTimeout(() => setSuccess(''), 5000);
            } else {
                setSuccess('Nenhuma atualização disponível');
                setTimeout(() => setSuccess(''), 3000);
            }
        } catch (err) {
            // Save the error to rastreioInfo so it persists in the UI
            try {
                await onUpdate(shipping.id, {
                    ultimaAtualizacaoRastreio: new Date().toISOString(),
                    rastreioInfo: { erro: err.message },
                });
            } catch (_) { /* ignore save error */ }
            setError('Erro ao atualizar rastreio: ' + err.message);
            setTimeout(() => setError(''), 8000);
        } finally {
            setAtualizandoRastreio(false);
        }
    };

    // Atualizar todos os rastreios pendentes
    const atualizarTodosRastreios = async () => {
        const pendentes = shippings.filter(s =>
            s.status !== 'ENTREGUE' &&
            s.status !== 'DEVOLVIDO' &&
            (s.melhorEnvioId || s.codigoRastreio)
        );
        if (pendentes.length === 0) {
            setError('Nenhum despacho pendente para atualizar');
            return;
        }
        setAtualizandoRastreio(true);
        let atualizados = 0;
        let erros = 0;
        for (const shipping of pendentes) {
            try {
                const info = await fetchTrackingInfo(shipping);
                if (info) {
                    const updateData = {
                        ultimaAtualizacaoRastreio: new Date().toISOString(),
                        rastreioInfo: info,
                    };
                    if (info.status && shouldUpdateStatus(shipping.status, info.status)) {
                        updateData.status = info.status;
                    }
                    if (info.codigoRastreio) {
                        updateData.codigoRastreio = info.codigoRastreio;
                    }
                    // Save tracking link from Edge Function (carrier detection)
                    if (info.linkRastreio) {
                        updateData.linkRastreio = info.linkRastreio;
                    }
                    await onUpdate(shipping.id, updateData);
                    atualizados++;
                }
            } catch (err) {
                console.error('Erro ao atualizar rastreio:', shipping.nfNumero, err.message);
                // Save error info to DB so it shows in the rastreio column
                try {
                    await onUpdate(shipping.id, {
                        ultimaAtualizacaoRastreio: new Date().toISOString(),
                        rastreioInfo: { erro: err.message },
                    });
                } catch (_) { /* ignore save error */ }
                erros++;
            }
        }
        setAtualizandoRastreio(false);
        const msg = erros > 0
            ? `${atualizados} atualizado(s), ${erros} com erro`
            : `${atualizados} rastreio(s) atualizado(s)`;
        setSuccess(msg);
        setTimeout(() => setSuccess(''), 5000);
    };

    // Atualizar status
    const handleUpdateStatus = async (shipping, newStatus) => {
        await onUpdate(shipping.id, {
            status: newStatus,
            [`status_${newStatus}_date`]: new Date().toISOString()
        });
    };

    // Gerar link de rastreio baseado na transportadora ou código
    const gerarLinkRastreio = (transportadora, codigo) => {
        if (!codigo) return '';
        const c = codigo.trim().toUpperCase();

        // Detect carrier from tracking code prefix
        if (c.startsWith('LGI'))
            return `https://t.17track.net/en#nums=${encodeURIComponent(codigo)}`;
        if (c.startsWith('JD') || c.startsWith('JAD'))
            return `https://www.jadlog.com.br/jadlog/tracking?cte=${encodeURIComponent(codigo)}`;

        // Known carriers by name
        const links = {
            'Correios': `https://rastreamento.correios.com.br/app/index.php?objetos=${codigo}`,
            'Jadlog': `https://www.jadlog.com.br/jadlog/tracking?cte=${codigo}`,
            'Total Express': `https://totalexpress.com.br/rastreamento/?codigo=${codigo}`,
            'TNT': `https://radar.tntbrasil.com.br/radar/${codigo}`,
        };
        if (links[transportadora]) return links[transportadora];

        // Correios format: AA123456789BR
        if (/^[A-Z]{2}\d{9}[A-Z]{2}$/.test(c))
            return `https://rastreamento.correios.com.br/app/index.php?objetos=${codigo}`;

        // Fallback: universal tracker
        return `https://t.17track.net/en#nums=${encodeURIComponent(codigo)}`;
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
                                                {(() => {
                                                    const trackLink = s.linkRastreio || s.rastreioInfo?.linkRastreio || gerarLinkRastreio(s.transportadora, s.codigoRastreio);
                                                    return trackLink ? (
                                                        <a href={trackLink} target="_blank" rel="noopener noreferrer"
                                                           style={{marginLeft: '8px', fontSize: '11px', fontWeight: 500}}>
                                                            Rastrear ↗
                                                        </a>
                                                    ) : null;
                                                })()}
                                                {s.rastreioInfo?.ultimoEvento && !s.rastreioInfo?.erro && (
                                                    <div style={{
                                                        fontSize: '10px',
                                                        color: s.rastreioInfo.rastreioAutomatico === false ? '#2563eb' : 'var(--text-muted)',
                                                        marginTop: '2px',
                                                        maxWidth: '220px',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap',
                                                    }}>
                                                        {s.rastreioInfo.rastreioAutomatico === false && (
                                                            <span title={`Transportadora: ${s.rastreioInfo.transportadoraDetectada || 'Desconhecida'}`}>ℹ </span>
                                                        )}
                                                        {s.rastreioInfo.ultimoEvento}
                                                        {s.rastreioInfo.dataUltimoEvento && (
                                                            <span style={{marginLeft: '4px', opacity: 0.7}}>({s.rastreioInfo.dataUltimoEvento})</span>
                                                        )}
                                                    </div>
                                                )}
                                                {s.rastreioInfo?.erro && (
                                                    <div style={{fontSize: '10px', color: '#ef4444', marginTop: '2px', maxWidth: '250px', cursor: 'help'}} title={s.rastreioInfo.erro}>
                                                        ⚠ {s.rastreioInfo.erro.substring(0, 100)}{s.rastreioInfo.erro.length > 100 ? '...' : ''}
                                                    </div>
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
                                        <div style={{position: 'relative', display: 'inline-flex', alignItems: 'center', gap: '2px'}}>
                                            <span style={{
                                                display: 'inline-block',
                                                background: statusList[s.status]?.bg || '#f3f4f6',
                                                color: statusList[s.status]?.textColor || '#6b7280',
                                                borderRadius: '12px',
                                                padding: '3px 10px',
                                                fontSize: '11px',
                                                fontWeight: '500',
                                                lineHeight: '1.4',
                                                whiteSpace: 'nowrap',
                                            }}>
                                                {statusList[s.status]?.label || s.status}
                                            </span>
                                            {isStockAdmin && (statusTransitions[s.status] || []).length > 0 && (
                                                <>
                                                    <button
                                                        onClick={() => setOpenStatusMenu(openStatusMenu === s.id ? null : s.id)}
                                                        style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            width: '18px',
                                                            height: '18px',
                                                            border: 'none',
                                                            background: 'transparent',
                                                            color: 'var(--text-muted)',
                                                            cursor: 'pointer',
                                                            borderRadius: '4px',
                                                            padding: 0,
                                                            fontSize: '10px',
                                                            transition: 'background 0.15s, color 0.15s',
                                                        }}
                                                        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-primary)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                                                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                                                        title="Alterar status"
                                                    >
                                                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                                            <path d="M3 4l2 2 2-2" />
                                                        </svg>
                                                    </button>
                                                    {openStatusMenu === s.id && (
                                                        <>
                                                            <div
                                                                style={{position: 'fixed', inset: 0, zIndex: 998}}
                                                                onClick={() => setOpenStatusMenu(null)}
                                                            />
                                                            <div style={{
                                                                position: 'absolute',
                                                                top: 'calc(100% + 4px)',
                                                                left: 0,
                                                                zIndex: 999,
                                                                background: '#fff',
                                                                border: '1px solid var(--border)',
                                                                borderRadius: '8px',
                                                                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                                                padding: '4px',
                                                                minWidth: '120px',
                                                            }}>
                                                                {statusTransitions[s.status].map(nextStatus => (
                                                                    <button
                                                                        key={nextStatus}
                                                                        onClick={() => {
                                                                            handleUpdateStatus(s, nextStatus);
                                                                            setOpenStatusMenu(null);
                                                                        }}
                                                                        style={{
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            gap: '8px',
                                                                            width: '100%',
                                                                            padding: '6px 10px',
                                                                            border: 'none',
                                                                            background: 'transparent',
                                                                            borderRadius: '6px',
                                                                            cursor: 'pointer',
                                                                            fontSize: '11px',
                                                                            fontWeight: '500',
                                                                            color: statusList[nextStatus]?.textColor || '#374151',
                                                                            textAlign: 'left',
                                                                            transition: 'background 0.12s',
                                                                            whiteSpace: 'nowrap',
                                                                        }}
                                                                        onMouseEnter={(e) => { e.currentTarget.style.background = statusList[nextStatus]?.bg || '#f3f4f6'; }}
                                                                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                                                                    >
                                                                        <span style={{
                                                                            width: '6px',
                                                                            height: '6px',
                                                                            borderRadius: '50%',
                                                                            background: statusList[nextStatus]?.color || '#999',
                                                                            flexShrink: 0,
                                                                        }} />
                                                                        {statusList[nextStatus]?.label}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                        {s.ultimaAtualizacaoRastreio && (
                                            <div style={{fontSize: '9px', color: 'var(--text-muted)', marginTop: '2px'}}>
                                                Atualizado: {formatDate(s.ultimaAtualizacaoRastreio)}
                                            </div>
                                        )}
                                    </td>
                                    <td>
                                        <div style={{display: 'flex', gap: '4px'}}>
                                            {(s.codigoRastreio || s.melhorEnvioId) && (
                                                <button
                                                    className="btn btn-primary btn-sm"
                                                    onClick={() => atualizarRastreioMelhorEnvio(s)}
                                                    disabled={atualizandoRastreio}
                                                    title="Atualizar rastreio"
                                                    style={{fontSize: '10px', padding: '4px 8px'}}
                                                >
                                                    {atualizandoRastreio ? '...' : '⟳'}
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
                                <select className="form-select" value={editingShipping.status || 'DESPACHADO'} onChange={(e) => setEditingShipping({...editingShipping, status: e.target.value})}>
                                    {Object.entries(statusList).map(([key, val]) => (
                                        <option key={key} value={key}>{val.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">Telefone HUB</label>
                                <input type="text" className="form-input" value={editingShipping.hubTelefone || ''} onChange={(e) => setEditingShipping({...editingShipping, hubTelefone: e.target.value})} placeholder="(00) 00000-0000" />
                            </div>
                            <div className="form-group" style={{flex: 2}}>
                                <label className="form-label">Observações</label>
                                <textarea className="form-textarea" value={editingShipping.observacoes || ''} onChange={(e) => setEditingShipping({...editingShipping, observacoes: e.target.value})} placeholder="Informações adicionais..." />
                            </div>
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
                                        hubTelefone: editingShipping.hubTelefone,
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
