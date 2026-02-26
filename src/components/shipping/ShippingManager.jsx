/**
 * ShippingManager.jsx — Orchestrator for shipping management
 *
 * Extracted from index-legacy.html L6111-8461
 * CRITICAL: handleSubmit, salvarDespachosLote, handlePrepareShippingFromTiny
 * MUST stay here because they use onAdd, onAddExit, onUpdate for stock deduction.
 */
import React, { useState } from 'react';
import { Icon } from '@/utils/icons';
import { LocaisModal } from '@/components/ui/LocaisModal';
import TinyNFeImport from '@/components/import/TinyNFeImport';
import CSVImportTab from '@/components/import/CSVImportTab';
import ShippingList from './ShippingList';
import ShippingForm from './ShippingForm';
import ShippingXMLImport from './ShippingXMLImport';
import ShippingBatchImport from './ShippingBatchImport';

// Constantes
const transportadoras = ['Melhor Envio', 'Correios', 'Jadlog', 'Total Express', 'Braspress', 'TNT', 'Azul Cargo', 'Loggi', 'Outro'];

const statusList = {
    'PENDENTE': { label: 'Pendente', color: '#f59e0b', bg: '#fef3c7' },
    'DESPACHADO': { label: 'Despachado', color: '#3b82f6', bg: '#dbeafe' },
    'EM_TRANSITO': { label: 'Em Trânsito', color: '#8b5cf6', bg: '#ede9fe' },
    'ENTREGUE': { label: 'Entregue', color: '#10b981', bg: '#d1fae5' },
    'DEVOLVIDO': { label: 'Devolvido', color: '#ef4444', bg: '#fee2e2' },
    'NAO_ENTREGUE': { label: 'Não Entregue', color: '#ef4444', bg: '#fee2e2' },
    'CANCELADO': { label: 'Cancelado', color: '#6b7280', bg: '#f3f4f6' }
};

export default function ShippingManager({
    shippings, onAdd, onUpdate, onDelete, stock, products,
    onAddExit, onAddEntry, locaisOrigem, onUpdateLocais, onAddProduct,
    categories, entries, exits, isStockAdmin,
    onAddCategory, onUpdateCategory, onDeleteCategory
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
        baixarEstoque: true,
        produtos: [],
        observacoes: ''
    });

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
    const handlePrepareShippingFromTiny = (data) => {
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
    };

    // === CRITICAL: handleSubmit — stock deduction logic ===
    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!form.nfNumero) {
            setError('Informe o número da NF');
            return;
        }

        try {
            const shippingData = {
                nfNumero: form.nfNumero,
                cliente: form.cliente,
                destino: form.destino,
                localOrigem: form.localOrigem,
                transportadora: form.transportadora,
                codigoRastreio: form.codigoRastreio,
                linkRastreio: form.linkRastreio,
                melhorEnvioId: form.melhorEnvioId || '',
                produtos: form.produtos,
                observacoes: form.observacoes,
                status: 'PENDENTE'
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

            setSuccess('Despacho registrado com sucesso!');
            setForm({
                nfNumero: '', cliente: '', destino: '', localOrigem: locaisOrigem[0] || 'Loja Principal',
                transportadora: '', codigoRastreio: '', linkRastreio: '', melhorEnvioId: '',
                baixarEstoque: true, produtos: [], observacoes: ''
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
                    status: 'PENDENTE'
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
                    transportadoras={transportadoras}
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
