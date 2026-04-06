/**
 * ShippingList.jsx — Shipping list with filters, status, and tracking
 *
 * Extracted from ShippingManager (index-legacy.html L7300-7624)
 * Includes: filteredShippings, tracking updates, edit modal, status management
 */
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Icon } from '@/utils/icons';
import PeriodFilter, { filterByPeriod } from '@/components/ui/PeriodFilter';
import { fetchTrackingInfo, buscarRastreioPorNF, buscarRastreiosLoteME } from '@/services/trackingService';
import { supabaseClient, SUPABASE_URL } from '@/config/supabase';
import {
    buildClientShippingMessage,
    buildClientDevolucaoMessage,
    copyMessageToClipboard,
} from '@/utils/shippingMessage';
import { getStatusLabel, getStatusColor } from '@/utils/statusLabels';
import { criarEntradasDevolucao } from '@/utils/devolucaoEntries';
import { getTransportadoraReal } from '@/utils/transportadora';


// Resize image helper
const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20MB before resize
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

function validateImageFile(file) {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type) && !file.name.match(/\.(jpg|jpeg|png|webp|heic)$/i)) {
        throw new Error(`Tipo de arquivo não permitido: ${file.type || file.name}`);
    }
    if (file.size > MAX_IMAGE_SIZE) {
        throw new Error(`Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Máximo: 20MB.`);
    }
}

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

// Resolve bucket name and real path for comprovante photos
function resolvePhotoBucket(path) {
    if (path.startsWith('externos:')) {
        return { bucket: 'comprovantes-externos', realPath: path.slice(9) };
    }
    return { bucket: 'comprovantes', realPath: path };
}

export default function ShippingList({
    shippings, onUpdate, onDelete, isStockAdmin, locaisOrigem,
    statusList, statusTransitions, transportadoras, onRefresh,
    tipo = 'despacho', isOperador = false, isEquipe = false, onAddEntry
}) {
    const isDevolucao = tipo === 'devolucao';
    const canEdit = isStockAdmin || isOperador;
    const canDelete = isStockAdmin;
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [shipPeriodFilter, setShipPeriodFilter] = useState('30');
    const [shipCustomMonth, setShipCustomMonth] = useState(new Date().getMonth());
    const [shipCustomYear, setShipCustomYear] = useState(new Date().getFullYear());
    // Sort state for table columns
    const [sortField, setSortField] = useState('date');
    const [sortDir, setSortDir] = useState('desc');
    const [editingShipping, setEditingShipping] = useState(null);
    const [atualizandoRastreio, setAtualizandoRastreio] = useState(false);
    const [buscandoNF, setBuscandoNF] = useState(null); // shipping id being searched
    const [openStatusMenu, setOpenStatusMenu] = useState(null);
    const [statusMenuPos, setStatusMenuPos] = useState({ top: 0, left: 0, openUp: false });
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');
    const [comprovanteModal, setComprovanteModal] = useState(null); // shipping object
    const [comprovanteForm, setComprovanteForm] = useState({ recebedorNome: '', comprovanteObs: '', comprovanteFotos: [] });
    const [signedUrls, setSignedUrls] = useState({});
    const [uploadingFoto, setUploadingFoto] = useState(false);
    const fotoInputRef = useRef(null);
    // Edit modal photo state
    const [editSignedUrls, setEditSignedUrls] = useState({});
    const [uploadingEditFoto, setUploadingEditFoto] = useState(false);
    const editFotoInputRef = useRef(null);
    // Batch ME search state
    const [batchMEActive, setBatchMEActive] = useState(false);
    const [batchMEProgress, setBatchMEProgress] = useState(null); // { current, total, vinculados, naoEncontrados, erros, nfAtual }
    const batchMECancelRef = useRef(false);
    // Delivery token state (entregador link)
    const [deliveryToken, setDeliveryToken] = useState(null); // { token, status, uploads_count, max_uploads, expires_at, entregador_nome, entregador_telefone }
    const [loadingToken, setLoadingToken] = useState(false);
    const [entregadorNome, setEntregadorNome] = useState('');
    const [entregadorTelefone, setEntregadorTelefone] = useState('');
    // Multi-NF delivery token (select multiple local deliveries)
    const [selectedForDelivery, setSelectedForDelivery] = useState(new Set());
    const [showMultiDeliveryModal, setShowMultiDeliveryModal] = useState(false);
    const [multiEntregadorNome, setMultiEntregadorNome] = useState('');
    const [multiEntregadorTelefone, setMultiEntregadorTelefone] = useState('');
    const [loadingMultiToken, setLoadingMultiToken] = useState(false);

    // Load existing delivery token when editing a shipping
    useEffect(() => {
        if (!editingShipping?.id || !(editingShipping?.entregaLocal || editingShipping?.transportadora === 'Entrega Local')) {
            setDeliveryToken(null);
            setEntregadorNome('');
            setEntregadorTelefone('');
            return;
        }
        (async () => {
            const { data } = await supabaseClient
                .from('delivery_tokens')
                .select('*')
                .eq('shipping_id', editingShipping.id)
                .order('created_at', { ascending: false })
                .limit(1);
            if (data && data.length > 0) {
                const t = data[0];
                setDeliveryToken(t);
                setEntregadorNome(t.entregador_nome || '');
                setEntregadorTelefone(t.entregador_telefone || '');
            } else {
                setDeliveryToken(null);
                setEntregadorNome('');
                setEntregadorTelefone('');
            }
        })();
    }, [editingShipping?.id, editingShipping?.entregaLocal, editingShipping?.transportadora]);

    const gerarLinkEntregador = async () => {
        if (!editingShipping?.id) return;
        if (!entregadorNome.trim()) { setError('Preencha o nome do entregador'); setTimeout(() => setError(''), 3000); return; }
        if (!entregadorTelefone.trim()) { setError('Preencha o telefone do entregador'); setTimeout(() => setError(''), 3000); return; }
        setLoadingToken(true);
        try {
            const { data, error: err } = await supabaseClient
                .from('delivery_tokens')
                .insert({
                    shipping_id: editingShipping.id,
                    entregador_nome: entregadorNome.trim(),
                    entregador_telefone: entregadorTelefone.trim(),
                })
                .select('*')
                .single();
            if (err) throw err;
            setDeliveryToken(data);

            // Open WhatsApp
            const link = `https://orne-estoque.vercel.app/entrega/${data.token}`;
            const telefone = entregadorTelefone.replace(/\D/g, '');
            const tel = telefone.startsWith('55') ? telefone : `55${telefone}`;
            const msg = encodeURIComponent(
                `Olá ${entregadorNome.trim()}!\n\n` +
                `Você está realizando uma entrega da *ORNE™*.\n\n` +
                `NF: ${editingShipping.nfNumero || '-'}\n` +
                `Cliente: ${editingShipping.cliente || '-'}\n` +
                `Endereço: ${editingShipping.destino || '-'}\n\n` +
                `Por favor, anexe o comprovante de entrega neste link:\n${link}\n\n` +
                `O link é válido por 48 horas.\nObrigado!`
            );
            window.open(`https://wa.me/${tel}?text=${msg}`, '_blank');
        } catch (err) {
            console.error('Erro ao gerar token:', err);
            setError('Erro ao gerar link: ' + (err.message || err));
            setTimeout(() => setError(''), 5000);
        } finally {
            setLoadingToken(false);
        }
    };

    // Multi-NF: toggle selection
    const toggleDeliverySelection = (shippingId) => {
        setSelectedForDelivery(prev => {
            const next = new Set(prev);
            if (next.has(shippingId)) next.delete(shippingId);
            else next.add(shippingId);
            return next;
        });
    };

    // Generate multi-NF delivery token
    const gerarLinkMultiEntregador = async () => {
        if (selectedForDelivery.size === 0) return;
        if (!multiEntregadorNome.trim()) { setError('Preencha o nome do entregador'); setTimeout(() => setError(''), 3000); return; }
        if (!multiEntregadorTelefone.trim()) { setError('Preencha o telefone do entregador'); setTimeout(() => setError(''), 3000); return; }
        setLoadingMultiToken(true);
        try {
            // 1. Create token (no shipping_id — multi-NF)
            const { data: tokenData, error: tokenErr } = await supabaseClient
                .from('delivery_tokens')
                .insert({
                    shipping_id: null,
                    entregador_nome: multiEntregadorNome.trim(),
                    entregador_telefone: multiEntregadorTelefone.trim(),
                })
                .select('*')
                .single();
            if (tokenErr) throw tokenErr;

            // 2. Create junction records
            const junctionRows = Array.from(selectedForDelivery).map(sid => ({
                token_id: tokenData.id,
                shipping_id: sid,
            }));
            const { error: jErr } = await supabaseClient
                .from('delivery_token_shippings')
                .insert(junctionRows);
            if (jErr) throw jErr;

            // 3. Build WhatsApp message
            const selectedShippingsList = shippings.filter(s => selectedForDelivery.has(s.id));
            const nfList = selectedShippingsList.map(s => `• NF ${s.nfNumero || '-'} — ${s.cliente || '-'}`).join('\n');
            const link = `https://orne-estoque.vercel.app/entrega/${tokenData.token}`;
            const telefone = multiEntregadorTelefone.replace(/\D/g, '');
            const tel = telefone.startsWith('55') ? telefone : `55${telefone}`;
            const msg = encodeURIComponent(
                `Olá ${multiEntregadorNome.trim()}!\n\n` +
                `Você está realizando ${selectedForDelivery.size} entrega(s) da *ORNE™*.\n\n` +
                `${nfList}\n\n` +
                `Anexe os comprovantes de entrega neste link:\n${link}\n\n` +
                `O link é válido por 48 horas.\nObrigado!`
            );
            window.open(`https://wa.me/${tel}?text=${msg}`, '_blank');

            // Clean up
            setShowMultiDeliveryModal(false);
            setSelectedForDelivery(new Set());
            setMultiEntregadorNome('');
            setMultiEntregadorTelefone('');
            setSuccess(`Link gerado para ${selectedForDelivery.size} entregas!`);
            setTimeout(() => setSuccess(''), 5000);
        } catch (err) {
            console.error('Erro ao gerar token multi-NF:', err);
            setError('Erro ao gerar link: ' + (err.message || err));
            setTimeout(() => setError(''), 5000);
        } finally {
            setLoadingMultiToken(false);
        }
    };

    // Load signed URLs when editing shipping has photos
    useEffect(() => {
        if (!editingShipping) { setEditSignedUrls({}); return; }
        const fotos = editingShipping.comprovanteFotos || [];
        if (!fotos.length) return;
        (async () => {
            const urls = {};
            for (const path of fotos) {
                if (editSignedUrls[path]) { urls[path] = editSignedUrls[path]; continue; }
                try {
                    const { bucket, realPath } = resolvePhotoBucket(path);
                    const { data } = await supabaseClient.storage.from(bucket).createSignedUrl(realPath, 3600);
                    if (data?.signedUrl) urls[path] = data.signedUrl;
                } catch (_) {}
            }
            setEditSignedUrls(urls);
        })();
    }, [editingShipping?.id, editingShipping?.comprovanteFotos?.length]);

    // Handle photo upload in edit modal
    const handleEditFotoUpload = async (e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length || !editingShipping) return;
        const current = editingShipping.comprovanteFotos || [];
        if (current.length + files.length > 3) { setError('Máximo 3 fotos'); return; }
        setUploadingEditFoto(true);
        const newFotos = [...current];
        const newUrls = { ...editSignedUrls };
        for (const file of files) {
            try {
                validateImageFile(file);
                const resized = await resizeImage(file);
                const path = `comprovantes/${editingShipping.id}/${Date.now()}_${Math.random().toString(36).substring(2, 8)}.jpg`;
                const { data, error: upErr } = await supabaseClient.storage
                    .from('comprovantes').upload(path, resized, { contentType: resized.type, upsert: false });
                if (upErr) throw upErr;
                newFotos.push(data.path);
                const { data: urlData } = await supabaseClient.storage.from('comprovantes').createSignedUrl(data.path, 3600);
                if (urlData?.signedUrl) newUrls[data.path] = urlData.signedUrl;
            } catch (err) { setError('Erro ao enviar foto: ' + err.message); }
        }
        setEditingShipping({ ...editingShipping, comprovanteFotos: newFotos });
        setEditSignedUrls(newUrls);
        setUploadingEditFoto(false);
        if (editFotoInputRef.current) editFotoInputRef.current.value = '';
    };

    // WhatsApp copy handler
    const handleCopyClientMessage = async (shipping) => {
        const resolved = { ...shipping, transportadora: getTransportadoraReal(shipping) };
        const message = isDevolucao
            ? buildClientDevolucaoMessage(resolved, statusList)
            : buildClientShippingMessage(resolved, statusList);
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
                const { bucket, realPath } = resolvePhotoBucket(path);
                const { data } = await supabaseClient.storage
                    .from(bucket).createSignedUrl(realPath, 3600);
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
                validateImageFile(file);
                const resized = await resizeImage(file);
                const path = `comprovantes/${comprovanteModal.id}/${Date.now()}_${Math.random().toString(36).substring(2, 8)}.jpg`;
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
        try { const rb = resolvePhotoBucket(path); await supabaseClient.storage.from(rb.bucket).remove([rb.realPath]); } catch (_) {}
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
            const matchesStatus = statusFilter === 'all' || s.status === statusFilter || (statusFilter === 'EM_TRANSITO' && s.status === 'TENTATIVA_ENTREGA');
            return matchesSearch && matchesStatus;
        });
        return items;
    }, [shippings, searchTerm, statusFilter, shipPeriodFilter, shipCustomMonth, shipCustomYear]);

    // Sorted shippings (MUST be after filteredShippings)
    const sortedShippings = useMemo(() => {
        const items = [...filteredShippings];
        items.sort((a, b) => {
            let valA, valB;
            switch (sortField) {
                case 'nfNumero':
                    valA = parseInt(a.nfNumero) || 0;
                    valB = parseInt(b.nfNumero) || 0;
                    break;
                case 'date':
                    valA = new Date(a.date || 0).getTime();
                    valB = new Date(b.date || 0).getTime();
                    break;
                case 'localOrigem':
                    valA = (a.localOrigem || '').toLowerCase();
                    valB = (b.localOrigem || '').toLowerCase();
                    break;
                case 'transportadora':
                    valA = (a.transportadora || '').toLowerCase();
                    valB = (b.transportadora || '').toLowerCase();
                    break;
                default:
                    valA = new Date(a.date || 0).getTime();
                    valB = new Date(b.date || 0).getTime();
            }
            if (valA < valB) return sortDir === 'asc' ? -1 : 1;
            if (valA > valB) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });
        return items;
    }, [filteredShippings, sortField, sortDir]);

    // Helper: detect entrega local by flag OR transportadora text
    const isEntregaLocalShipping = (s) => s.entregaLocal || s.transportadora === 'Entrega Local';

    // Multi-NF: selectable shippings (entrega local + DESPACHADO)
    const selectableShippings = useMemo(() => {
        return sortedShippings.filter(s => isEntregaLocalShipping(s) && s.status === 'DESPACHADO');
    }, [sortedShippings]);

    // Multi-NF: select/deselect all visible
    const toggleSelectAll = () => {
        if (selectedForDelivery.size === selectableShippings.length && selectableShippings.length > 0) {
            setSelectedForDelivery(new Set());
        } else {
            setSelectedForDelivery(new Set(selectableShippings.map(s => s.id)));
        }
    };

    // Sort handler
    const handleSort = (field) => {
        if (sortField === field) {
            setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDir(field === 'date' ? 'desc' : 'asc');
        }
    };

    const SortTh = ({ field, children, ...rest }) => (
        <th
            onClick={() => handleSort(field)}
            style={{cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap'}}
            {...rest}
        >
            {children}
            <span style={{marginLeft: '4px', opacity: sortField === field ? 1 : 0.3, fontSize: '10px'}}>
                {sortField === field ? (sortDir === 'asc' ? '▲' : '▼') : '▲▼'}
            </span>
        </th>
    );

    // Status progression — only advances, never regresses
    const STATUS_RANK = { DESPACHADO: 0, AGUARDANDO_COLETA: 0.5, EM_TRANSITO: 1, SAIU_ENTREGA: 2, TENTATIVA_ENTREGA: 2, ENTREGUE: 3, DEVOLVIDO: 3 };
    const VALID_STATUSES = ['DESPACHADO', 'AGUARDANDO_COLETA', 'EM_TRANSITO', 'SAIU_ENTREGA', 'TENTATIVA_ENTREGA', 'ENTREGUE', 'DEVOLVIDO'];

    const shouldUpdateStatus = (currentStatus, newStatus) => {
        if (!VALID_STATUSES.includes(newStatus)) return false;
        if (currentStatus === 'ENTREGUE' || currentStatus === 'DEVOLVIDO') return false;
        return (STATUS_RANK[newStatus] ?? -1) > (STATUS_RANK[currentStatus] ?? -1);
    };

    // Atualizar rastreio (individual) — EF persists, just refetch after
    const atualizarRastreioMelhorEnvio = async (shipping) => {
        if (!shipping.melhorEnvioId && !shipping.codigoRastreio) {
            setError('Informe o ID da etiqueta ou código de rastreio');
            return;
        }
        setAtualizandoRastreio(true);
        try {
            const info = await fetchTrackingInfo(shipping);
            if (info) {
                // EF v15 persists status directly — just refetch
                if (info.persisted) {
                    await onRefresh?.();
                } else {
                    // Fallback: update via frontend if EF didn't persist
                    const updateData = {
                        ultimaAtualizacaoRastreio: new Date().toISOString(),
                        rastreioInfo: info,
                    };
                    if (info.status && shouldUpdateStatus(shipping.status, info.status)) {
                        updateData.status = info.status;
                    }
                    if (info.codigoRastreio) updateData.codigoRastreio = info.codigoRastreio;
                    if (info.linkRastreio) updateData.linkRastreio = info.linkRastreio;
                    await onUpdate(shipping.id, updateData);
                }

                const statusMsg = info.persisted && info.status && info.status !== shipping.status
                    ? `${shipping.status} → ${info.status}`
                    : (info.status && shouldUpdateStatus(shipping.status, info.status) ? `${shipping.status} → ${info.status}` : shipping.status);
                const eventoMsg = info.ultimoEvento ? ` | ${info.ultimoEvento}` : '';
                setSuccess(`Rastreio atualizado: ${statusMsg}${eventoMsg}`);
                setTimeout(() => setSuccess(''), 5000);
            } else {
                setSuccess('Nenhuma atualização disponível');
                setTimeout(() => setSuccess(''), 3000);
            }
        } catch (err) {
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

    // Atualizar todos os rastreios pendentes — EF v15 persists directly
    const atualizarTodosRastreios = async () => {
        const activeStatuses = ['DESPACHADO', 'AGUARDANDO_COLETA', 'EM_TRANSITO', 'SAIU_ENTREGA', 'TENTATIVA_ENTREGA'];
        const pendentes = shippings.filter(s =>
            activeStatuses.includes(s.status) &&
            !s.entregaLocal &&
            (s.melhorEnvioId || s.codigoRastreio)
        );
        if (pendentes.length === 0) {
            setError('Nenhum despacho pendente para atualizar');
            return;
        }
        setAtualizandoRastreio(true);

        // Separate by tracking type
        const porME = pendentes.filter(s => s.melhorEnvioId && !s.melhorEnvioId.startsWith('ORD-'));
        const porCodigo = pendentes.filter(s => !s.melhorEnvioId?.trim() || s.melhorEnvioId?.startsWith('ORD-')).filter(s => s.codigoRastreio?.trim());

        let alterados = 0, semMudanca = 0, erros = 0;

        try {
            // Batch call for Melhor Envio UUIDs
            if (porME.length > 0) {
                const uuids = porME.map(s => s.melhorEnvioId);
                try {
                    const { data: { session } } = await supabaseClient.auth.getSession();
                    const token = session?.access_token;
                    const response = await fetch(`${SUPABASE_URL}/functions/v1/rastrear-envio`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                        body: JSON.stringify({ orderIds: uuids }),
                    });
                    const result = await response.json();
                    if (result.success && result.data) {
                        for (const [id, info] of Object.entries(result.data)) {
                            if (info?.erro) erros++;
                            else if (info?.persisted) alterados++;
                            else semMudanca++;
                        }
                    }
                } catch (err) {
                    console.error('Erro ao rastrear via ME:', err.message);
                    erros += porME.length;
                }
            }

            // Batch call for tracking codes
            if (porCodigo.length > 0) {
                const codigos = porCodigo.map(s => s.codigoRastreio.trim());
                try {
                    const { data: { session } } = await supabaseClient.auth.getSession();
                    const token = session?.access_token;
                    const response = await fetch(`${SUPABASE_URL}/functions/v1/rastrear-envio`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                        body: JSON.stringify({ codigosRastreio: codigos }),
                    });
                    const result = await response.json();
                    if (result.success && result.data) {
                        for (const [id, info] of Object.entries(result.data)) {
                            if (info?.erro) erros++;
                            else if (info?.persisted) alterados++;
                            else semMudanca++;
                        }
                    }
                } catch (err) {
                    console.error('Erro ao rastrear via código:', err.message);
                    erros += porCodigo.length;
                }
            }

            // Refetch shippings from DB (EF already persisted)
            await onRefresh?.();

            // Auto-create entries for devoluções that reached ENTREGUE via tracking
            if (onAddEntry) {
                try {
                    const { data: pendentes } = await supabaseClient
                        .from('shippings')
                        .select('*')
                        .eq('tipo', 'devolucao')
                        .eq('status', 'ENTREGUE')
                        .eq('entrada_criada', false);

                    if (pendentes?.length > 0) {
                        const { mapShippingFromDB } = await import('@/utils/mappers');
                        let totalCreated = 0;
                        for (const row of pendentes) {
                            const dev = mapShippingFromDB(row);
                            const result = await criarEntradasDevolucao(dev, onAddEntry);
                            totalCreated += result.created;
                        }
                        if (totalCreated > 0) {
                            setSuccess(prev => {
                                const base = prev ? prev + ' | ' : '';
                                return base + `${totalCreated} produto${totalCreated !== 1 ? 's' : ''} de devolução retornaram ao estoque.`;
                            });
                        }
                    }
                } catch (err) {
                    console.error('[devolucao] Erro ao processar devoluções pós-rastreio:', err);
                }
            }
        } catch (err) {
            console.error('Erro geral ao atualizar rastreios:', err.message);
        }

        setAtualizandoRastreio(false);
        const parts = [];
        if (alterados > 0) parts.push(`${alterados} alterado${alterados !== 1 ? 's' : ''}`);
        if (semMudanca > 0) parts.push(`${semMudanca} sem mudança`);
        if (erros > 0) parts.push(`${erros} erro${erros !== 1 ? 's' : ''}`);
        const msg = `Rastreios atualizados: ${parts.join(', ')}`;
        setSuccess(msg);
        setTimeout(() => setSuccess(''), 8000);
    };

    // Atualizar status
    const handleUpdateStatus = async (shipping, newStatus) => {
        await onUpdate(shipping.id, {
            status: newStatus,
            [`status_${newStatus}_date`]: new Date().toISOString()
        });

        // Auto-create stock entries when devolução reaches ENTREGUE
        if (newStatus === 'ENTREGUE' && shipping.tipo === 'devolucao' && !shipping.entradaCriada && onAddEntry) {
            try {
                const result = await criarEntradasDevolucao(
                    { ...shipping, status: 'ENTREGUE' },
                    onAddEntry
                );
                if (result.created > 0) {
                    setSuccess(`Devolução recebida! ${result.created} produto${result.created !== 1 ? 's' : ''} retornaram ao estoque.`);
                    setTimeout(() => setSuccess(''), 8000);
                }
                if (result.errors > 0) {
                    console.warn(`[devolucao] ${result.errors} erro(s) ao criar entradas`);
                }
            } catch (err) {
                console.error('[devolucao] Erro ao criar entradas:', err);
            }
            await onRefresh?.();
        }
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
                // NF não encontrada no ME
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

    // Batch ME search — find all pending NFs and link them in Melhor Envio
    const vincularRastreiosME = async () => {
        const pendentes = shippings.filter(s =>
            s.nfNumero &&
            !s.entregaLocal &&
            !s.melhorEnvioId &&
            !s.codigoRastreio &&
            s.status !== 'ENTREGUE' &&
            s.status !== 'DEVOLVIDO'
        );
        if (pendentes.length === 0) {
            setError('Nenhuma NF pendente de vinculação encontrada.');
            setTimeout(() => setError(''), 5000);
            return;
        }
        setBatchMEActive(true);
        batchMECancelRef.current = false;
        setBatchMEProgress({ current: 0, total: pendentes.length, vinculados: 0, naoEncontrados: 0, erros: 0, nfAtual: pendentes[0].nfNumero });
        try {
            const result = await buscarRastreiosLoteME(pendentes, {
                batchSize: 5,
                delayMs: 3000,
                onProgress: (p) => setBatchMEProgress(p),
                shouldCancel: () => batchMECancelRef.current,
            });
            await onRefresh?.();
            setSuccess(`Vinculação concluída — Vinculados: ${result.vinculados} | Não encontrados: ${result.naoEncontrados} | Erros: ${result.erros}`);
            setTimeout(() => setSuccess(''), 10000);
        } catch (err) {
            setError('Erro na vinculação em lote: ' + err.message);
            setTimeout(() => setError(''), 8000);
        } finally {
            setBatchMEActive(false);
            setBatchMEProgress(null);
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
                {canEdit && (
                    <button
                        className="btn btn-primary"
                        onClick={atualizarTodosRastreios}
                        disabled={atualizandoRastreio}
                        style={{whiteSpace: 'nowrap'}}
                    >
                        {atualizandoRastreio ? 'Atualizando...' : 'Atualizar Rastreios'}
                    </button>
                )}
                {canEdit && (
                    <button
                        className="btn btn-secondary"
                        onClick={vincularRastreiosME}
                        disabled={batchMEActive || atualizandoRastreio}
                        style={{whiteSpace: 'nowrap'}}
                    >
                        {batchMEActive ? 'Vinculando...' : 'Vincular Rastreios ME'}
                    </button>
                )}
            </div>

            {/* Batch ME progress modal */}
            {batchMEActive && batchMEProgress && (
                <div style={{
                    marginBottom: '16px', padding: '16px', background: '#F9FAFB',
                    border: '1px solid #E5E7EB', borderRadius: '8px',
                }}>
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px'}}>
                        <span style={{fontWeight: 600, fontSize: '14px', color: '#111827'}}>
                            Vinculando rastreios no Melhor Envio...
                        </span>
                        <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => { batchMECancelRef.current = true; }}
                        >
                            Parar
                        </button>
                    </div>
                    <div style={{fontSize: '13px', color: '#6B7280', marginBottom: '8px'}}>
                        Processando NF {batchMEProgress.nfAtual} ({batchMEProgress.current} de {batchMEProgress.total})
                    </div>
                    <div style={{
                        width: '100%', height: '8px', background: '#E5E7EB',
                        borderRadius: '4px', overflow: 'hidden', marginBottom: '8px',
                    }}>
                        <div style={{
                            width: `${Math.round((batchMEProgress.current / batchMEProgress.total) * 100)}%`,
                            height: '100%', background: '#374151', borderRadius: '4px',
                            transition: 'width 0.3s ease',
                        }} />
                    </div>
                    <div style={{display: 'flex', gap: '16px', fontSize: '13px'}}>
                        <span style={{color: '#059669'}}>Vinculados: {batchMEProgress.vinculados}</span>
                        <span style={{color: '#6B7280'}}>Não encontrados: {batchMEProgress.naoEncontrados}</span>
                        <span style={{color: '#DC2626'}}>Erros: {batchMEProgress.erros}</span>
                    </div>
                </div>
            )}

            <div className="filter-tabs" style={{marginBottom: '12px'}}>
                <button className={`filter-tab ${statusFilter === 'all' ? 'active' : ''}`} onClick={() => setStatusFilter('all')}>
                    Todos ({shippings.length})
                </button>
                {Object.entries(statusList)
                    .filter(([key]) => key !== 'TENTATIVA_ENTREGA' && !(isDevolucao && key === 'DEVOLVIDO'))
                    .map(([key, val]) => {
                        const label = isDevolucao ? (getStatusLabel(key, 'devolucao') || val.label) : val.label;
                        return (
                            <button
                                key={key}
                                className={`filter-tab ${statusFilter === key ? 'active' : ''}`}
                                onClick={() => setStatusFilter(key)}
                            >
                                {label} ({shippings.filter(s => key === 'EM_TRANSITO' ? (s.status === 'EM_TRANSITO' || s.status === 'TENTATIVA_ENTREGA') : s.status === key).length})
                            </button>
                        );
                    })}
            </div>

            <PeriodFilter
                periodFilter={shipPeriodFilter} setPeriodFilter={setShipPeriodFilter}
                customMonth={shipCustomMonth} setCustomMonth={setShipCustomMonth}
                customYear={shipCustomYear} setCustomYear={setShipCustomYear}
            />

            {/* Multi-select action bar */}
            {!isDevolucao && selectedForDelivery.size > 0 && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '10px 16px', marginBottom: '12px',
                    background: '#EFF6FF', border: '1px solid #BFDBFE',
                    borderRadius: '8px', fontSize: '13px',
                }}>
                    <span style={{fontWeight: 600, color: '#1D4ED8'}}>
                        {selectedForDelivery.size} entrega(s) selecionada(s)
                    </span>
                    <button
                        className="btn btn-primary btn-sm"
                        style={{fontSize: '12px', marginLeft: 'auto'}}
                        onClick={() => setShowMultiDeliveryModal(true)}
                    >
                        📦 Gerar Link para Entregador
                    </button>
                    <button
                        className="btn btn-secondary btn-sm"
                        style={{fontSize: '12px'}}
                        onClick={() => setSelectedForDelivery(new Set())}
                    >
                        Limpar
                    </button>
                </div>
            )}

            {sortedShippings.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-state-icon"><Icon name="shipping" size={48} /></div>
                    <h3>{isDevolucao ? 'Nenhuma devolução encontrada' : 'Nenhum despacho encontrado'}</h3>
                    <p>{isDevolucao ? 'Registre uma devolução para começar' : 'Importe uma NF ou cadastre manualmente'}</p>
                </div>
            ) : (
                <div className="table-container">
                    <table className="table">
                        <thead>
                            <tr>
                                {!isDevolucao && selectableShippings.length > 0 && (
                                    <th style={{width: '36px', textAlign: 'center'}}>
                                        <input
                                            type="checkbox"
                                            checked={selectedForDelivery.size === selectableShippings.length && selectableShippings.length > 0}
                                            onChange={toggleSelectAll}
                                            title="Selecionar todas entregas locais pendentes"
                                            style={{cursor: 'pointer'}}
                                        />
                                    </th>
                                )}
                                <SortTh field="nfNumero">NF</SortTh>
                                <SortTh field="date">Data</SortTh>
                                <th>Cliente</th>
                                <SortTh field="localOrigem">{isDevolucao ? 'HUB Destino' : 'Origem'}</SortTh>
                                <SortTh field="transportadora">Transportadora</SortTh>
                                <th>Rastreio</th>
                                <th>Status</th>
                                {isDevolucao && <th>Motivo</th>}
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedShippings.map(s => (
                                <tr key={s.id} style={selectedForDelivery.has(s.id) ? {background: '#EFF6FF'} : undefined}>
                                    {!isDevolucao && selectableShippings.length > 0 && (
                                        <td style={{textAlign: 'center'}}>
                                            {isEntregaLocalShipping(s) && s.status === 'DESPACHADO' ? (
                                                <input
                                                    type="checkbox"
                                                    checked={selectedForDelivery.has(s.id)}
                                                    onChange={() => toggleDeliverySelection(s.id)}
                                                    style={{cursor: 'pointer'}}
                                                />
                                            ) : null}
                                        </td>
                                    )}
                                    <td>
                                        <strong>{s.nfNumero}</strong>
                                    </td>
                                    <td style={{fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap'}}>
                                        {formatDate(s.date)}
                                    </td>
                                    <td>
                                        {s.cliente}
                                        {s.destino && <div style={{fontSize: '10px', color: 'var(--text-muted)'}}>{s.destino.substring(0, 30)}...</div>}
                                    </td>
                                    <td style={{fontSize: '12px'}}>{isDevolucao ? (s.hubDestino || '-') : s.localOrigem}</td>
                                    <td style={{fontSize: '12px'}}>
                                        {isEntregaLocalShipping(s) ? (
                                            <span style={{color: '#065F46', fontWeight: 500}}>📦 Local</span>
                                        ) : (getTransportadoraReal(s) || '-')}
                                    </td>
                                    <td>
                                        {isEntregaLocalShipping(s) ? (
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
                                                {!(s.comprovanteFotos || []).length && !s.recebedorNome && canEdit && (
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
                                            canEdit ? (
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
                                                {isEntregaLocalShipping(s) && s.status === 'DESPACHADO' ? 'Aguardando Entrega' : isEntregaLocalShipping(s) && s.status === 'ENTREGUE' ? 'Entregue (Local)' : (isDevolucao ? (getStatusLabel(s.status, 'devolucao') || statusList[s.status]?.label || s.status) : (statusList[s.status]?.label || s.status))}
                                            </span>
                                            {canEdit && (statusTransitions[s.status] || []).length > 0 && (
                                                <>
                                                    <button
                                                        onClick={(e) => {
                                                            if (openStatusMenu === s.id) {
                                                                setOpenStatusMenu(null);
                                                                return;
                                                            }
                                                            const rect = e.currentTarget.getBoundingClientRect();
                                                            const allStatuses = Object.keys(statusList);
                                                            const menuHeight = allStatuses.length * 40 + 8;
                                                            const spaceBelow = window.innerHeight - rect.bottom - 8;
                                                            const openUp = spaceBelow < menuHeight && rect.top > menuHeight;
                                                            setStatusMenuPos({
                                                                top: openUp ? rect.top - menuHeight : rect.bottom + 4,
                                                                left: rect.left,
                                                                openUp,
                                                            });
                                                            setOpenStatusMenu(s.id);
                                                        }}
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
                                                                style={{position: 'fixed', inset: 0, zIndex: 9998}}
                                                                onClick={() => setOpenStatusMenu(null)}
                                                            />
                                                            <div style={{
                                                                position: 'fixed',
                                                                top: `${statusMenuPos.top}px`,
                                                                left: `${statusMenuPos.left}px`,
                                                                zIndex: 9999,
                                                                background: '#fff',
                                                                border: '1px solid #e5e7eb',
                                                                borderRadius: '8px',
                                                                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                                                padding: '4px 0',
                                                                minWidth: '200px',
                                                            }}>
                                                                {Object.keys(statusList).map(statusKey => {
                                                                    const isCurrent = statusKey === s.status;
                                                                    const isDisabled = isCurrent || !(statusTransitions[s.status] || []).includes(statusKey);
                                                                    const label = isDevolucao ? (getStatusLabel(statusKey, 'devolucao') || statusList[statusKey]?.label) : statusList[statusKey]?.label;
                                                                    return (
                                                                        <button
                                                                            key={statusKey}
                                                                            onClick={() => {
                                                                                if (!isDisabled) {
                                                                                    handleUpdateStatus(s, statusKey);
                                                                                    setOpenStatusMenu(null);
                                                                                }
                                                                            }}
                                                                            disabled={isDisabled && !isCurrent}
                                                                            style={{
                                                                                display: 'flex',
                                                                                alignItems: 'center',
                                                                                gap: '10px',
                                                                                width: '100%',
                                                                                height: '40px',
                                                                                padding: '0 14px',
                                                                                border: 'none',
                                                                                background: isCurrent ? (statusList[statusKey]?.bg || '#f3f4f6') : 'transparent',
                                                                                borderRadius: '0',
                                                                                cursor: isDisabled ? 'default' : 'pointer',
                                                                                fontSize: '13px',
                                                                                fontWeight: isCurrent ? '700' : '500',
                                                                                color: isDisabled && !isCurrent ? '#c0c4cc' : (statusList[statusKey]?.textColor || '#374151'),
                                                                                textAlign: 'left',
                                                                                transition: 'background 0.12s',
                                                                                whiteSpace: 'nowrap',
                                                                                opacity: isDisabled && !isCurrent ? 0.5 : 1,
                                                                            }}
                                                                            onMouseEnter={(e) => { if (!isDisabled) e.currentTarget.style.background = statusList[statusKey]?.bg || '#f3f4f6'; }}
                                                                            onMouseLeave={(e) => { if (!isCurrent) e.currentTarget.style.background = 'transparent'; }}
                                                                        >
                                                                            <span style={{
                                                                                width: '8px',
                                                                                height: '8px',
                                                                                borderRadius: '50%',
                                                                                background: statusList[statusKey]?.color || '#999',
                                                                                flexShrink: 0,
                                                                                opacity: isDisabled && !isCurrent ? 0.4 : 1,
                                                                            }} />
                                                                            {label}
                                                                            {isCurrent && <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#9ca3af' }}>atual</span>}
                                                                        </button>
                                                                    );
                                                                })}
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
                                    {isDevolucao && (
                                        <td style={{fontSize: '12px', color: 'var(--text-secondary)'}}>
                                            {s.motivoDevolucao || '-'}
                                        </td>
                                    )}
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
                                            {/* Comprovante — for ENTREGUE shippings (canEdit) */}
                                            {canEdit && s.status === 'ENTREGUE' && (
                                                <button
                                                    className="btn btn-secondary btn-sm"
                                                    onClick={() => openComprovante(s)}
                                                    title={isEntregaLocalShipping(s) ? 'Ver/editar comprovante' : 'Adicionar comprovante'}
                                                    style={{fontSize: '10px', padding: '4px 8px'}}
                                                >
                                                    📋
                                                </button>
                                            )}
                                            {/* Tracking — canEdit, not for local delivery */}
                                            {canEdit && !isEntregaLocalShipping(s) && (s.codigoRastreio || s.melhorEnvioId) && (
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
                                            {canEdit && !isEntregaLocalShipping(s) && s.nfNumero && (!s.codigoRastreio || !s.melhorEnvioId) && (
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
                                            {canEdit && (<button
                                                className="btn btn-icon btn-secondary btn-sm"
                                                onClick={() => setEditingShipping({...s})}
                                                title={isDevolucao ? 'Editar devolução' : 'Editar despacho'}
                                            ><Icon name="edit" size={14} /></button>)}
                                            {canDelete && (<button
                                                className="btn btn-icon btn-secondary btn-sm"
                                                onClick={() => {
                                                    if(confirm(isDevolucao ? 'Excluir esta devolução?' : 'Excluir este despacho?')) onDelete(s.id);
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
                        <h2 className="modal-title">{isDevolucao ? 'Editar Devolução' : 'Editar Despacho'}</h2>
                        <p className="modal-subtitle">{isDevolucao ? 'Atualize as informações da devolução' : 'Atualize as informações do despacho'}</p>

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
                                <select className="form-select" value={editingShipping.transportadora || ''} onChange={(e) => {
                                    const val = e.target.value;
                                    const isLocal = val === 'Entrega Local';
                                    setEditingShipping({
                                        ...editingShipping,
                                        transportadora: val,
                                        ...(isLocal ? {
                                            codigoRastreio: '', linkRastreio: '', melhorEnvioId: '',
                                            entregaLocal: true,
                                        } : {
                                            entregaLocal: false,
                                        }),
                                    });
                                }}>
                                    <option value="">Selecione...</option>
                                    <option value="Entrega Local" style={{fontWeight: 600}}>📦 Entrega Local</option>
                                    <option disabled>───────────</option>
                                    {transportadoras.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                        </div>

                        {/* Info banner for Entrega Local */}
                        {editingShipping.transportadora === 'Entrega Local' && (
                            <div style={{
                                background: '#D1FAE5', border: '1px solid #6EE7B7', borderRadius: '8px',
                                padding: '10px 14px', marginBottom: '12px', fontSize: '13px', color: '#065F46',
                                display: 'flex', alignItems: 'center', gap: '8px'
                            }}>
                                📦 Entrega local — entregador receberá link para anexar comprovante.
                            </div>
                        )}

                        {/* Tracking fields — hidden for Entrega Local */}
                        {editingShipping.transportadora !== 'Entrega Local' && (<>
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
                        </>)}

                        {/* Comprovação fields — shown for ENTREGUE status or Entrega Local */}
                        {(editingShipping.transportadora === 'Entrega Local' || editingShipping.status === 'ENTREGUE') && (
                            <div style={{border: '1px solid var(--border-default)', borderRadius: '8px', padding: '14px', marginBottom: '12px'}}>
                                <h4 style={{margin: '0 0 10px', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)'}}>Comprovação de Entrega</h4>
                                <div className="form-group">
                                    <label className="form-label">Nome do Recebedor</label>
                                    <input type="text" className="form-input" value={editingShipping.recebedorNome || ''} onChange={(e) => setEditingShipping({...editingShipping, recebedorNome: e.target.value})} placeholder="Quem recebeu a entrega" />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Observações da Entrega</label>
                                    <textarea className="form-textarea" value={editingShipping.comprovanteObs || ''} onChange={(e) => setEditingShipping({...editingShipping, comprovanteObs: e.target.value})} placeholder="Detalhes sobre a entrega..." rows={2} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Fotos do Comprovante (máx. 3)</label>
                                    <div style={{display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px'}}>
                                        {(editingShipping.comprovanteFotos || []).map((path, i) => (
                                            <div key={i} style={{
                                                position: 'relative', width: '100px', height: '100px',
                                                borderRadius: '8px', overflow: 'hidden', border: '1px solid #d1d5db'
                                            }}>
                                                {editSignedUrls[path] ? (
                                                    <img src={editSignedUrls[path]} alt="" style={{width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer'}} onClick={() => window.open(editSignedUrls[path], '_blank')} />
                                                ) : (
                                                    <div style={{width: '100%', height: '100%', background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: '11px'}}>📷</div>
                                                )}
                                                <button type="button" onClick={async () => {
                                                    const fotos = [...(editingShipping.comprovanteFotos || [])];
                                                    const removed = fotos.splice(i, 1)[0];
                                                    setEditingShipping({...editingShipping, comprovanteFotos: fotos});
                                                    try { const rb = resolvePhotoBucket(removed); await supabaseClient.storage.from(rb.bucket).remove([rb.realPath]); } catch (_) {}
                                                }} style={{
                                                    position: 'absolute', top: '3px', right: '3px',
                                                    width: '20px', height: '20px', borderRadius: '50%',
                                                    background: 'rgba(239,68,68,0.9)', color: '#fff',
                                                    border: 'none', cursor: 'pointer', fontSize: '13px',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                }}>×</button>
                                            </div>
                                        ))}
                                    </div>
                                    {(editingShipping.comprovanteFotos || []).length < 3 && (
                                        <div>
                                            <input ref={editFotoInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple style={{display: 'none'}} onChange={handleEditFotoUpload} />
                                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => editFotoInputRef.current?.click()} disabled={uploadingEditFoto} style={{fontSize: '12px'}}>
                                                {uploadingEditFoto ? 'Enviando...' : '📷 Anexar foto'}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Link para Entregador — only for Entrega Local */}
                        {(editingShipping.entregaLocal || editingShipping.transportadora === 'Entrega Local') && (
                            <div style={{border: '1px solid #d1d5db', borderRadius: '8px', padding: '14px', marginBottom: '12px'}}>
                                <h4 style={{margin: '0 0 10px', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)'}}>Link para Entregador</h4>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Nome do Entregador</label>
                                        <input type="text" className="form-input" value={entregadorNome} onChange={(e) => setEntregadorNome(e.target.value)} placeholder="Nome do motorista" />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Telefone (WhatsApp)</label>
                                        <input type="text" className="form-input" value={entregadorTelefone} onChange={(e) => setEntregadorTelefone(e.target.value)} placeholder="(11) 99999-9999" />
                                    </div>
                                </div>
                                {deliveryToken ? (
                                    <div style={{fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px'}}>
                                        <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px'}}>
                                            <span className="badge" style={{
                                                background: deliveryToken.status === 'ativo' ? '#d1fae5' : '#fee2e2',
                                                color: deliveryToken.status === 'ativo' ? '#065f46' : '#991b1b',
                                                fontSize: '10px',
                                            }}>
                                                {deliveryToken.status === 'ativo' ? 'Link ativo' : deliveryToken.status === 'usado' ? 'Usado' : 'Expirado'}
                                            </span>
                                            <span>Fotos: {deliveryToken.uploads_count}/{deliveryToken.max_uploads}</span>
                                        </div>
                                        <div style={{display: 'flex', gap: '6px', flexWrap: 'wrap'}}>
                                            <button className="btn btn-secondary btn-sm" style={{fontSize: '11px'}} onClick={() => {
                                                const link = `https://orne-estoque.vercel.app/entrega/${deliveryToken.token}`;
                                                navigator.clipboard.writeText(link).then(() => {
                                                    setSuccess('Link copiado!');
                                                    setTimeout(() => setSuccess(''), 2000);
                                                });
                                            }}>Copiar Link</button>
                                            <button className="btn btn-secondary btn-sm" style={{fontSize: '11px'}} onClick={() => {
                                                const link = `https://orne-estoque.vercel.app/entrega/${deliveryToken.token}`;
                                                const telefone = (deliveryToken.entregador_telefone || '').replace(/\D/g, '');
                                                const tel = telefone.startsWith('55') ? telefone : `55${telefone}`;
                                                const msg = encodeURIComponent(
                                                    `Olá ${deliveryToken.entregador_nome || ''}!\n\nLink para comprovante de entrega ORNE™:\n${link}`
                                                );
                                                window.open(`https://wa.me/${tel}?text=${msg}`, '_blank');
                                            }}>Reenviar WhatsApp</button>
                                            <button className="btn btn-primary btn-sm" style={{fontSize: '11px'}} onClick={gerarLinkEntregador} disabled={loadingToken}>
                                                {loadingToken ? 'Gerando...' : 'Novo Link'}
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <button className="btn btn-primary btn-sm" style={{fontSize: '12px', marginTop: '4px'}} onClick={gerarLinkEntregador} disabled={loadingToken}>
                                        {loadingToken ? 'Gerando...' : 'Gerar Link e Enviar WhatsApp'}
                                    </button>
                                )}
                            </div>
                        )}

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

                        {/* Devolução-specific fields */}
                        {isDevolucao && (
                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">Motivo da Devolução</label>
                                    <select className="form-select" value={editingShipping.motivoDevolucao || ''} onChange={(e) => setEditingShipping({...editingShipping, motivoDevolucao: e.target.value})}>
                                        <option value="">Selecione...</option>
                                        <option value="Defeito">Defeito</option>
                                        <option value="Arrependimento">Arrependimento</option>
                                        <option value="Produto errado">Produto errado</option>
                                        <option value="Avaria no transporte">Avaria no transporte</option>
                                        <option value="Outro">Outro</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">HUB Destino</label>
                                    <select className="form-select" value={editingShipping.hubDestino || ''} onChange={(e) => setEditingShipping({...editingShipping, hubDestino: e.target.value})}>
                                        <option value="">Selecione...</option>
                                        {locaisOrigem.map(l => <option key={l} value={l}>{l}</option>)}
                                    </select>
                                </div>
                            </div>
                        )}

                        <div className="form-group">
                            <label className="form-label">Observações</label>
                            <textarea className="form-textarea" value={editingShipping.observacoes || ''} onChange={(e) => setEditingShipping({...editingShipping, observacoes: e.target.value})} placeholder="Informações adicionais..." />
                        </div>

                        <div className="btn-group">
                            <button
                                className="btn btn-primary"
                                onClick={async () => {
                                    const isLocal = editingShipping.transportadora === 'Entrega Local';
                                    const updateData = {
                                        nfNumero: editingShipping.nfNumero,
                                        cliente: editingShipping.cliente,
                                        destino: editingShipping.destino,
                                        localOrigem: editingShipping.localOrigem,
                                        transportadora: editingShipping.transportadora,
                                        codigoRastreio: isLocal ? '' : editingShipping.codigoRastreio,
                                        linkRastreio: isLocal ? '' : editingShipping.linkRastreio,
                                        melhorEnvioId: isLocal ? '' : editingShipping.melhorEnvioId,
                                        status: editingShipping.status,
                                        observacoes: editingShipping.observacoes,
                                        hubTelefone: editingShipping.hubTelefone,
                                        telefoneCliente: editingShipping.telefoneCliente,
                                        entregaLocal: isLocal,
                                        recebedorNome: editingShipping.recebedorNome || '',
                                        comprovanteObs: editingShipping.comprovanteObs || '',
                                        comprovanteFotos: editingShipping.comprovanteFotos || [],
                                        dataEntrega: editingShipping.dataEntrega,
                                        updatedAt: new Date().toISOString()
                                    };
                                    if (isDevolucao) {
                                        updateData.motivoDevolucao = editingShipping.motivoDevolucao || '';
                                        updateData.hubDestino = editingShipping.hubDestino || '';
                                    }
                                    await onUpdate(editingShipping.id, updateData);
                                    setEditingShipping(null);
                                    setSuccess(isDevolucao ? 'Devolução atualizada com sucesso!' : 'Despacho atualizado com sucesso!');
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

                        {canEdit ? (
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
            {/* Modal Multi-NF Delivery Token */}
            {showMultiDeliveryModal && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{maxWidth: '500px'}}>
                        <h2 className="modal-title">📦 Link para Entregador</h2>
                        <p className="modal-subtitle">
                            Gerar link único para {selectedForDelivery.size} entrega(s) local(is)
                        </p>

                        <div style={{
                            background: '#F9FAFB', border: '1px solid #E5E7EB',
                            borderRadius: '8px', padding: '12px', marginBottom: '16px',
                            maxHeight: '200px', overflowY: 'auto',
                        }}>
                            {shippings.filter(s => selectedForDelivery.has(s.id)).map(s => (
                                <div key={s.id} style={{
                                    display: 'flex', justifyContent: 'space-between',
                                    padding: '6px 0', borderBottom: '1px solid #E5E7EB',
                                    fontSize: '13px',
                                }}>
                                    <span><strong>NF {s.nfNumero || '-'}</strong> — {s.cliente || '-'}</span>
                                    <span style={{color: '#6B7280', fontSize: '12px'}}>{s.destino ? s.destino.substring(0, 25) + '...' : ''}</span>
                                </div>
                            ))}
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">Nome do Entregador *</label>
                                <input
                                    type="text" className="form-input"
                                    value={multiEntregadorNome}
                                    onChange={(e) => setMultiEntregadorNome(e.target.value)}
                                    placeholder="Nome do motorista"
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Telefone (WhatsApp) *</label>
                                <input
                                    type="text" className="form-input"
                                    value={multiEntregadorTelefone}
                                    onChange={(e) => setMultiEntregadorTelefone(e.target.value)}
                                    placeholder="(11) 99999-9999"
                                />
                            </div>
                        </div>

                        <div className="btn-group">
                            <button
                                className="btn btn-primary"
                                onClick={gerarLinkMultiEntregador}
                                disabled={loadingMultiToken}
                            >
                                {loadingMultiToken ? 'Gerando...' : 'Gerar Link e Enviar WhatsApp'}
                            </button>
                            <button className="btn btn-secondary" onClick={() => setShowMultiDeliveryModal(false)}>
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
