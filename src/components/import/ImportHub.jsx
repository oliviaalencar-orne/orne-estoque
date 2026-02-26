/**
 * ImportHub.jsx — Import tab hub (Tiny, NF-e XML, NF-e Batch, Excel/CSV)
 *
 * Extracted from index-legacy.html L8465-8513
 */
import React, { useState } from 'react';
import TinyNFeImport from '@/components/import/TinyNFeImport';
import ImportNFe from '@/components/import/ImportNFe';
import ImportNFeBatch from '@/components/import/ImportNFeBatch';
import ImportExcel from '@/components/import/ImportExcel';

export default function ImportHub({ products, onImport, onAddProduct, categories, locaisOrigem, onUpdateLocais, entries, exits, stock, onAddEntry, onAddExit }) {
    const [activeImport, setActiveImport] = useState('nfe');

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">Importar</h1>
                <p className="page-subtitle">Importe dados de NF-e, Excel ou CSV</p>
            </div>

            <div className="card">
                <div className="filter-tabs">
                    <button className={`filter-tab ${activeImport === 'tiny' ? 'active' : ''}`} onClick={() => setActiveImport('tiny')}>
                        Tiny ERP
                    </button>
                    <button className={`filter-tab ${activeImport === 'nfe' ? 'active' : ''}`} onClick={() => setActiveImport('nfe')}>
                        NF-e XML
                    </button>
                    <button className={`filter-tab ${activeImport === 'nfe-batch' ? 'active' : ''}`} onClick={() => setActiveImport('nfe-batch')}>
                        NF-e em Lote
                    </button>
                    <button className={`filter-tab ${activeImport === 'excel' ? 'active' : ''}`} onClick={() => setActiveImport('excel')}>
                        Excel/CSV
                    </button>
                </div>
            </div>

            {activeImport === 'tiny' && (
                <TinyNFeImport
                    products={products}
                    onSubmitEntry={onAddEntry}
                    onSubmitExit={onAddExit}
                    onAddProduct={onAddProduct}
                    categories={categories}
                    locaisOrigem={locaisOrigem}
                    onUpdateLocais={onUpdateLocais}
                    entries={entries || []}
                    exits={exits || []}
                    stock={stock || []}
                    mode="entry"
                />
            )}
            {activeImport === 'nfe' && <ImportNFe products={products} onImport={onImport} onAddProduct={onAddProduct} categories={categories} locaisOrigem={locaisOrigem} onUpdateLocais={onUpdateLocais} />}
            {activeImport === 'nfe-batch' && <ImportNFeBatch products={products} onImport={onImport} onAddProduct={onAddProduct} categories={categories} locaisOrigem={locaisOrigem} onUpdateLocais={onUpdateLocais} />}
            {activeImport === 'excel' && <ImportExcel products={products} onImport={onImport} locaisOrigem={locaisOrigem} onUpdateLocais={onUpdateLocais} />}
        </div>
    );
}
