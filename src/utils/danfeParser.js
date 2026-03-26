/**
 * danfeParser.js — Parse NF-e XML (SEFAZ 4.0) into structured data for DANFE generation
 */

export function parseNFeXML(xmlString) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'text/xml');

    const getText = (tag, ctx) => {
        const el = (ctx || doc).getElementsByTagName(tag);
        return el?.[0]?.textContent || '';
    };

    const getAll = (tag) => [...doc.getElementsByTagName(tag)];

    // Emitente — inside <emit>
    const emit = doc.querySelector('emit');
    const enderEmit = doc.querySelector('emit enderEmit');

    // Destinatário — inside <dest>
    const dest = doc.querySelector('dest');
    const enderDest = doc.querySelector('dest enderDest');

    // Totais — inside <ICMSTot>
    const totais = doc.querySelector('ICMSTot');

    // Transporte
    const transp = doc.querySelector('transp');
    const vol = doc.querySelector('transp vol');

    // Protocolo
    const protNFe = doc.querySelector('protNFe infProt');

    return {
        // Identificação
        numero: getText('nNF'),
        serie: getText('serie'),
        chaveAcesso: protNFe ? getText('chNFe', protNFe) : getText('chNFe'),
        dataEmissao: getText('dhEmi'),
        naturezaOp: getText('natOp'),

        // Emitente
        emitente: {
            nome: emit ? getText('xNome', emit) : '',
            fantasia: emit ? getText('xFant', emit) : '',
            cnpj: emit ? getText('CNPJ', emit) : '',
            ie: emit ? getText('IE', emit) : '',
            endereco: enderEmit ? getText('xLgr', enderEmit) : '',
            numero: enderEmit ? getText('nro', enderEmit) : '',
            complemento: enderEmit ? getText('xCpl', enderEmit) : '',
            bairro: enderEmit ? getText('xBairro', enderEmit) : '',
            municipio: enderEmit ? getText('xMun', enderEmit) : '',
            uf: enderEmit ? getText('UF', enderEmit) : '',
            cep: enderEmit ? getText('CEP', enderEmit) : '',
            fone: enderEmit ? getText('fone', enderEmit) : '',
        },

        // Destinatário
        destinatario: {
            nome: dest ? getText('xNome', dest) : '',
            cpfCnpj: dest
                ? (getText('CPF', dest) || getText('CNPJ', dest))
                : '',
            endereco: enderDest ? getText('xLgr', enderDest) : '',
            numero: enderDest ? getText('nro', enderDest) : '',
            complemento: enderDest ? getText('xCpl', enderDest) : '',
            bairro: enderDest ? getText('xBairro', enderDest) : '',
            municipio: enderDest ? getText('xMun', enderDest) : '',
            uf: enderDest ? getText('UF', enderDest) : '',
            cep: enderDest ? getText('CEP', enderDest) : '',
            fone: dest ? getText('fone', dest) : '',
            email: dest ? getText('email', dest) : '',
        },

        // Produtos
        produtos: getAll('det').map((det) => ({
            item: det.getAttribute('nItem') || '',
            codigo: det.querySelector('cProd')?.textContent || '',
            descricao: det.querySelector('xProd')?.textContent || '',
            ncm: det.querySelector('NCM')?.textContent || '',
            cfop: det.querySelector('CFOP')?.textContent || '',
            unidade: det.querySelector('uCom')?.textContent || '',
            quantidade: parseFloat(det.querySelector('qCom')?.textContent || '0'),
            valorUnitario: parseFloat(det.querySelector('vUnCom')?.textContent || '0'),
            valorTotal: parseFloat(det.querySelector('vProd')?.textContent || '0'),
        })),

        // Totais
        totais: {
            valorProdutos: parseFloat(totais ? getText('vProd', totais) : '0'),
            valorFrete: parseFloat(totais ? getText('vFrete', totais) : '0'),
            valorSeguro: parseFloat(totais ? getText('vSeg', totais) : '0'),
            valorDesconto: parseFloat(totais ? getText('vDesc', totais) : '0'),
            valorOutras: parseFloat(totais ? getText('vOutro', totais) : '0'),
            valorNF: parseFloat(totais ? getText('vNF', totais) : '0'),
            valorICMS: parseFloat(totais ? getText('vICMS', totais) : '0'),
            valorIPI: parseFloat(totais ? getText('vIPI', totais) : '0'),
        },

        // Transporte
        transporte: {
            modalidade: transp ? getText('modFrete', transp) : '',
            volumes: vol ? getText('qVol', vol) : '',
            especie: vol ? getText('esp', vol) : '',
            pesoLiquido: vol ? getText('pesoL', vol) : '',
            pesoBruto: vol ? getText('pesoB', vol) : '',
        },

        // Protocolo de autorização
        protocolo: {
            numero: protNFe ? getText('nProt', protNFe) : '',
            dataAutorizacao: protNFe ? getText('dhRecbto', protNFe) : '',
            status: protNFe ? getText('cStat', protNFe) : '',
            motivo: protNFe ? getText('xMotivo', protNFe) : '',
        },

        // Info adicional
        infoAdicional: getText('infCpl'),
    };
}
