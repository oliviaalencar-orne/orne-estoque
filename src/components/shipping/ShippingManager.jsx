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
import { buscarRastreioPorNF } from '@/services/trackingService';

// Constantes
const transportadoras = ['Melhor Envio', 'Correios', 'Jadlog', 'Total Express', 'Braspress', 'TNT', 'Azul Cargo', 'Loggi', 'Outro'];

export const statusList = {
    'DESPACHADO':          { label: 'Despachado',             color: '#d97706', textColor: '#92400E', bg: '#FEF3C7' },
    'EM_TRANSITO':         { label: 'Em Trânsito',            color: '#3b82f6', textColor: '#1E40AF', bg: '#DBEAFE' },
    'SAIU_ENTREGA':        { label: 'Saiu p/ Entrega',        color: '#7c3aed', textColor: '#5B21B6', bg: '#EDE9FE' },
    'TENTATIVA_ENTREGA':   { label: 'Tentativa de Entrega',   color: '#ea580c', textColor: '#9A3412', bg: '#FFF7ED' },
    'ENTREGUE':            { label: 'Entregue',               color: '#10b981', textColor: '#065F46', bg: '#D1FAE5' },
    'DEVOLVIDO':           { label: 'Devolvido',              color: '#ef4444', textColor: '#991B1B', bg: '#FEE2E2' },
};

export const STATUS_TRANSITIONS = {
    'DESPACHADO':          ['EM_TRANSITO', 'ENTREGUE', 'DEVOLVIDO'],
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
    pendingDispatchData, onClearPendingDispatch, onRefreshShippings
}) {
    const [activeView, setActiveView] = useState('list');
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
        baixarEstoque: true,
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
                    console.log(`[auto-ME] NF ${nfNumero}: encontrado rastreio ${result.codigo_rastreio} (${result.transportadora})`);
                }
            } else {
                console.log(`[auto-ME] NF ${nfNumero}: não encontrado no ME`);
            }
        }).catch(err => {
            console.log(`[auto-ME] NF ${nfNumero}: erro ${err.message}`);
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
                localOrigem: locaisOrigem[0] || 'Loja Principal',
                transportadora: '',
                codigoRastreio: '',
                linkRastreio: '',
                melhorEnvioId: '',
                hubTelefone: '',
                produtos: data.produtos || [],
                observacoes: '',
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
                status: isLocal ? 'ENTREGUE' : 'DESPACHADO',
                entregaLocal: isLocal,
                recebedorNome: isLocal ? (form.recebedorNome || '') : '',
                comprovanteObs: isLocal ? (form.comprovanteObs || '') : '',
                comprovanteFotos: isLocal ? (form.comprovanteFotos || []) : [],
                dataEntrega: isLocal ? new Date().toISOString() : null,
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
                        await onAddExit({
                            type: 'VENDA',
                            sku: prod.produtoEstoque.sku,
                            quantity: prod.quantidade,
                            client: form.cliente,
                            nf: form.nfNumero,
                            nfOrigem: prod.nfOrigem || null,
                        });
                    }
                }
            }

            // Auto-search ME for tracking if no tracking code was provided (skip for local delivery)
            if (!isLocal && !form.codigoRastreio && !form.melhorEnvioId && form.nfNumero && shippingId) {
                tentarBuscarRastreioME(shippingId, form.nfNumero, form.cliente);
            }

            setSuccess(isLocal ? 'Entrega local registrada como ENTREGUE!' : 'Despacho registrado com sucesso!');
            setForm({
                nfNumero: '', cliente: '', destino: '', localOrigem: locaisOrigem[0] || 'Loja Principal',
                transportadora: '', codigoRastreio: '', linkRastreio: '', melhorEnvioId: '',
                hubTelefone: '', baixarEstoque: true, produtos: [], observacoes: '',
                recebedorNome: '', comprovanteObs: '', comprovanteFotos: [],
            });
            setNfFile(null);
            setNfData(null);
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
        setActiveView('list');
        setTimeout(() => setSuccess(''), 5000);
    };

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">Despachos</h1>
                <p className="page-subtitle">Gerencie o envio de notas fiscais</p>
            </div>

            {success && <div className="alert alert-success">{success}</div>}
            {error && <div className="alert alert-danger">{error}</div>}

            {/* Modal de Gestão de Locais */}
            {showLocaisModal && (
                <LocaisModal
                    locaisOrigem={locaisOrigem}
                    onUpdateLocais={onUpdateLocais}
                    onClose={() => setShowLocaisModal(false)}
                />
            )}

            {/* Tabs */}
            <div className="card" style={{marginBottom: '16px'}}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px'}}>
                    <div className="filter-tabs">
                        <button
                            className={`filter-tab ${activeView === 'list' ? 'active' : ''}`}
                            onClick={() => setActiveView('list')}
                        >
                            Lista ({shippings.length})
                        </button>
                        {isStockAdmin && (<button
                            className={`filter-tab ${activeView === 'register' ? 'active' : ''}`}
                            onClick={() => setActiveView('register')}
                        >
                            Novo
                        </button>)}
                        {isStockAdmin && (<button
                            className={`filter-tab ${activeView === 'import' ? 'active' : ''}`}
                            onClick={() => setActiveView('import')}
                        >
                            Importar NF
                        </button>)}
                        {isStockAdmin && (<button
                            className={`filter-tab ${activeView === 'import-tiny' ? 'active' : ''}`}
                            onClick={() => setActiveView('import-tiny')}
                        >
                            Importar Tiny
                        </button>)}
                        {isStockAdmin && (<button
                            className={`filter-tab ${activeView === 'csv' ? 'active' : ''}`}
                            onClick={() => setActiveView('csv')}
                        >
                            Importar CSV
                        </button>)}
                    </div>
                    <button
                        className="btn btn-secondary"
                        onClick={() => setShowLocaisModal(true)}
                        title="Configurar locais de origem"
                        style={{display: 'flex', alignItems: 'center', gap: '6px'}}
                    >
                        <Icon name="settings" size={14} />
                        <span>Locais de Origem</span>
                    </button>
                </div>
            </div>

            {/* Lista de Despachos */}
            {activeView === 'list' && (
                <ShippingList
                    shippings={shippings}
                    onUpdate={onUpdate}
                    onDelete={onDelete}
                    isStockAdmin={isStockAdmin}
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
        </div>
    );
}
