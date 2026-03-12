/**
 * ShippingList.jsx — Shipping list with filters, status, and tracking
 *
 * Extracted from ShippingManager (index-legacy.html L7300-7624)
 * Includes: filteredShippings, tracking updates, edit modal, status management
 */
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Icon } from '@/utils/icons';
import PeriodFilter, { filterByPeriod } from '@/components/ui/PeriodFilter';
import { fetchTrackingInfo, buscarRastreioPorNF } from '@/services/trackingService';
import { supabaseClient } from '@/config/supabase';
import {
    buildClientShippingMessage,
    copyMessageToClipboard,
} from '@/utils/shippingMessage';

// Resize image helper
function resizeImage(file, maxWidth = 1200) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                if (img.width <= maxWidth) { resolve(file); return; }
                const canvas = document.createElement('canvas');
                const ratio = maxWidth / img.width;
                canvas.width = maxWidth;
                canvas.height = img.height * ratio;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                canvas.toBlob((blob) => {
                    resolve(new File([blob], file.name, { type: 'image/jpeg' }));
                }, 'image/jpeg', 0.85);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

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
    const [buscandoNF, setBuscandoNF] = useState(null); // shipping id being searched
    const [openStatusMenu, setOpenStatusMenu] = useState(null);
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');
    const [comprovanteModal, setComprovanteModal] = useState(null); // shipping object
    const [comprovanteForm, setComprovanteForm] = useState({ recebedorNome: '', comprovanteObs: '', comprovanteFotos: [] });
    const [signedUrls, setSignedUrls] = useState({});
    const [uploadingFoto, setUploadingFoto] = useState(false);
    const fotoInputRef = useRef(null);

    // WhatsApp copy handler
    const handleCopyClientMessage = async (shipping) => {
        const message = buildClientShippingMessage(shipping, statusList);
        const ok = await copyMessageToClipboard(message);
        if (ok) {
            setSuccess('Copiado!');
            setTimeout(() => setSuccess(''), 3000);
        }
    };

    // Open comprovante modal
    const openComprovante = async (shipping) => {
        setComprovanteModal(shipping);
        setComprovanteForm({
            recebedorNome: shipping.recebedorNome || '',
            comprovanteObs: shipping.comprovanteObs || '',
            comprovanteFotos: shipping.comprovanteFotos || [],
        });
        // Generate signed URLs for existing photos
        const urls = {};
        for (const path of (shipping.comprovanteFotos || [])) {
            try {
                const { data } = await supabaseClient.storage
                    .from('comprovantes').createSignedUrl(path, 3600);
                if (data?.signedUrl) urls[path] = data.signedUrl;
            } catch (_) {}
        }
        setSignedUrls(urls);
    };

    const handleComprovanteFotoUpload = async (e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        const current = comprovanteForm.comprovanteFotos || [];
        if (current.length + files.length > 3) { setError('Máximo 3 fotos'); return; }
        setUploadingFoto(true);
        const newFotos = [...current];
        const newUrls = { ...signedUrls };
        for (const file of files) {
            try {
                const resized = await resizeImage(file);
                const path = `comprovantes/${comprovanteModal.id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
                const { data, error: upErr } = await supabaseClient.storage
                    .from('comprovantes').upload(path, resized, { contentType: resized.type, upsert: false });
                if (upErr) throw upErr;
                newFotos.push(data.path);
                const { data: urlData } = await supabaseClient.storage
                    .from('comprovantes').createSignedUrl(data.path, 3600);
                if (urlData?.signedUrl) newUrls[data.path] = urlData.signedUrl;
            } catch (err) { setError('Erro ao enviar foto: ' + err.message); }
        }
        setComprovanteForm({ ...comprovanteForm, comprovanteFotos: newFotos });
        setSignedUrls(newUrls);
        setUploadingFoto(false);
        if (fotoInputRef.current) fotoInputRef.current.value = '';
    };

    const handleRemoveComprovanteFoto = async (index) => {
        const fotos = [...comprovanteForm.comprovanteFotos];
        const path = fotos[index];
        fotos.splice(index, 1);
        setComprovanteForm({ ...comprovanteForm, comprovanteFotos: fotos });
        try { await supabaseClient.storage.from('comprovantes').remove([path]); } catch (_) {}
    };

    const saveComprovante = async () => {
        if (!comprovanteModal) return;
        await onUpdate(comprovanteModal.id, {
            recebedorNome: comprovanteForm.recebedorNome,
            comprovanteObs: comprovanteForm.comprovanteObs,
            comprovanteFotos: comprovanteForm.comprovanteFotos,
        });
        setComprovanteModal(null);
        setSuccess('Comprovante salvo!');
        setTimeout(() => setSuccess(''), 3000);
    };

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
            !s.entregaLocal &&
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

    // Buscar rastreio no Melhor Envio pelo número da NF (com nome do cliente como fallback)
    const buscarRastreioNF = async (shipping) => {
        if (!shipping.nfNumero) {
            setError('Despacho sem número de NF');
            return;
        }
        setBuscandoNF(shipping.id);
        try {
            const result = await buscarRastreioPorNF(shipping.nfNumero, shipping.cliente);
            if (result?.encontrado) {
                const updateData = {
                    ultimaAtualizacaoRastreio: new Date().toISOString(),
                };
                if (result.melhor_envio_id) updateData.melhorEnvioId = result.melhor_envio_id;
                if (result.codigo_rastreio) updateData.codigoRastreio = result.codigo_rastreio;
                if (result.link_rastreio) updateData.linkRastreio = result.link_rastreio;
                if (result.transportadora) updateData.transportadora = result.transportadora;
                await onUpdate(shipping.id, updateData);
                setSuccess(`Rastreio encontrado: ${result.codigo_rastreio || result.melhor_envio_id} (${result.transportadora})`);
                setTimeout(() => setSuccess(''), 5000);
            } else {
                const debugInfo = result?.debug ? '\nDebug:\n' + result.debug.join('\n') : '';
                const msg = (result?.motivo || 'NF não encontrada no Melhor Envio') + debugInfo;
                console.log(`[ME] NF ${shipping.nfNumero} não encontrada.`, result?.debug || []);
                setError(msg);
                setTimeout(() => setError(''), 12000);
            }
        } catch (err) {
            setError('Erro ao buscar NF: ' + err.message);
            setTimeout(() => setError(''), 8000);
        } finally {
            setBuscandoNF(null);
        }
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

        // Correios format: AA123456789BR or AD184454690BR (9-10 digits)
        if (/^[A-Z]{2}\d{9,10}[A-Z]{2}$/.test(c))
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
                {isStockAdmin && (
                    <button
                        className="btn btn-primary"
                        onClick={atualizarTodosRastreios}
                        disabled={atualizandoRastreio}
                        style={{whiteSpace: 'nowrap'}}
                    >
                        {atualizandoRastreio ? 'Atualizando...' : 'Atualizar Rastreios'}
                    </button>
                )}
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
                                <th>Ações</th>
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
                                    <td style={{fontSize: '12px'}}>
                                        {s.entregaLocal ? (
                                            <span style={{color: '#065F46', fontWeight: 500}}>📦 Local</span>
                                        ) : (s.transportadora || '-')}
                                    </td>
                                    <td>
                                        {s.entregaLocal ? (
                                            <div>
                                                {s.recebedorNome && (
                                                    <div style={{fontSize: '12px', fontWeight: 500}}>
                                                        Recebido: {s.recebedorNome}
                                                    </div>
                                                )}
                                                {(s.comprovanteFotos || []).length > 0 && (
                                                    <button
                                                        className="btn btn-secondary btn-sm"
                                                        onClick={() => openComprovante(s)}
                                                        style={{fontSize: '10px', padding: '3px 8px', marginTop: '2px'}}
                                                        title="Ver comprovante"
                                                    >
                                                        📷 {s.comprovanteFotos.length} foto{s.comprovanteFotos.length !== 1 ? 's' : ''}
                                                    </button>
                                                )}
                                                {!(s.comprovanteFotos || []).length && !s.recebedorNome && isStockAdmin && (
                                                    <button
                                                        className="btn btn-secondary btn-sm"
                                                        onClick={() => openComprovante(s)}
                                                        style={{fontSize: '11px', padding: '4px 8px'}}
                                                    >
                                                        + Comprovante
                                                    </button>
                                                )}
                                            </div>
                                        ) : s.codigoRastreio ? (
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
                                            isStockAdmin ? (
                                                <button
                                                    className="btn btn-secondary btn-sm"
                                                    onClick={() => setEditingShipping({...s})}
                                                    style={{fontSize: '11px', padding: '4px 8px'}}
                                                >
                                                    + Adicionar
                                                </button>
                                            ) : (
                                                <span style={{fontSize: '11px', color: 'var(--text-muted)'}}>-</span>
                                            )
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
                                                {s.entregaLocal && s.status === 'ENTREGUE' ? 'Entregue (Local)' : (statusList[s.status]?.label || s.status)}
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
                                        <div style={{display: 'flex', gap: '4px', flexWrap: 'wrap'}}>
                                            {/* WhatsApp copy — visible to all */}
                                            <button
                                                className="btn btn-secondary btn-sm"
                                                onClick={() => handleCopyClientMessage(s)}
                                                title="Copiar mensagem"
                                                style={{fontSize: '10px', padding: '4px 8px', color: '#25D366', borderColor: '#25D366'}}
                                            >
                                                <Icon name="whatsapp" size={14} style={{color: '#25D366'}} />
                                            </button>
                                            {/* Comprovante — for ENTREGUE shippings (admin only) */}
                                            {isStockAdmin && s.status === 'ENTREGUE' && (
                                                <button
                                                    className="btn btn-secondary btn-sm"
                                                    onClick={() => openComprovante(s)}
                                                    title={s.entregaLocal ? 'Ver/editar comprovante' : 'Adicionar comprovante'}
                                                    style={{fontSize: '10px', padding: '4px 8px'}}
                                                >
                                                    📋
                                                </button>
                                            )}
                                            {/* Tracking — admin only, not for local delivery */}
                                            {isStockAdmin && !s.entregaLocal && (s.codigoRastreio || s.melhorEnvioId) && (
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
                                            {isStockAdmin && !s.entregaLocal && s.nfNumero && (!s.codigoRastreio || !s.melhorEnvioId) && (
                                                <button
                                                    className="btn btn-secondary btn-sm"
                                                    onClick={() => buscarRastreioNF(s)}
                                                    disabled={buscandoNF === s.id}
                                                    title="Buscar rastreio no Melhor Envio pela NF"
                                                    style={{fontSize: '10px', padding: '4px 8px'}}
                                                >
                                                    {buscandoNF === s.id ? '...' : '🔍 ME'}
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
                            <div className="form-group">
                                <label className="form-label">Telefone Cliente</label>
                                <input type="text" className="form-input" value={editingShipping.telefoneCliente || ''} onChange={(e) => setEditingShipping({...editingShipping, telefoneCliente: e.target.value})} placeholder="(00) 00000-0000" />
                            </div>
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
                                        hubTelefone: editingShipping.hubTelefone,
                                        telefoneCliente: editingShipping.telefoneCliente,
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

            {/* Modal Comprovante de Entrega */}
            {comprovanteModal && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{maxWidth: '500px'}}>
                        <h2 className="modal-title">📋 Comprovante de Entrega</h2>
                        <p className="modal-subtitle">
                            NF {comprovanteModal.nfNumero} — {comprovanteModal.cliente}
                            {comprovanteModal.entregaLocal && <span style={{
                                marginLeft: '8px', background: '#D1FAE5', color: '#065F46',
                                padding: '2px 8px', borderRadius: '8px', fontSize: '10px', fontWeight: 600
                            }}>Entrega Local</span>}
                        </p>

                        {comprovanteModal.dataEntrega && (
                            <div style={{fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px'}}>
                                Entregue em: {formatDate(comprovanteModal.dataEntrega)}
                            </div>
                        )}

                        {isStockAdmin ? (
                            <>
                                <div className="form-group">
                                    <label className="form-label">Recebido por</label>
                                    <input
                                        type="text" className="form-input"
                                        value={comprovanteForm.recebedorNome}
                                        onChange={(e) => setComprovanteForm({...comprovanteForm, recebedorNome: e.target.value})}
                                        placeholder="Nome de quem recebeu"
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Observação da entrega</label>
                                    <textarea
                                        className="form-textarea"
                                        value={comprovanteForm.comprovanteObs}
                                        onChange={(e) => setComprovanteForm({...comprovanteForm, comprovanteObs: e.target.value})}
                                        placeholder="Ex: Entregue na portaria com o João"
                                        rows={2}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Fotos (máx. 3)</label>
                                    <div style={{display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px'}}>
                                        {comprovanteForm.comprovanteFotos.map((path, i) => (
                                            <div key={i} style={{
                                                position: 'relative', width: '120px', height: '120px',
                                                borderRadius: '8px', overflow: 'hidden', border: '1px solid #d1d5db'
                                            }}>
                                                {signedUrls[path] ? (
                                                    <img src={signedUrls[path]} alt="" style={{width: '100%', height: '100%', objectFit: 'cover'}} />
                                                ) : (
                                                    <div style={{width: '100%', height: '100%', background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af'}}>📷</div>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveComprovanteFoto(i)}
                                                    style={{
                                                        position: 'absolute', top: '4px', right: '4px',
                                                        width: '22px', height: '22px', borderRadius: '50%',
                                                        background: 'rgba(239,68,68,0.9)', color: '#fff',
                                                        border: 'none', cursor: 'pointer', fontSize: '14px',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                    }}
                                                >×</button>
                                            </div>
                                        ))}
                                    </div>
                                    {comprovanteForm.comprovanteFotos.length < 3 && (
                                        <div>
                                            <input ref={fotoInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple style={{display: 'none'}} onChange={handleComprovanteFotoUpload} />
                                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => fotoInputRef.current?.click()} disabled={uploadingFoto} style={{fontSize: '12px'}}>
                                                {uploadingFoto ? 'Enviando...' : '📷 Anexar foto'}
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <div className="btn-group">
                                    <button className="btn btn-primary" onClick={saveComprovante}>Salvar Comprovante</button>
                                    <button className="btn btn-secondary" onClick={() => setComprovanteModal(null)}>Cancelar</button>
                                </div>
                            </>
                        ) : (
                            <>
                                {comprovanteForm.recebedorNome && (
                                    <div style={{marginBottom: '12px'}}>
                                        <strong>Recebido por:</strong> {comprovanteForm.recebedorNome}
                                    </div>
                                )}
                                {comprovanteForm.comprovanteObs && (
                                    <div style={{marginBottom: '12px'}}>
                                        <strong>Observação:</strong> {comprovanteForm.comprovanteObs}
                                    </div>
                                )}
                                <div style={{display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px'}}>
                                    {comprovanteForm.comprovanteFotos.map((path, i) => (
                                        <div key={i} style={{width: '150px', height: '150px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #d1d5db'}}>
                                            {signedUrls[path] ? (
                                                <img src={signedUrls[path]} alt="" style={{width: '100%', height: '100%', objectFit: 'cover'}} />
                                            ) : (
                                                <div style={{width: '100%', height: '100%', background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af'}}>📷</div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                <button className="btn btn-secondary" onClick={() => setComprovanteModal(null)}>Fechar</button>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
