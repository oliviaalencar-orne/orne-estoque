/**
 * SeparationManager.jsx — Orchestrator for separation management
 *
 * Tabs: Lista | Importar NF (Tiny) | Manual
 * Hub tabs: Todos | <dynamic hub names>
 * Handles view switching, separation CRUD, dispatch handoff, and WhatsApp export.
 */
import React, { useState, useMemo, useCallback, useRef } from 'react';
import { Icon } from '@/utils/icons';
import { supabaseClient } from '@/config/supabase';
import { buildSeparationMessage, openWhatsAppWithMessage, copyToClipboard } from '@/utils/separationMessage';
import { formatHubName } from '@/utils/hubs';
import TinyNFeImport from '@/components/import/TinyNFeImport';
import SeparationList from './SeparationList';
import SeparationForm from './SeparationForm';
import HubsModal from './HubsModal';

export default function SeparationManager({
  separations, onAdd, onUpdate, onDelete,
  products, stock, entries, exits, shippings,
  categories, locaisOrigem, onUpdateLocais,
  onAddProduct, onAddCategory, onUpdateCategory, onDeleteCategory,
  user, onSendToDispatch, onAddShipping, onAddExit,
  onDeleteShipping, onDeleteExit,
  isStockAdmin,
  isOperador,
  hubs, onAddHub, onUpdateHub, onDeleteHub
}) {
  const canEditSeparation = isStockAdmin || isOperador;
  const [activeView, setActiveView] = useState('list');
  const [editingSeparation, setEditingSeparation] = useState(null);
  const [success, setSuccess] = useState('');
  const [selectedHubId, setSelectedHubId] = useState('all');
  const [showHubsModal, setShowHubsModal] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [shareMenuPos, setShareMenuPos] = useState({ top: 0, right: 0 });
  const [copiedHub, setCopiedHub] = useState(false);
  const [batchProgress, setBatchProgress] = useState(null); // { current, total, message }
  const shareBtnRef = useRef(null);

  // Count active (non-despachado) separations per hub
  const hubCounts = useMemo(() => {
    const counts = { all: 0 };
    (hubs || []).forEach(h => { counts[h.id] = 0; });
    separations.forEach(s => {
      if (s.status !== 'despachado') {
        counts.all++;
        if (s.hubId && counts[s.hubId] !== undefined) {
          counts[s.hubId]++;
        }
      }
    });
    return counts;
  }, [separations, hubs]);

  // Filter separations by selected hub
  const filteredSeparations = useMemo(() => {
    if (selectedHubId === 'all') return separations;
    return separations.filter(s => s.hubId === selectedHubId);
  }, [separations, selectedHubId]);

  // Get pending separations for the selected hub
  const pendingSeparationsForHub = useMemo(() => {
    if (selectedHubId === 'all') return [];
    return separations.filter(s => s.hubId === selectedHubId && s.status === 'pendente');
  }, [separations, selectedHubId]);

  // Get hub name for selected hub (display-normalized)
  const selectedHubName = useMemo(() => {
    if (selectedHubId === 'all') return '';
    const hub = (hubs || []).find(h => h.id === selectedHubId);
    return hub ? formatHubName(hub.name) : '';
  }, [selectedHubId, hubs]);

  // Build message for the selected hub's pending separations
  const handleBuildHubMessage = useCallback(() => {
    if (pendingSeparationsForHub.length === 0) return '';
    return buildSeparationMessage({
      hubName: selectedHubName,
      separations: pendingSeparationsForHub,
    });
  }, [pendingSeparationsForHub, selectedHubName]);

  const handleWhatsAppHub = useCallback(() => {
    const msg = handleBuildHubMessage();
    if (msg) openWhatsAppWithMessage(msg);
    setShowShareMenu(false);
  }, [handleBuildHubMessage]);

  const handleCopyHub = useCallback(async () => {
    const msg = handleBuildHubMessage();
    if (msg) {
      await copyToClipboard(msg);
      setCopiedHub(true);
      setTimeout(() => setCopiedHub(false), 2000);
    }
    setShowShareMenu(false);
  }, [handleBuildHubMessage]);

  // Check if NF is duplicate (used by TinyNFeImport confirming phase)
  const checkNfDuplicate = useCallback((nfNum) => {
    const existingShipping = (shippings || []).find(s => s.nfNumero === nfNum);
    if (existingShipping) return { type: 'shipping', label: 'Ja despachada' };
    const existingSeparation = separations.find(s => s.nfNumero === nfNum && s.status !== 'despachado');
    if (existingSeparation) return { type: 'separation', label: `Em separacao (${existingSeparation.status})` };
    return null;
  }, [shippings, separations]);

  const handlePrepareSeparationFromTiny = async (data, options = {}) => {
    const nf = data.nfNumero || '';
    const isBatch = options.batchMode === true;

    // Duplicate checks — skip in batch mode (already shown in confirming/summary phase)
    if (!isBatch) {
      const existingShipping = (shippings || []).find(s => s.nfNumero === nf);
      if (existingShipping) {
        if (!window.confirm(`A NF ${nf} já foi despachada. Deseja criar uma separação mesmo assim?`)) {
          return false;
        }
      }

      if (!existingShipping) {
        const existingSeparation = separations.find(s => s.nfNumero === nf && s.status !== 'despachado');
        if (existingSeparation) {
          if (!window.confirm(`A NF ${nf} já está em separação (status: ${existingSeparation.status}). Deseja criar uma nova separação mesmo assim?`)) {
            return false;
          }
        }
      }
    }

    const produtosComFlags = (data.produtos || []).map(p => ({
      ...p,
      doNossoEstoque: !!p.produtoEstoque,
      baixarEstoque: false,
      observacao: '',
    }));

    const separationObj = {
      nfNumero: nf,
      cliente: data.cliente || '',
      destino: data.destino || '',
      observacoes: data.observacoes || '',
      transportadora: data.transportadora || '',
      status: 'pendente',
      hubId: data.hubId || (selectedHubId !== 'all' ? selectedHubId : ''),
      produtos: produtosComFlags,
    };

    // Batch mode: save directly without going to edit form
    if (isBatch) {
      await onAdd({
        ...separationObj,
        userId: user?.email || '',
      });
      return true;
    }

    // Single mode: open edit form (existing behavior)
    setEditingSeparation(separationObj);
    setActiveView('edit');
    return true;
  };

  const handleSaveSeparation = async (separationData) => {
    try {
      if (separationData.id) {
        await onUpdate(separationData.id, separationData);
      } else {
        await onAdd({
          ...separationData,
          status: 'pendente',
          userId: user?.email || '',
        });
      }
      setActiveView('list');
      setEditingSeparation(null);
      setSuccess('Separação salva com sucesso!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      alert('Erro ao salvar separação: ' + err.message);
    }
  };

  const handleEdit = (sep) => {
    setEditingSeparation(sep);
    setActiveView('edit');
  };

  const handleSendToDispatch = async (separation) => {
    const dispatchData = {
      nfNumero: separation.nfNumero,
      cliente: separation.cliente,
      destino: separation.destino,
      transportadora: separation.transportadora || '',
      produtos: separation.produtos,
    };
    await onUpdate(separation.id, { status: 'despachado', shippingId: 'pending' });
    onSendToDispatch(dispatchData);
  };

  // ── Batch status change ──────────────────────────────────────────────
  const handleBatchStatusChange = async (selectedSeparations, newStatus, clearSelection) => {
    if (!selectedSeparations.length) return;
    const total = selectedSeparations.length;
    let updated = 0;
    let errors = 0;
    setBatchProgress({ current: 0, total, message: `Atualizando 0/${total}...` });

    for (let i = 0; i < selectedSeparations.length; i++) {
      const sep = selectedSeparations[i];
      setBatchProgress({ current: i + 1, total, message: `Atualizando ${i + 1}/${total}...` });
      try {
        await onUpdate(sep.id, { status: newStatus });
        updated++;
      } catch (err) {
        console.error(`Erro ao atualizar separação ${sep.nfNumero}:`, err);
        errors++;
      }
    }

    setBatchProgress(null);
    clearSelection();
    const msg = errors > 0
      ? `${updated} atualizado(s), ${errors} com erro`
      : `${updated} separação(ões) atualizada(s) para "${newStatus}"`;
    setSuccess(msg);
    setTimeout(() => setSuccess(''), 5000);
  };

  // ── Revert status (admin-only) ─────────────────────────────────────
  // Checks shipping blockers before reverting FROM 'despachado'.
  // Returns:
  //   { ok: true }                              — success
  //   { ok: false, blockers: [...], nf }        — blocked by real shipping activity
  //   throws Error                              — unexpected failure
  const STATUS_ORDER = ['pendente', 'separado', 'embalado', 'despachado'];

  const verificarBloqueiosReversao = useCallback(async (sep) => {
    // Called only when sep.status === 'despachado'
    const shippingId = sep.shippingId;
    if (!shippingId || shippingId === 'pending') return { blockers: [], shipping: null };

    // Fetch fresh shipping from DB to avoid stale state
    const { data: shipRow, error: shipErr } = await supabaseClient
      .from('shippings')
      .select('id, codigo_rastreio, comprovante_fotos')
      .eq('id', shippingId)
      .maybeSingle();
    if (shipErr) throw shipErr;

    const blockers = [];
    if (shipRow) {
      if (shipRow.codigo_rastreio && String(shipRow.codigo_rastreio).trim()) {
        blockers.push(`código de rastreio preenchido (${shipRow.codigo_rastreio})`);
      }
      if (Array.isArray(shipRow.comprovante_fotos) && shipRow.comprovante_fotos.length > 0) {
        blockers.push(`${shipRow.comprovante_fotos.length} comprovante(s) de entrega anexado(s)`);
      }
    }

    const { data: tokenLinks, error: tokenErr } = await supabaseClient
      .from('delivery_token_shippings')
      .select('token_id')
      .eq('shipping_id', shippingId);
    if (tokenErr) throw tokenErr;
    if (tokenLinks && tokenLinks.length > 0) {
      blockers.push(`vinculado a ${tokenLinks.length} link(s) de entrega`);
    }

    return { blockers, shipping: shipRow };
  }, []);

  const handleReverterStatus = useCallback(async (sep, targetStatus) => {
    if (!isStockAdmin) {
      throw new Error('Apenas administradores podem reverter status.');
    }
    const currentIdx = STATUS_ORDER.indexOf(sep.status);
    const targetIdx = STATUS_ORDER.indexOf(targetStatus);
    if (targetIdx < 0 || currentIdx < 0) {
      throw new Error('Status inválido.');
    }
    if (targetIdx >= currentIdx) {
      throw new Error('Status de destino deve ser anterior ao atual.');
    }

    // Simple case: not coming from despachado
    if (sep.status !== 'despachado') {
      await onUpdate(sep.id, { status: targetStatus });
      return { ok: true };
    }

    // Coming from despachado — verify shipping
    const { blockers, shipping: shipRow } = await verificarBloqueiosReversao(sep);
    if (blockers.length > 0) {
      return { ok: false, blockers, nf: sep.nfNumero };
    }

    // Clean path — delete exits, shipping, then revert separation
    const shippingId = sep.shippingId;

    // 1. Delete exits that were created for this separation
    const exitIds = (sep.produtos || []).map(p => p.exitId).filter(Boolean);
    if (exitIds.length > 0 && typeof onDeleteExit === 'function') {
      for (const eid of exitIds) {
        try {
          await onDeleteExit(eid);
        } catch (e) {
          console.error('Erro ao excluir saída', eid, e);
        }
      }
    }

    // 2. Delete the shipping (if any)
    if (shippingId && shippingId !== 'pending' && shipRow && typeof onDeleteShipping === 'function') {
      try {
        await onDeleteShipping(shippingId);
      } catch (e) {
        console.error('Erro ao excluir despacho', shippingId, e);
      }
    }

    // 3. Clear exitId/baixouEstoque from produtos and revert separation
    const produtosLimpos = (sep.produtos || []).map(p => {
      const { exitId: _ex, baixouEstoque: _bx, ...rest } = p;
      return rest;
    });
    await onUpdate(sep.id, {
      status: targetStatus,
      shippingId: null,
      produtos: produtosLimpos,
    });

    return { ok: true };
  }, [isStockAdmin, onUpdate, onDeleteExit, onDeleteShipping, verificarBloqueiosReversao]);

  // ── Batch revert (admin-only) ─────────────────────────────────────
  const handleBatchReverter = useCallback(async (selectedSeparations, targetStatus, clearSelection) => {
    if (!isStockAdmin) {
      alert('Apenas administradores podem reverter status.');
      return;
    }
    if (!selectedSeparations?.length) return;

    const total = selectedSeparations.length;
    let reverted = 0;
    const blocked = []; // { nf, blockers }
    let errors = 0;
    setBatchProgress({ current: 0, total, message: `Revertendo 0/${total}...` });

    for (let i = 0; i < selectedSeparations.length; i++) {
      const sep = selectedSeparations[i];
      setBatchProgress({ current: i + 1, total, message: `Revertendo ${i + 1}/${total}... (NF ${sep.nfNumero || '-'})` });
      try {
        const result = await handleReverterStatus(sep, targetStatus);
        if (result?.ok) {
          reverted++;
        } else if (result?.blockers?.length) {
          blocked.push({ nf: sep.nfNumero, blockers: result.blockers });
        }
      } catch (err) {
        console.error(`Erro ao reverter NF ${sep.nfNumero}:`, err);
        errors++;
      }
    }

    setBatchProgress(null);
    clearSelection && clearSelection();

    const parts = [];
    if (reverted > 0) parts.push(`${reverted} revertida(s)`);
    if (blocked.length > 0) {
      parts.push(`${blocked.length} bloqueada(s)`);
      // Print detailed warning
      const details = blocked.slice(0, 3).map(b => `NF ${b.nf}: ${b.blockers.join('; ')}`).join('\n');
      const more = blocked.length > 3 ? `\n...e mais ${blocked.length - 3}` : '';
      alert(`Algumas NFs foram bloqueadas:\n\n${details}${more}`);
    }
    if (errors > 0) parts.push(`${errors} com erro`);
    setSuccess(parts.join(', ') || 'Nenhuma ação');
    setTimeout(() => setSuccess(''), 6000);
  }, [isStockAdmin, handleReverterStatus]);

  // ── Batch dispatch — create shippings + exits ──────────────────────
  const handleBatchDispatch = async (selectedSeparations, clearSelection, options = {}) => {
    const isLocal = options.entregaLocal === true;
    if (!selectedSeparations.length) return;
    if (!onAddShipping) {
      alert('Função de criar despacho não disponível');
      return;
    }

    const total = selectedSeparations.length;
    let created = 0;
    let errors = 0;
    setBatchProgress({ current: 0, total, message: `Criando despacho 0/${total}...` });

    for (let i = 0; i < selectedSeparations.length; i++) {
      const sep = selectedSeparations[i];
      setBatchProgress({ current: i + 1, total, message: `Criando despacho ${i + 1}/${total}... (NF ${sep.nfNumero || '-'})` });

      try {
        // Determine local de origem from hub
        const hub = (hubs || []).find(h => h.id === sep.hubId);
        const localOrigem = hub?.name || '';

        // Create the shipping
        const shippingResult = await onAddShipping({
          nfNumero: sep.nfNumero || '',
          cliente: sep.cliente || '',
          destino: sep.destino || '',
          localOrigem,
          transportadora: isLocal ? 'Entrega Local' : (sep.transportadora || ''),
          codigoRastreio: '',
          linkRastreio: '',
          melhorEnvioId: '',
          produtos: sep.produtos || [],
          observacoes: sep.observacoes || '',
          status: 'DESPACHADO',
          entregaLocal: isLocal,
          dataEntrega: null,
        });

        const shippingId = shippingResult?.id;
        if (!shippingId) throw new Error('Despacho criado mas sem ID');

        // Process stock exits for products with baixarEstoque
        if (onAddExit && sep.produtos && sep.produtos.length > 0) {
          const produtosComExit = [...sep.produtos];
          for (let j = 0; j < produtosComExit.length; j++) {
            const prod = produtosComExit[j];
            if (prod.produtoEstoque && prod.baixarEstoque) {
              try {
                const exitResult = await onAddExit({
                  type: 'VENDA',
                  sku: prod.produtoEstoque.sku || prod.sku,
                  quantity: prod.quantidade || 1,
                  client: sep.cliente || '',
                  nf: sep.nfNumero || '',
                  nfOrigem: (prod.nfOrigem && prod.nfOrigem !== 'Sem NF' && prod.nfOrigem !== 'SEM_NF')
                    ? prod.nfOrigem : null,
                });
                if (exitResult?.id) {
                  produtosComExit[j] = { ...produtosComExit[j], exitId: exitResult.id, baixouEstoque: true };
                }
              } catch (exitErr) {
                console.error(`Erro exit: ${prod.sku}`, exitErr);
              }
            }
          }
          // Update shipping produtos with exit info
          const hasExit = produtosComExit.some(p => p.exitId);
          if (hasExit) {
            try {
              const { error: updErr } = await supabaseClient.from('shippings').update({ produtos: produtosComExit }).eq('id', shippingId);
              if (updErr) console.error('Erro ao atualizar produtos do despacho:', updErr);
            } catch (updateErr) {
              console.error('Erro ao atualizar produtos do despacho:', updateErr);
            }
          }
        }

        // Update separation: status='despachado', shipping_id
        await onUpdate(sep.id, { status: 'despachado', shippingId });
        created++;
      } catch (err) {
        console.error(`Erro ao criar despacho para NF ${sep.nfNumero}:`, err);
        errors++;
      }
    }

    setBatchProgress(null);
    clearSelection();
    const msg = errors > 0
      ? `${created} despacho(s) criado(s), ${errors} com erro`
      : `${created} despacho(s) criado(s) com sucesso!`;
    setSuccess(msg);
    setTimeout(() => setSuccess(''), 8000);
  };

  // ── Gerar link de entregador a partir de separações (Entrega Local) ──
  const gerarLinkEntregadorDaSeparacao = async (selectedSeparations, entregador, clearSelection) => {
    if (!selectedSeparations?.length) return;
    if (!entregador?.nome || !entregador?.telefone) {
      throw new Error('Nome e telefone do entregador são obrigatórios');
    }

    // 1. Garantir que todas viraram despachos: separar as que ainda não têm shippingId
    const pendentes = selectedSeparations.filter(s => !s.shippingId || s.shippingId === 'pending');
    const jaDespachadas = selectedSeparations.filter(s => s.shippingId && s.shippingId !== 'pending');

    const shippingIdsCriados = [];
    const total = pendentes.length;

    for (let i = 0; i < pendentes.length; i++) {
      const sep = pendentes[i];
      setBatchProgress({ current: i + 1, total, message: `Despachando ${i + 1}/${total} (NF ${sep.nfNumero || '-'})...` });
      try {
        const hub = (hubs || []).find(h => h.id === sep.hubId);
        const localOrigem = hub?.name || '';
        const shippingResult = await onAddShipping({
          nfNumero: sep.nfNumero || '',
          cliente: sep.cliente || '',
          destino: sep.destino || '',
          localOrigem,
          transportadora: 'Entrega Local',
          codigoRastreio: '',
          linkRastreio: '',
          melhorEnvioId: '',
          produtos: sep.produtos || [],
          observacoes: sep.observacoes || '',
          status: 'DESPACHADO',
          entregaLocal: true,
          dataEntrega: null,
        });
        const shippingId = shippingResult?.id;
        if (!shippingId) throw new Error('Despacho criado mas sem ID');

        // Process exits
        if (onAddExit && sep.produtos?.length) {
          const produtosComExit = [...sep.produtos];
          for (let j = 0; j < produtosComExit.length; j++) {
            const prod = produtosComExit[j];
            if (prod.produtoEstoque && prod.baixarEstoque) {
              try {
                const exitResult = await onAddExit({
                  type: 'VENDA',
                  sku: prod.produtoEstoque.sku || prod.sku,
                  quantity: prod.quantidade || 1,
                  client: sep.cliente || '',
                  nf: sep.nfNumero || '',
                  nfOrigem: (prod.nfOrigem && prod.nfOrigem !== 'Sem NF' && prod.nfOrigem !== 'SEM_NF')
                    ? prod.nfOrigem : null,
                });
                if (exitResult?.id) {
                  produtosComExit[j] = { ...produtosComExit[j], exitId: exitResult.id, baixouEstoque: true };
                }
              } catch (exitErr) {
                console.error(`Erro exit: ${prod.sku}`, exitErr);
              }
            }
          }
          const hasExit = produtosComExit.some(p => p.exitId);
          if (hasExit) {
            try {
              await supabaseClient.from('shippings').update({ produtos: produtosComExit }).eq('id', shippingId);
            } catch (updateErr) {
              console.error('Erro ao atualizar produtos do despacho:', updateErr);
            }
          }
        }

        await onUpdate(sep.id, { status: 'despachado', shippingId });
        shippingIdsCriados.push(shippingId);
      } catch (err) {
        console.error(`Erro ao despachar NF ${sep.nfNumero}:`, err);
        setBatchProgress(null);
        throw new Error(`Falha ao despachar NF ${sep.nfNumero}: ${err.message || err}`);
      }
    }

    setBatchProgress(null);

    // 2. Reunir todos os shippingIds (criados agora + já existentes)
    const allShippingIds = [
      ...shippingIdsCriados,
      ...jaDespachadas.map(s => s.shippingId),
    ].filter(Boolean);

    if (!allShippingIds.length) {
      throw new Error('Nenhum despacho disponível para vincular');
    }

    // 3. Criar token multi-NF (shipping_id=null)
    const { data: tokenData, error: tokenErr } = await supabaseClient
      .from('delivery_tokens')
      .insert({
        shipping_id: null,
        entregador_nome: entregador.nome,
        entregador_telefone: entregador.telefone,
      })
      .select('*')
      .single();
    if (tokenErr) throw tokenErr;

    // 4. Criar junction rows
    const junctionRows = allShippingIds.map(sid => ({
      token_id: tokenData.id,
      shipping_id: sid,
    }));
    const { error: jErr } = await supabaseClient
      .from('delivery_token_shippings')
      .insert(junctionRows);
    if (jErr) throw jErr;

    // 5. Build WhatsApp message (NOVO domínio: estoque.ornedecor.com)
    const nfList = selectedSeparations
      .map(s => `• NF ${s.nfNumero || '-'} — ${s.cliente || '-'}`)
      .join('\n');
    const link = `https://estoque.ornedecor.com/entrega/${tokenData.token}`;
    const telefoneDigits = entregador.telefone.replace(/\D/g, '');
    const tel = telefoneDigits.startsWith('55') ? telefoneDigits : `55${telefoneDigits}`;
    const msg = encodeURIComponent(
      `Olá ${entregador.nome}!\n\n` +
      `Você está realizando ${allShippingIds.length} entrega(s) da *ORNE™*.\n\n` +
      `${nfList}\n\n` +
      `Anexe os comprovantes de entrega neste link:\n${link}\n\n` +
      `O link é válido por 48 horas.\nObrigado!`
    );
    window.open(`https://wa.me/${tel}?text=${msg}`, '_blank');

    if (clearSelection) clearSelection();
    setSuccess(`Link gerado para ${allShippingIds.length} entrega(s)!`);
    setTimeout(() => setSuccess(''), 5000);
  };

  const hasPending = pendingSeparationsForHub.length > 0;
  const isHubSelected = selectedHubId !== 'all';

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Separação</h1>
        <p className="page-subtitle">Prepare mercadorias para envio</p>
      </div>

      {success && <div className="alert alert-success">{success}</div>}

      {/* Hub tabs */}
      {(hubs || []).length > 0 && (
        <div className="card" style={{ marginBottom: '16px', padding: '8px 12px' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600, marginRight: '4px',
            }}>
              <Icon name="mapPin" size={14} /> HUB
              {isStockAdmin && (
                <button
                  onClick={() => setShowHubsModal(true)}
                  title="Gerenciar HUBs"
                  aria-label="Gerenciar HUBs"
                  style={{
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: 'var(--text-muted)', padding: '2px', marginLeft: '2px',
                    display: 'inline-flex', alignItems: 'center',
                  }}
                >
                  <Icon name="settings" size={14} />
                </button>
              )}
            </span>
            <button
              className={`filter-tab ${selectedHubId === 'all' ? 'active' : ''}`}
              onClick={() => { setSelectedHubId('all'); setShowShareMenu(false); }}
              style={{ fontSize: '12px', padding: '4px 10px' }}
            >
              Todos ({hubCounts.all})
            </button>
            {(hubs || []).map(hub => (
              <button
                key={hub.id}
                className={`filter-tab ${selectedHubId === hub.id ? 'active' : ''}`}
                onClick={() => { setSelectedHubId(hub.id); setShowShareMenu(false); }}
                style={{ fontSize: '12px', padding: '4px 10px' }}
              >
                {formatHubName(hub.name)} ({hubCounts[hub.id] || 0})
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Consolidated export button — on specific HUB tabs, for admin/operador */}
      {canEditSeparation && isHubSelected && (
        <div className="card" style={{ marginBottom: '12px', padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            {hasPending
              ? `${pendingSeparationsForHub.length} separação(ões) pendente(s) em ${selectedHubName}`
              : `Nenhuma separação pendente em ${selectedHubName}`
            }
          </span>
          <button
            ref={shareBtnRef}
            className="btn btn-primary"
            style={{
              fontSize: '12px',
              padding: '6px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              opacity: hasPending ? 1 : 0.5,
              cursor: hasPending ? 'pointer' : 'not-allowed',
            }}
            onClick={() => {
              if (!hasPending) return;
              if (shareBtnRef.current) {
                const rect = shareBtnRef.current.getBoundingClientRect();
                setShareMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
              }
              setShowShareMenu(!showShareMenu);
            }}
            disabled={!hasPending}
            title={hasPending ? 'Enviar solicitação de separação' : 'Nenhuma separação pendente'}
          >
            <Icon name="share" size={14} />
            Enviar Solicitação
          </button>
        </div>
      )}

      {/* Share dropdown — rendered as fixed portal outside any container */}
      {canEditSeparation && showShareMenu && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
            onClick={() => setShowShareMenu(false)}
          />
          <div style={{
            position: 'fixed',
            top: shareMenuPos.top,
            right: shareMenuPos.right,
            zIndex: 9999,
            background: '#fff',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
            padding: '4px',
            minWidth: '200px',
          }}>
            <button
              onClick={handleWhatsAppHub}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                padding: '8px 12px',
                border: 'none',
                background: 'transparent',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500,
                color: '#25D366',
                textAlign: 'left',
                transition: 'background 0.12s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#f0fdf4'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <Icon name="whatsapp" size={16} style={{ color: '#25D366' }} />
              Enviar via WhatsApp
            </button>
            <button
              onClick={handleCopyHub}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                padding: '8px 12px',
                border: 'none',
                background: 'transparent',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500,
                color: 'var(--text-primary)',
                textAlign: 'left',
                transition: 'background 0.12s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-secondary)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <Icon name="copy" size={16} />
              {copiedHub ? 'Copiado!' : 'Copiar mensagem'}
            </button>
          </div>
        </>
      )}

      {/* View tabs */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div className="filter-tabs">
          <button
            className={`filter-tab ${activeView === 'list' ? 'active' : ''}`}
            onClick={() => { setActiveView('list'); setEditingSeparation(null); }}
          >
            Solicitações ({filteredSeparations.length})
          </button>
          {isStockAdmin && (
            <button
              className={`filter-tab ${activeView === 'new-tiny' ? 'active' : ''}`}
              onClick={() => { setActiveView('new-tiny'); setEditingSeparation(null); }}
            >
              Importar NF (Tiny)
            </button>
          )}
          {isStockAdmin && (
            <button
              className={`filter-tab ${activeView === 'new-manual' ? 'active' : ''}`}
              onClick={() => {
                setEditingSeparation(null);
                setActiveView('new-manual');
              }}
            >
              Manual
            </button>
          )}
        </div>
      </div>

      {/* Views */}
      {activeView === 'list' && (
        <SeparationList
          separations={filteredSeparations}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onEdit={handleEdit}
          onSendToDispatch={handleSendToDispatch}
          onBatchStatusChange={handleBatchStatusChange}
          onBatchDispatch={handleBatchDispatch}
          onBatchReverter={handleBatchReverter}
          onReverter={handleReverterStatus}
          onGerarLinkEntregador={gerarLinkEntregadorDaSeparacao}
          hubs={hubs}
          showHubBadge={selectedHubId === 'all'}
          isStockAdmin={isStockAdmin}
          isOperador={isOperador}
        />
      )}

      {activeView === 'new-tiny' && (
        <TinyNFeImport
          products={products || []}
          onSubmitEntry={() => {}}
          onSubmitExit={() => {}}
          onAddProduct={onAddProduct}
          categories={categories}
          locaisOrigem={locaisOrigem}
          onUpdateLocais={onUpdateLocais}
          entries={entries || []}
          exits={exits || []}
          stock={stock || []}
          mode="exit"
          onAddCategory={onAddCategory}
          onUpdateCategory={onUpdateCategory}
          onDeleteCategory={onDeleteCategory}
          onPrepareShipping={handlePrepareSeparationFromTiny}
          checkNfDuplicate={checkNfDuplicate}
          hubs={hubs}
          defaultHubId={selectedHubId !== 'all' ? selectedHubId : ''}
        />
      )}

      {activeView === 'edit' && (
        <SeparationForm
          data={editingSeparation}
          onSave={handleSaveSeparation}
          onCancel={() => { setActiveView('list'); setEditingSeparation(null); }}
          products={products}
          stock={stock}
          entries={entries}
          exits={exits}
          categories={categories}
          locaisOrigem={locaisOrigem}
          onUpdateLocais={onUpdateLocais}
          onAddProduct={onAddProduct}
          onAddCategory={onAddCategory}
          onUpdateCategory={onUpdateCategory}
          onDeleteCategory={onDeleteCategory}
          hubs={hubs}
        />
      )}

      {activeView === 'new-manual' && (
        <SeparationForm
          data={null}
          onSave={handleSaveSeparation}
          onCancel={() => { setActiveView('list'); setEditingSeparation(null); }}
          products={products}
          stock={stock}
          entries={entries}
          exits={exits}
          categories={categories}
          locaisOrigem={locaisOrigem}
          onUpdateLocais={onUpdateLocais}
          onAddProduct={onAddProduct}
          onAddCategory={onAddCategory}
          onUpdateCategory={onUpdateCategory}
          onDeleteCategory={onDeleteCategory}
          hubs={hubs}
          defaultHubId={selectedHubId !== 'all' ? selectedHubId : ''}
        />
      )}

      {/* Hubs Management Modal */}
      {showHubsModal && (
        <HubsModal
          hubs={hubs || []}
          onAdd={onAddHub}
          onUpdate={onUpdateHub}
          onDelete={onDeleteHub}
          separations={separations}
          onClose={() => setShowHubsModal(false)}
        />
      )}

      {/* Batch progress overlay */}
      {batchProgress && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
        }}>
          <div className="card" style={{
            padding: '32px 40px',
            textAlign: 'center',
            maxWidth: '400px',
            width: '90vw',
          }}>
            <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>
              {batchProgress.message}
            </div>
            <div style={{
              width: '100%',
              height: '6px',
              background: 'var(--bg-secondary)',
              borderRadius: '3px',
              overflow: 'hidden',
            }}>
              <div style={{
                width: `${(batchProgress.current / batchProgress.total) * 100}%`,
                height: '100%',
                background: 'var(--primary)',
                borderRadius: '3px',
                transition: 'width 0.3s',
              }} />
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
              {batchProgress.current} de {batchProgress.total}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
