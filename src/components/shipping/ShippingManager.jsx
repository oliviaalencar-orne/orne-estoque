/**
 * ShippingManager.jsx — Orchestrator for shipping management
 *
 * Extracted from index-legacy.html L6111-8461
 * CRITICAL: handleSubmit, salvarDespachosLote, handlePrepareShippingFromTiny
 * MUST stay here because they use onAdd, onAddExit, onUpdate for stock deduction.
 */
import React, { useState, useEffect } from 'react';
import { Icon } from '@/utils/icons';
import LocaisModal from '@/components/ui/LocaisModal';
import TinyNFeImport from '@/components/import/TinyNFeImport';
import CSVImportTab from '@/components/import/CSVImportTab';
import ShippingList from './ShippingList';
import ShippingForm from './ShippingForm';
import ShippingXMLImport from './ShippingXMLImport';
import ShippingBatchImport from './ShippingBatchImport';
import DevolucaoForm from './DevolucaoForm';
import ShippingAnalytics from './ShippingAnalytics';
import { buscarRastreioPorNF } from '@/services/trackingService';

// Constantes
const transportadoras = ['Melhor Envio', 'Correios', 'Jadlog', 'Total Express', 'Braspress', 'TNT', 'Azul Cargo', 'Loggi', 'Outro'];

// Paleta: #8c52ff (roxo), #004aad (azul), #39845f (verde), #893030 (vermelho), #b4b4b4
// Fundos a 20% de opacidade, texto em cor pura.
export const statusList = {
    'DESPACHADO':          { label: 'Despachado',             color: '#8c52ff', textColor: '#6b3dcc', bg: 'rgba(140,82,255,0.20)' },
    'AGUARDANDO_COLETA':   { label: 'Aguardando Coleta',      color: '#b07dff', textColor: '#6b3dcc', bg: 'rgba(140,82,255,0.12)' },
    'EM_TRANSITO':         { label: 'Em Trânsito',            color: '#004aad', textColor: '#003a8c', bg: 'rgba(0,74,173,0.20)' },
    'SAIU_ENTREGA':        { label: 'Saiu p/ Entrega',        color: '#1800ad', textColor: '#12007a', bg: 'rgba(24,0,173,0.18)' },
    'TENTATIVA_ENTREGA':   { label: 'Tentativa de Entrega',   color: '#d97706', textColor: '#92400E', bg: 'rgba(217,119,6,0.18)' },
    'ENTREGUE':            { label: 'Entregue',               color: '#39845f', textColor: '#2a6348', bg: 'rgba(57,132,95,0.20)' },
    'DEVOLVIDO':           { label: 'Devolvido',              color: '#893030', textColor: '#6c2626', bg: 'rgba(137,48,48,0.18)' },
};

export const STATUS_TRANSITIONS = {
    'DESPACHADO':          ['AGUARDANDO_COLETA', 'EM_TRANSITO', 'ENTREGUE', 'DEVOLVIDO'],
    'AGUARDANDO_COLETA':   ['EM_TRANSITO', 'ENTREGUE', 'DEVOLVIDO'],
    'EM_TRANSITO':         ['SAIU_ENTREGA', 'ENTREGUE', 'DEVOLVIDO'],
    'SAIU_ENTREGA':        ['TENTATIVA_ENTREGA', 'ENTREGUE', 'DEVOLVIDO'],
    'TENTATIVA_ENTREGA':   ['SAIU_ENTREGA', 'ENTREGUE', 'DEVOLVIDO'],
    'ENTREGUE':            [],
    'DEVOLVIDO':           [],
};

export default function ShippingManager({
    shippings, onAdd, onUpdate, onDelete, stock, products,
    onAddExit, onAddEntry, locaisOrigem, onUpdateLocais, onAddProduct,
    categories, entries, exits, isStockAdmin,
    onAddCategory, onUpdateCategory, onDeleteCategory,
    pendingDispatchData, onClearPendingDispatch, onRefreshShippings,
    isOperador, isEquipe, onUpdateProduct
}) {
    const [activeView, setActiveView] = useState('list');
    const [tipoView, setTipoView] = useState('despacho');
    const [nfFile, setNfFile] = useState(null);
    const [nfData, setNfData] = useState(null);
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');
    const [showLocaisModal, setShowLocaisModal] = useState(false);

    // Estados para importação em lote
    const [importMode, setImportMode] = useState('single');
    const [batchFiles, setBatchFiles] = useState([]);
    const [batchDespachos, setBatchDespachos] = useState([]);
    const [processingBatch, setProcessingBatch] = useState(false);
    const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });

    // Formulário de despacho
    const [form, setForm] = useState({
        nfNumero: '',
        cliente: '',
        destino: '',
        localOrigem: locaisOrigem[0] || 'Loja Principal',
        transportadora: '',
        codigoRastreio: '',
        linkRastreio: '',
        melhorEnvioId: '',
        hubTelefone: '',
        baixarEstoque: false,
        produtos: [],
        observacoes: '',
        recebedorNome: '',
        comprovanteObs: '',
        comprovanteFotos: [],
    });

    // Auto-search ME for tracking data in background (fire-and-forget)
    const tentarBuscarRastreioME = (shippingId, nfNumero, clienteNome) => {
        if (!nfNumero) return;
        // Run in background — don't block the UI
        buscarRastreioPorNF(nfNumero, clienteNome).then(result => {
            if (result?.encontrado) {
                const updateData = {};
                if (result.melhor_envio_id) updateData.melhorEnvioId = result.melhor_envio_id;
                if (result.codigo_rastreio) updateData.codigoRastreio = result.codigo_rastreio;
                if (result.link_rastreio) updateData.linkRastreio = result.link_rastreio;
                if (result.transportadora) updateData.transportadora = result.transportadora;
                if (Object.keys(updateData).length > 0) {
                    onUpdate(shippingId, updateData);
                }
            }
        }).catch(() => {
            // Auto-ME search failed silently
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

    // Callback para quando TinyNFeImport prepara dados para despacho
    const handlePrepareShippingFromTiny = async (data, options = {}) => {
        const isBatch = options.batchMode === true;

        // Batch mode: save shipping directly (skip manual form)
        if (isBatch) {
            const shippingData = {
                nfNumero: data.nfNumero || '',
                cliente: data.cliente || '',
                destino: data.destino || '',
                localOrigem: data.localOrigem || locaisOrigem[0] || 'Loja Principal',
                transportadora: data.transportadora || '',
                codigoRastreio: '',
                linkRastreio: '',
                melhorEnvioId: '',
                hubTelefone: '',
                produtos: data.produtos || [],
                observacoes: data.observacoes || '',
                status: 'DESPACHADO',
            };

            const savedShipping = await onAdd(shippingData);
            const shippingId = savedShipping?.id || null;

            // Stock deduction for linked products
            if (shippingId) {
                const produtosComExit = [...shippingData.produtos];
                let temExit = false;
                for (let j = 0; j < shippingData.produtos.length; j++) {
                    const prod = shippingData.produtos[j];
                    if (prod.produtoEstoque && prod.baixarEstoque) {
                        try {
                            const exitResult = await onAddExit({
                                type: 'VENDA',
                                sku: prod.produtoEstoque.sku,
                                quantity: prod.quantidade,
                                client: shippingData.cliente,
                                nf: shippingData.nfNumero,
                                nfOrigem: (prod.nfOrigem && prod.nfOrigem !== 'Sem NF' && prod.nfOrigem !== 'SEM_NF')
                                    ? prod.nfOrigem : null,
                            });
                            if (exitResult?.id) {
                                produtosComExit[j] = { ...produtosComExit[j], exitId: exitResult.id, baixouEstoque: true };
                                temExit = true;
                            }
                        } catch (exitErr) {
                            console.error('Erro exit batch:', prod.produtoEstoque.sku, exitErr);
                            if (exitErr.message?.includes('Estoque insuficiente')) {
                                alert(`⚠️ ${exitErr.message}`);
                            }
                        }
                    }
                }
                if (temExit) {
                    try {
                        await onUpdate(shippingId, { produtos: produtosComExit });
                    } catch (updateErr) {
                        console.error('Erro ao atualizar JSONB batch:', updateErr);
                    }
                }
                // Auto-search ME for tracking
                if (shippingId && shippingData.nfNumero) {
                    tentarBuscarRastreioME(shippingId, shippingData.nfNumero, shippingData.cliente);
                }
            }
            return true;
        }

        // Single mode: set form data and switch to register view (existing behavior)
        setForm(prevForm => ({
            ...prevForm,
            nfNumero: data.nfNumero || '',
            cliente: data.cliente || '',
            destino: data.destino || '',
            produtos: data.produtos || [],
            codigoRastreio: '',
            linkRastreio: '',
            transportadora: data.transportadora || prevForm.transportadora || '',
            observacoes: data.observacoes || prevForm.observacoes || '',
            localOrigem: data.localOrigem || prevForm.localOrigem || '',
        }));
        setNfData({
            nfNumero: data.nfNumero || '',
            cliente: data.cliente || '',
            destino: data.destino || '',
            produtos: data.produtos || [],
        });
        setActiveView('register');
        return true;
    };

    // Callback para quando TinyNFeImport prepara dados para devolução
    const handlePrepareDevFromTiny = async (data, options = {}) => {
        const isBatch = options.batchMode === true;

        const shippingData = {
            nfNumero: data.nfNumero || '',
            cliente: data.cliente || '',
            destino: '',
            localOrigem: '',
            transportadora: '',
            codigoRastreio: '',
            linkRastreio: '',
            produtos: (data.produtos || []).map(p => ({
                ...p,
                baixarEstoque: false,
                baixouEstoque: false,
            })),
            observacoes: '',
            status: 'DESPACHADO',
            tipo: 'devolucao',
            motivoDevolucao: data.motivoDevolucao || '',
            hubDestino: data.hubDestino || locaisOrigem[0] || '',
            entradaCriada: false,
        };

        if (isBatch) {
            await onAdd(shippingData);
            return true;
        }

        // Single mode: save directly (no form step — devolução is simpler)
        try {
            await onAdd(shippingData);
            setSuccess('Devolução importada do Tiny com sucesso!');
            setActiveView('list');
            setTimeout(() => setSuccess(''), 3000);
            return true;
        } catch (err) {
            setError('Erro ao importar devolução: ' + err.message);
            return false;
        }
    };

    // Process pending dispatch data from SeparationManager
    useEffect(() => {
        if (pendingDispatchData) {
            handlePrepareShippingFromTiny(pendingDispatchData);
            if (onClearPendingDispatch) onClearPendingDispatch();
        }
    }, [pendingDispatchData]); // eslint-disable-line react-hooks/exhaustive-deps

    // === CRITICAL: handleSubmit — stock deduction logic ===
    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!form.nfNumero) {
            setError('Informe o número da NF');
            return;
        }

        try {
            const isLocal = form.transportadora === 'Entrega Local';
            const shippingData = {
                nfNumero: form.nfNumero,
                cliente: form.cliente,
                destino: form.destino,
                localOrigem: form.localOrigem,
                transportadora: form.transportadora,
                codigoRastreio: isLocal ? '' : form.codigoRastreio,
                linkRastreio: isLocal ? '' : form.linkRastreio,
                melhorEnvioId: isLocal ? '' : (form.melhorEnvioId || ''),
                hubTelefone: form.hubTelefone || '',
                produtos: form.produtos,
                observacoes: form.observacoes,
                status: 'DESPACHADO',
                entregaLocal: isLocal,
                recebedorNome: isLocal ? (form.recebedorNome || '') : '',
                comprovanteObs: isLocal ? (form.comprovanteObs || '') : '',
                comprovanteFotos: isLocal ? (form.comprovanteFotos || []) : [],
                dataEntrega: null,
            };

            const savedShipping = await onAdd(shippingData);
            const shippingId = savedShipping?.id || null;

            // Se marcado para baixar do estoque, registrar saídas
            if (form.baixarEstoque && shippingId) {
                const produtosComExit = [...shippingData.produtos];
                let temExit = false;
                for (let i = 0; i < form.produtos.length; i++) {
                    const prod = form.produtos[i];
                    if (prod.produtoEstoque && prod.baixarEstoque) {
                        try {
                            const exitResult = await onAddExit({
                                type: 'VENDA',
                                sku: prod.produtoEstoque.sku,
                                quantity: prod.quantidade,
                                client: form.cliente,
                                nf: form.nfNumero,
                                nfOrigem: prod.nfOrigem || null,
                            });
                            if (exitResult?.id) {
                                produtosComExit[i] = {
                                    ...produtosComExit[i],
                                    exitId: exitResult.id,
                                    baixouEstoque: true,
                                };
                                temExit = true;
                            }
                        } catch (exitErr) {
                            console.error('Erro exit:', prod.produtoEstoque.sku, exitErr);
                            if (exitErr.message?.includes('Estoque insuficiente')) {
                                alert(`⚠️ ${exitErr.message}`);
                            }
                        }
                    }
                }
                if (temExit) {
                    try {
                        await onUpdate(shippingId, { produtos: produtosComExit });
                    } catch (updateErr) {
                        console.error('Erro ao atualizar JSONB com exitId:', updateErr);
                    }
                }
            } else if (form.baixarEstoque) {
                // Fallback: shipping sem ID retornado — criar exits sem linkage
                for (const prod of form.produtos) {
                    if (prod.produtoEstoque && prod.baixarEstoque) {
                        try {
                            await onAddExit({
                                type: 'VENDA',
                                sku: prod.produtoEstoque.sku,
                                quantity: prod.quantidade,
                                client: form.cliente,
                                nf: form.nfNumero,
                                nfOrigem: prod.nfOrigem || null,
                            });
                        } catch (exitErr) {
                            console.error('Erro exit fallback:', prod.produtoEstoque.sku, exitErr);
                            if (exitErr.message?.includes('Estoque insuficiente')) {
                                alert(`⚠️ ${exitErr.message}`);
                            }
                        }
                    }
                }
            }

            // Auto-search ME for tracking if no tracking code was provided (skip for local delivery)
            if (!isLocal && !form.codigoRastreio && !form.melhorEnvioId && form.nfNumero && shippingId) {
                tentarBuscarRastreioME(shippingId, form.nfNumero, form.cliente);
            }

            setSuccess(isLocal ? 'Entrega local registrada! Aguardando comprovante do entregador.' : 'Despacho registrado com sucesso!');
            setForm({
                nfNumero: '', cliente: '', destino: '', localOrigem: locaisOrigem[0] || 'Loja Principal',
                transportadora: '', codigoRastreio: '', linkRastreio: '', melhorEnvioId: '',
                hubTelefone: '', baixarEstoque: false, produtos: [], observacoes: '',
                recebedorNome: '', comprovanteObs: '', comprovanteFotos: [],
            });
            setNfFile(null);
            setNfData(null);
            await onRefreshShippings?.();
            setActiveView('list');
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError('Erro ao registrar: ' + err.message);
        }
    };

    // === CRITICAL: salvarDespachosLote — batch stock deduction ===
    const salvarDespachosLote = async () => {
        const selecionados = batchDespachos.filter(d => d.selected && !d.error);

        if (selecionados.length === 0) {
            setError('Selecione ao menos um despacho para salvar');
            return;
        }

        setProcessingBatch(true);
        setBatchProgress({ current: 0, total: selecionados.length });

        let salvos = 0;
        let erros = 0;

        for (let i = 0; i < selecionados.length; i++) {
            const despacho = selecionados[i];
            setBatchProgress({ current: i + 1, total: selecionados.length });

            try {
                const savedShipping = await onAdd({
                    nfNumero: despacho.nfNumero,
                    cliente: despacho.cliente,
                    destino: despacho.destino,
                    localOrigem: despacho.localOrigem,
                    transportadora: despacho.transportadora,
                    codigoRastreio: despacho.codigoRastreio,
                    linkRastreio: despacho.linkRastreio,
                    melhorEnvioId: despacho.melhorEnvioId,
                    produtos: despacho.produtos,
                    observacoes: despacho.observacoes,
                    status: 'DESPACHADO'
                });
                salvos++;

                // Criar saídas de estoque para produtos vinculados
                const shippingId = savedShipping?.id || null;
                const produtosComExit = [...despacho.produtos];
                let temExit = false;
                for (let j = 0; j < despacho.produtos.length; j++) {
                    const prod = despacho.produtos[j];
                    if (prod.produtoEstoque && prod.baixarEstoque) {
                        try {
                            const exitResult = await onAddExit({
                                type: 'VENDA',
                                sku: prod.produtoEstoque.sku,
                                quantity: prod.quantidade,
                                client: despacho.cliente || '',
                                nf: despacho.nfNumero || '',
                                nfOrigem: (prod.nfOrigem && prod.nfOrigem !== 'Sem NF' && prod.nfOrigem !== 'SEM_NF')
                                    ? prod.nfOrigem : null,
                            });
                            if (exitResult?.id) {
                                produtosComExit[j] = {
                                    ...produtosComExit[j],
                                    exitId: exitResult.id,
                                    baixouEstoque: true,
                                };
                                temExit = true;
                            }
                        } catch (exitErr) {
                            console.error('Erro ao registrar saída de estoque:', prod.produtoEstoque.sku, exitErr);
                            if (exitErr.message?.includes('Estoque insuficiente')) {
                                alert(`⚠️ ${exitErr.message}`);
                            }
                        }
                    }
                }
                // Atualizar JSONB do shipping com exitIds
                if (temExit && shippingId) {
                    try {
                        await onUpdate(shippingId, { produtos: produtosComExit });
                    } catch (updateErr) {
                        console.error('Erro ao atualizar JSONB com exitId:', despacho.nfNumero, updateErr);
                    }
                }
            } catch (err) {
                console.error('Erro ao salvar:', despacho.nfNumero, err);
                erros++;
            }
        }

        setProcessingBatch(false);
        setBatchDespachos([]);
        setBatchFiles([]);
        setSuccess(`${salvos} despacho(s) registrado(s)${erros > 0 ? `, ${erros} erro(s)` : ''}!`);
        await onRefreshShippings?.();
        setActiveView('list');
        setTimeout(() => setSuccess(''), 5000);
    };

    return (
        <div>
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
                <div>
                    <h1 className="page-title">Expedição</h1>
                    <p className="page-subtitle">Gerencie despachos e devoluções</p>
                </div>
                {isStockAdmin && (
                    <button
                        onClick={() => setShowLocaisModal(true)}
                        title="Gerenciar HUBs (locais de origem)"
                        aria-label="Gerenciar HUBs"
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: '8px',
                            background: '#fff', border: '1px solid var(--border-color)',
                            borderRadius: '8px', padding: '8px 16px', cursor: 'pointer',
                            fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)',
                            flexShrink: 0,
                        }}
                    >
                        HUB <Icon name="settings" size={14} />
                    </button>
                )}
            </div>

            {success && <div className="alert alert-success">{success}</div>}
            {error && <div className="alert alert-danger">{error}</div>}

            {/* Card combinado: sub-abas principais (topo-esq) + divider + ações (base-dir) */}
            {(() => {
                const despachos = shippings.filter(s => !s.tipo || s.tipo === 'despacho');
                const devolucoes = shippings.filter(s => s.tipo === 'devolucao');
                return (
                    <div className="card" style={{ marginBottom: '16px', padding: 0, overflow: 'hidden' }}>
                        {/* Linha 1 — sub-abas ocupam 50% ESQUERDO; divisor horizontal cruza toda a largura */}
                        <div style={{
                            display: 'flex', width: '100%',
                            borderBottom: '1px solid var(--border)',
                        }}>
                            <div style={{ flex: '0 0 50%', display: 'flex', padding: '0 16px' }}>
                                <button
                                    className={`filter-tab ${tipoView === 'despacho' ? 'active' : ''}`}
                                    onClick={() => { setTipoView('despacho'); setActiveView('list'); }}
                                    style={{ flex: 1, textAlign: 'center', justifyContent: 'center', whiteSpace: 'nowrap' }}
                                >
                                    Despachos ({String(despachos.length).padStart(3, '0')})
                                </button>
                                <button
                                    className={`filter-tab ${tipoView === 'devolucao' ? 'active' : ''}`}
                                    onClick={() => { setTipoView('devolucao'); setActiveView('list'); }}
                                    style={{ flex: 1, textAlign: 'center', justifyContent: 'center', whiteSpace: 'nowrap' }}
                                >
                                    Devoluções ({String(devolucoes.length).padStart(2, '0')})
                                </button>
                                <button
                                    className={`filter-tab ${tipoView === 'analise' ? 'active' : ''}`}
                                    onClick={() => { setTipoView('analise'); setActiveView('list'); }}
                                    style={{ flex: 1, textAlign: 'center', justifyContent: 'center', whiteSpace: 'nowrap' }}
                                >
                                    Análise Logística
                                </button>
                            </div>
                            <div style={{ flex: '0 0 50%' }} />
                        </div>

                        {/* Linha 2 — ações ocupam 50% DIREITO */}
                        {tipoView !== 'analise' && isStockAdmin && (() => {
                            const baseStyle = (isActive) => ({
                                flex: 1,
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                background: 'transparent', border: 'none', cursor: 'pointer',
                                fontSize: '13px', fontWeight: isActive ? 600 : 500,
                                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                                padding: '10px 8px', whiteSpace: 'nowrap',
                            });
                            return (
                                <div style={{ display: 'flex', width: '100%' }}>
                                    <div style={{ flex: '0 0 50%' }} />
                                    <div style={{ flex: '0 0 50%', display: 'flex', padding: '0 16px' }}>
                                        {tipoView === 'despacho' ? (
                                            <>
                                                <button onClick={() => setActiveView('register')} style={baseStyle(activeView === 'register')}>
                                                    <Icon name="add" size={14} /> Novo
                                                </button>
                                                <button onClick={() => setActiveView('import')} style={baseStyle(activeView === 'import')}>
                                                    Importar NF
                                                </button>
                                                <button onClick={() => setActiveView('import-tiny')} style={baseStyle(activeView === 'import-tiny')}>
                                                    Importar NF (Tiny)
                                                </button>
                                                <button onClick={() => setActiveView('csv')} style={baseStyle(activeView === 'csv')}>
                                                    Importar CSV
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <button onClick={() => setActiveView('register-devolucao')} style={baseStyle(activeView === 'register-devolucao')}>
                                                    <Icon name="add" size={14} /> Nova Devolução
                                                </button>
                                                <button onClick={() => setActiveView('import-tiny-dev')} style={baseStyle(activeView === 'import-tiny-dev')}>
                                                    Importar NF (Tiny)
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                );
            })()}

            {/* Análise view — full replacement */}
            {tipoView === 'analise' && (
                <ShippingAnalytics shippings={shippings} />
            )}

            {/* Modal de Gestão de Locais */}
            {showLocaisModal && (
                <LocaisModal
                    locaisOrigem={locaisOrigem}
                    onUpdateLocais={onUpdateLocais}
                    onClose={() => setShowLocaisModal(false)}
                />
            )}

            {tipoView !== 'analise' && <>
            {/* Lista */}
            {activeView === 'list' && (
                <ShippingList
                    shippings={tipoView === 'devolucao'
                        ? shippings.filter(s => s.tipo === 'devolucao')
                        : shippings.filter(s => !s.tipo || s.tipo === 'despacho')
                    }
                    tipo={tipoView}
                    onUpdate={onUpdate}
                    onDelete={onDelete}
                    isStockAdmin={isStockAdmin}
                    isOperador={isOperador}
                    isEquipe={isEquipe}
                    onAddEntry={onAddEntry}
                    locaisOrigem={locaisOrigem}
                    statusList={statusList}
                    statusTransitions={STATUS_TRANSITIONS}
                    transportadoras={transportadoras}
                    onRefresh={onRefreshShippings}
                />
            )}

            {/* Importar NF */}
            {activeView === 'import' && (
                <div className="card">
                    <h2 className="card-title">
                        <Icon name="download" size={16} className="card-title-icon" />
                        Importar Nota Fiscal
                    </h2>

                    {/* Toggle modo de importação */}
                    <div className="filter-tabs" style={{marginBottom: '20px'}}>
                        <button
                            className={`filter-tab ${importMode === 'single' ? 'active' : ''}`}
                            onClick={() => { setImportMode('single'); setBatchDespachos([]); setBatchFiles([]); }}
                        >
                            Arquivo Único
                        </button>
                        <button
                            className={`filter-tab ${importMode === 'batch' ? 'active' : ''}`}
                            onClick={() => { setImportMode('batch'); setNfFile(null); setNfData(null); }}
                        >
                            Importação em Lote
                        </button>
                    </div>

                    {/* Modo arquivo único */}
                    {importMode === 'single' && (
                        <ShippingXMLImport
                            stock={stock}
                            nfFile={nfFile}
                            setNfFile={setNfFile}
                            onSetForm={setForm}
                            onSetNfData={setNfData}
                            onSetActiveView={setActiveView}
                            onSetSuccess={setSuccess}
                            onSetError={setError}
                            locaisOrigem={locaisOrigem}
                        />
                    )}

                    {/* Modo importação em lote */}
                    {importMode === 'batch' && (
                        <ShippingBatchImport
                            stock={stock}
                            locaisOrigem={locaisOrigem}
                            transportadoras={transportadoras}
                            batchDespachos={batchDespachos}
                            setBatchDespachos={setBatchDespachos}
                            batchFiles={batchFiles}
                            setBatchFiles={setBatchFiles}
                            processingBatch={processingBatch}
                            setProcessingBatch={setProcessingBatch}
                            batchProgress={batchProgress}
                            setBatchProgress={setBatchProgress}
                            onSalvarLote={salvarDespachosLote}
                            onSetSuccess={setSuccess}
                            onSetError={setError}
                        />
                    )}
                </div>
            )}

            {/* Importar do Tiny */}
            {activeView === 'import-tiny' && (
                <TinyNFeImport
                    products={products || []}
                    onSubmitEntry={onAddEntry}
                    onSubmitExit={onAddExit}
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
                    onPrepareShipping={handlePrepareShippingFromTiny}
                    transportadoras={transportadoras}
                />
            )}

            {/* Importar do Tiny — Devoluções */}
            {activeView === 'import-tiny-dev' && (
                <TinyNFeImport
                    products={products || []}
                    onSubmitEntry={onAddEntry}
                    onSubmitExit={onAddExit}
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
                    onPrepareShipping={handlePrepareDevFromTiny}
                    isDevolucao
                />
            )}

            {/* Importar CSV */}
            {activeView === 'csv' && (
                <CSVImportTab
                    type="shipping"
                    products={products}
                    onImportShipping={onAdd}
                    locaisOrigem={locaisOrigem}
                    onUpdateLocais={onUpdateLocais}
                />
            )}

            {/* Registrar Devolução */}
            {activeView === 'register-devolucao' && (
                <DevolucaoForm
                    locaisOrigem={locaisOrigem}
                    transportadoras={transportadoras}
                    products={products}
                    stock={stock}
                    onAdd={onAdd}
                    onCancel={() => setActiveView('list')}
                    onSuccess={(msg) => {
                        setSuccess(msg);
                        setActiveView('list');
                        setTimeout(() => setSuccess(''), 3000);
                    }}
                    onError={setError}
                    onUpdateProduct={onUpdateProduct}
                />
            )}

            {/* Registrar Despacho */}
            {activeView === 'register' && (
                <ShippingForm
                    form={form}
                    setForm={setForm}
                    nfData={nfData}
                    setNfData={setNfData}
                    nfFile={nfFile}
                    setNfFile={setNfFile}
                    stock={stock}
                    products={products}
                    entries={entries}
                    exits={exits}
                    locaisOrigem={locaisOrigem}
                    categories={categories}
                    transportadoras={transportadoras}
                    onAddProduct={onAddProduct}
                    onAddCategory={onAddCategory}
                    onUpdateCategory={onUpdateCategory}
                    onDeleteCategory={onDeleteCategory}
                    onSubmit={handleSubmit}
                    onCancel={() => {
                        setActiveView('list');
                        setNfFile(null);
                        setNfData(null);
                    }}
                    gerarLinkRastreio={gerarLinkRastreio}
                />
            )}
            </>}
        </div>
    );
}
