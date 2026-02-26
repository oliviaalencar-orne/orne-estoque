/**
 * ShippingXMLImport.jsx — Single XML/PDF file import for shipping
 *
 * Extracted from ShippingManager (index-legacy.html L6627-7025)
 * Handles parsing of XML and PDF files to extract NF-e data
 */
import React from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { Icon } from '@/utils/icons';

/**
 * Helper to extract text from XML (handles namespaces)
 */
export const getXmlText = (xml, selectors) => {
    for (const selector of selectors) {
        // Tentar query direto
        let el = xml.querySelector(selector);
        if (el?.textContent) return el.textContent;

        // Tentar com getElementsByTagName (ignora namespace)
        const tagName = selector.split(' > ').pop();
        const elements = xml.getElementsByTagName(tagName);
        if (elements.length > 0 && elements[0].textContent) {
            return elements[0].textContent;
        }
    }
    return '';
};

/**
 * Parse a single XML NF-e file and return structured data.
 * Used by both single import and batch import.
 */
export const processarXML = (file, stock, locaisOrigem) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const parser = new DOMParser();
                const xmlText = event.target.result;
                const xml = parser.parseFromString(xmlText, 'text/xml');

                const parseError = xml.querySelector('parsererror');
                if (parseError) {
                    reject(new Error('Erro ao ler XML'));
                    return;
                }

                const nNF = getXmlText(xml, ['nNF', 'ide nNF', 'infNFe ide nNF']) ||
                           getXmlText(xml, ['infProt nProt']) || '';
                const xNome = getXmlText(xml, ['dest xNome', 'xNome']);
                const xLgr = getXmlText(xml, ['dest enderDest xLgr', 'enderDest xLgr', 'xLgr']);
                const nro = getXmlText(xml, ['dest enderDest nro', 'enderDest nro', 'nro']);
                const xBairro = getXmlText(xml, ['dest enderDest xBairro', 'enderDest xBairro', 'xBairro']);
                const xMun = getXmlText(xml, ['dest enderDest xMun', 'enderDest xMun', 'xMun']);
                const UF = getXmlText(xml, ['dest enderDest UF', 'enderDest UF']);
                const CEP = getXmlText(xml, ['dest enderDest CEP', 'enderDest CEP', 'CEP']);

                let destino = '';
                if (xLgr) destino += xLgr;
                if (nro) destino += `, ${nro}`;
                if (xBairro) destino += ` - ${xBairro}`;
                if (xMun) destino += ` - ${xMun}`;
                if (UF) destino += `/${UF}`;
                if (CEP) destino += ` - CEP: ${CEP}`;

                const dets = xml.getElementsByTagName('det');
                const produtos = [];

                for (let i = 0; i < dets.length; i++) {
                    const det = dets[i];
                    const prod = det.getElementsByTagName('prod')[0];
                    if (prod) {
                        const cProd = prod.getElementsByTagName('cProd')[0]?.textContent || '';
                        const xProd = prod.getElementsByTagName('xProd')[0]?.textContent || '';
                        const qCom = prod.getElementsByTagName('qCom')[0]?.textContent || '1';
                        const cEAN = prod.getElementsByTagName('cEAN')[0]?.textContent || '';

                        const skuNF = cProd.trim();
                        const skuNormalizado = skuNF.toLowerCase().replace(/[^a-z0-9]/g, '');
                        const eanNormalizado = (cEAN && cEAN !== 'SEM GTIN') ? cEAN.trim().replace(/[^0-9]/g, '') : '';

                        const produtoEncontrado = stock.find(p => {
                            const pSku = (p.sku || '').trim();
                            const pSkuNorm = pSku.toLowerCase().replace(/[^a-z0-9]/g, '');
                            const pEan = (p.ean || '').trim().replace(/[^0-9]/g, '');

                            if (pSku.toLowerCase() === skuNF.toLowerCase()) return true;
                            if (pSkuNorm && skuNormalizado && pSkuNorm === skuNormalizado) return true;
                            if (pEan && eanNormalizado && pEan === eanNormalizado) return true;
                            if (pSkuNorm.length >= 5 && skuNormalizado.length >= 5) {
                                if (pSkuNorm.includes(skuNormalizado) || skuNormalizado.includes(pSkuNorm)) return true;
                            }
                            return false;
                        });

                        produtos.push({
                            sku: cProd,
                            nome: xProd,
                            quantidade: parseInt(parseFloat(qCom)) || 1,
                            ean: eanNormalizado,
                            baixarEstoque: !!produtoEncontrado,
                            produtoEstoque: produtoEncontrado || null,
                            autoVinculado: !!produtoEncontrado
                        });
                    }
                }

                resolve({
                    fileName: file.name,
                    nfNumero: nNF,
                    cliente: xNome,
                    destino: destino,
                    produtos: produtos,
                    localOrigem: locaisOrigem[0] || 'Loja Principal',
                    transportadora: '',
                    codigoRastreio: '',
                    linkRastreio: '',
                    melhorEnvioId: '',
                    observacoes: '',
                    status: 'PENDENTE',
                    selected: true,
                    vinculados: produtos.filter(p => p.autoVinculado).length,
                    total: produtos.length
                });
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
        reader.readAsText(file, 'UTF-8');
    });
};

export default function ShippingXMLImport({ stock, nfFile, setNfFile, onSetForm, onSetNfData, onSetActiveView, onSetSuccess, onSetError, locaisOrigem }) {

    // Importar NF (PDF ou XML)
    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setNfFile(file);
        onSetError('');
        const fileName = file.name.toLowerCase();

        if (fileName.endsWith('.xml')) {
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const parser = new DOMParser();
                    const xmlText = event.target.result;
                    const xml = parser.parseFromString(xmlText, 'text/xml');

                    const parseError = xml.querySelector('parsererror');
                    if (parseError) {
                        onSetError('Erro ao ler XML. Verifique se o arquivo está correto.');
                        return;
                    }

                    const nNF = getXmlText(xml, ['nNF', 'ide nNF', 'infNFe ide nNF']) ||
                               getXmlText(xml, ['infProt nProt']) || '';

                    const xNome = getXmlText(xml, ['dest xNome', 'xNome']);
                    const xLgr = getXmlText(xml, ['dest enderDest xLgr', 'enderDest xLgr', 'xLgr']);
                    const nro = getXmlText(xml, ['dest enderDest nro', 'enderDest nro', 'nro']);
                    const xBairro = getXmlText(xml, ['dest enderDest xBairro', 'enderDest xBairro', 'xBairro']);
                    const xMun = getXmlText(xml, ['dest enderDest xMun', 'enderDest xMun', 'xMun']);
                    const UF = getXmlText(xml, ['dest enderDest UF', 'enderDest UF']);
                    const CEP = getXmlText(xml, ['dest enderDest CEP', 'enderDest CEP', 'CEP']);

                    let destino = '';
                    if (xLgr) destino += xLgr;
                    if (nro) destino += `, ${nro}`;
                    if (xBairro) destino += ` - ${xBairro}`;
                    if (xMun) destino += ` - ${xMun}`;
                    if (UF) destino += `/${UF}`;
                    if (CEP) destino += ` - CEP: ${CEP}`;

                    const dets = xml.getElementsByTagName('det');
                    const produtos = [];

                    for (let i = 0; i < dets.length; i++) {
                        const det = dets[i];
                        const prod = det.getElementsByTagName('prod')[0];
                        if (prod) {
                            const cProd = prod.getElementsByTagName('cProd')[0]?.textContent || '';
                            const xProd = prod.getElementsByTagName('xProd')[0]?.textContent || '';
                            const qCom = prod.getElementsByTagName('qCom')[0]?.textContent || '1';
                            const cEAN = prod.getElementsByTagName('cEAN')[0]?.textContent || '';

                            const skuNF = cProd.trim();
                            const skuNormalizado = skuNF.toLowerCase().replace(/[^a-z0-9]/g, '');
                            const eanNormalizado = (cEAN && cEAN !== 'SEM GTIN') ? cEAN.trim().replace(/[^0-9]/g, '') : '';
                            const nomeNormalizado = xProd.trim().toLowerCase();

                            console.log('Buscando produto:', { skuNF, skuNormalizado, eanNormalizado, nomeNormalizado });
                            console.log('Produtos no estoque:', stock.map(p => ({ sku: p.sku, name: p.name })));

                            const produtoEncontrado = stock.find(p => {
                                const pSku = (p.sku || '').trim();
                                const pSkuNorm = pSku.toLowerCase().replace(/[^a-z0-9]/g, '');
                                const pEan = (p.ean || '').trim().replace(/[^0-9]/g, '');
                                const pNome = (p.name || '').trim().toLowerCase();

                                if (pSku.toLowerCase() === skuNF.toLowerCase()) {
                                    console.log('Match exato SKU:', pSku, '=', skuNF);
                                    return true;
                                }
                                if (pSkuNorm && skuNormalizado && pSkuNorm === skuNormalizado) {
                                    console.log('Match normalizado SKU:', pSkuNorm, '=', skuNormalizado);
                                    return true;
                                }
                                if (pEan && eanNormalizado && pEan === eanNormalizado) {
                                    console.log('Match EAN:', pEan, '=', eanNormalizado);
                                    return true;
                                }
                                if (pSkuNorm.length >= 5 && skuNormalizado.length >= 5) {
                                    if (pSkuNorm.includes(skuNormalizado) || skuNormalizado.includes(pSkuNorm)) {
                                        console.log('Match parcial SKU:', pSkuNorm, 'contém/está em', skuNormalizado);
                                        return true;
                                    }
                                }
                                return false;
                            });

                            if (produtoEncontrado) {
                                console.log('OK: Produto encontrado:', produtoEncontrado.name);
                            } else {
                                console.log('ERRO: Produto NÃO encontrado para SKU:', skuNF);
                            }

                            produtos.push({
                                sku: cProd,
                                nome: xProd,
                                quantidade: parseInt(parseFloat(qCom)) || 1,
                                ean: eanNormalizado,
                                baixarEstoque: !!produtoEncontrado,
                                produtoEstoque: produtoEncontrado || null,
                                autoVinculado: !!produtoEncontrado
                            });
                        }
                    }

                    const vinculados = produtos.filter(p => p.autoVinculado).length;
                    const naoVinculados = produtos.length - vinculados;

                    console.log('NF Importada:', { nNF, xNome, destino, produtos });

                    onSetForm(prevForm => ({
                        ...prevForm,
                        nfNumero: nNF,
                        cliente: xNome,
                        destino: destino,
                        produtos: produtos,
                        codigoRastreio: '',
                        linkRastreio: ''
                    }));

                    onSetNfData({
                        nfNumero: nNF,
                        cliente: xNome,
                        destino: destino,
                        produtos: produtos
                    });

                    let msg = `NF ${nNF} importada! ${produtos.length} produto(s).`;
                    if (vinculados > 0) msg += ` ${vinculados} vinculado(s) automaticamente.`;
                    if (naoVinculados > 0) msg += ` ${naoVinculados} não encontrado(s) no estoque.`;
                    onSetSuccess(msg);
                    onSetActiveView('register');
                    setTimeout(() => onSetSuccess(''), 8000);

                } catch (err) {
                    console.error('Erro ao processar XML:', err);
                    onSetError('Erro ao processar XML: ' + err.message);
                }
            };
            reader.readAsText(file, 'UTF-8');
        } else if (fileName.endsWith('.pdf')) {
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    onSetSuccess('Processando PDF...');

                    const typedArray = new Uint8Array(event.target.result);
                    const pdf = await pdfjsLib.getDocument(typedArray).promise;

                    let fullText = '';

                    for (let i = 1; i <= pdf.numPages; i++) {
                        const page = await pdf.getPage(i);
                        const textContent = await page.getTextContent();
                        const pageText = textContent.items.map(item => item.str).join(' ');
                        fullText += pageText + '\n';
                    }

                    console.log('Texto extraído do PDF:', fullText);

                    // ========== NÚMERO DA NF ==========
                    let nNF = '';
                    const nfPatterns = [
                        /N[ºo°]\s*(\d{3}\.\d{3}|\d{6})/i,
                        /NF-?e?\s*N[ºo°]?\s*(\d{3}\.\d{3}|\d{6})/i,
                        /Nº\s*(\d{3}\.\d{3})/,
                        /(\d{3}\.\d{3})\s*S[ée]rie/i,
                        /FOLHA.*?(\d{3}\.\d{3})/i
                    ];
                    for (const pattern of nfPatterns) {
                        const match = fullText.match(pattern);
                        if (match) {
                            nNF = match[1].replace(/\./g, '');
                            break;
                        }
                    }

                    // ========== NOME DO DESTINATÁRIO ==========
                    let xNome = '';
                    const nomePatterns = [
                        /NOME\s*\/?\s*RAZ[ÃA]O\s*SOCIAL\s+([A-Za-záéíóúâêôãõçÁÉÍÓÚÂÊÔÃÕÇ\s]+?)(?=\s*(?:CNP[JF]|CPF|CNPJ\/CPF|DATA|ENDERE))/i,
                        /DESTINAT[ÁA]RIO\s*\/?\s*REMETENTE\s+NOME\s*\/?\s*RAZ[ÃA]O\s*SOCIAL\s+([A-Za-záéíóúâêôãõçÁÉÍÓÚÂÊÔÃÕÇ\s]+)/i,
                        /RAZ[ÃA]O\s*SOCIAL\s+([A-Za-záéíóúâêôãõçÁÉÍÓÚÂÊÔÃÕÇ\s]{5,50})/i
                    ];
                    for (const pattern of nomePatterns) {
                        const match = fullText.match(pattern);
                        if (match) {
                            xNome = match[1].trim().replace(/\s+/g, ' ');
                            break;
                        }
                    }

                    // ========== ENDEREÇO ==========
                    let destino = '';
                    const endMatch = fullText.match(/ENDERE[ÇC]O\s+([^]+?)(?=BAIRRO|MUNIC[ÍI]PIO|CEP|\d{2}\.\d{3}-?\d{3})/i);
                    if (endMatch) {
                        destino = endMatch[1].trim().replace(/\s+/g, ' ').substring(0, 100);
                    }

                    const bairroMatch = fullText.match(/BAIRRO\s+([A-Za-záéíóúâêôãõçÁÉÍÓÚÂÊÔÃÕÇ\s]+?)(?=\s*(?:CEP|FONE|MUNIC))/i);
                    if (bairroMatch) {
                        destino += ` - ${bairroMatch[1].trim()}`;
                    }

                    const munMatch = fullText.match(/MUNIC[ÍI]PIO\s+([A-Za-záéíóúâêôãõçÁÉÍÓÚÂÊÔÃÕÇ\s]+?)(?=\s*(?:FONE|UF|\(|\d))/i);
                    if (munMatch) {
                        destino += ` - ${munMatch[1].trim()}`;
                    }

                    const ufMatch = fullText.match(/\bUF\s+([A-Z]{2})\b/i);
                    if (ufMatch) {
                        destino += `/${ufMatch[1].toUpperCase()}`;
                    }

                    const cepMatch = fullText.match(/CEP\s*(\d{2}\.?\d{3}-?\d{3})/i) || fullText.match(/(\d{2}\.\d{3}-\d{3})/);
                    if (cepMatch) {
                        destino += ` - CEP: ${cepMatch[1]}`;
                    }

                    // ========== PRODUTOS ==========
                    const produtos = [];

                    console.log('Produtos no estoque para busca:', stock.map(p => ({ sku: p.sku, name: p.name })));

                    const encontrarProdutoEstoque = (sku, nome) => {
                        const skuOriginal = (sku || '').trim();
                        const skuNorm = skuOriginal.toLowerCase().replace(/[^a-z0-9]/g, '');
                        const nomeNorm = (nome || '').trim().toLowerCase();

                        console.log('Buscando no estoque:', { skuOriginal, skuNorm, nomeNorm });

                        const encontrado = stock.find(p => {
                            const pSkuOriginal = (p.sku || '').trim();
                            const pSku = pSkuOriginal.toLowerCase().replace(/[^a-z0-9]/g, '');
                            const pNome = (p.name || '').trim().toLowerCase();

                            if (pSkuOriginal.toLowerCase() === skuOriginal.toLowerCase()) {
                                console.log('OK: Match exato SKU:', pSkuOriginal);
                                return true;
                            }
                            if (pSku && skuNorm && pSku === skuNorm) {
                                console.log('OK: Match normalizado:', pSku, '=', skuNorm);
                                return true;
                            }
                            if (pSku.length >= 5 && skuNorm.length >= 5) {
                                if (pSku.includes(skuNorm) || skuNorm.includes(pSku)) {
                                    console.log('OK: Match parcial:', pSku, 'vs', skuNorm);
                                    return true;
                                }
                            }
                            return false;
                        });

                        if (!encontrado) {
                            console.log('ERRO: Nenhum match para:', skuOriginal);
                        }

                        return encontrado;
                    };

                    const prodPattern = /([A-Z0-9]{6,15})\s+([A-Za-záéíóúâêôãõçÁÉÍÓÚÂÊÔÃÕÇ0-9\s\-\.]+?)\s+(\d{8})\s+(\d{4})\s+(\d\.\d{3})\s+(UN|PC|PÇ|KG|CX|PCT|M2|M|LT)\s+(\d+[,.]?\d*)/gi;

                    let match;
                    while ((match = prodPattern.exec(fullText)) !== null && produtos.length < 50) {
                        const sku = match[1].trim();
                        const nome = match[2].trim().replace(/\s+/g, ' ');
                        const qtd = parseFloat(match[7].replace(',', '.')) || 1;

                        const produtoEncontrado = encontrarProdutoEstoque(sku, nome);

                        produtos.push({
                            sku: sku,
                            nome: nome,
                            quantidade: Math.round(qtd),
                            ean: '',
                            baixarEstoque: !!produtoEncontrado,
                            produtoEstoque: produtoEncontrado || null,
                            autoVinculado: !!produtoEncontrado
                        });
                    }

                    if (produtos.length === 0) {
                        const altPattern = /C[ÓO]DIGO\s+([A-Z0-9]+)\s+.*?DESCRI[ÇC][ÃA]O[^A-Z]*([A-Za-záéíóúâêôãõç\s\-]{5,60}).*?QUANT[^\d]*(\d+)/gi;
                        while ((match = altPattern.exec(fullText)) !== null && produtos.length < 50) {
                            const sku = match[1].trim();
                            const nome = match[2].trim();
                            const produtoEncontrado = encontrarProdutoEstoque(sku, nome);

                            produtos.push({
                                sku: sku,
                                nome: nome,
                                quantidade: parseInt(match[3]) || 1,
                                ean: '',
                                baixarEstoque: !!produtoEncontrado,
                                produtoEstoque: produtoEncontrado || null,
                                autoVinculado: !!produtoEncontrado
                            });
                        }
                    }

                    console.log('Dados extraídos:', { nNF, xNome, destino, produtos });

                    onSetForm(prevForm => ({
                        ...prevForm,
                        nfNumero: nNF,
                        cliente: xNome,
                        destino: destino.trim(),
                        produtos: produtos,
                        codigoRastreio: '',
                        linkRastreio: ''
                    }));

                    onSetNfData({
                        type: 'pdf',
                        fileName: file.name,
                        nfNumero: nNF,
                        cliente: xNome,
                        destino: destino,
                        produtos: produtos
                    });

                    const vinculados = produtos.filter(p => p.autoVinculado).length;
                    let msg = `PDF processado!`;
                    if (nNF) msg += ` NF: ${nNF}.`;
                    if (xNome) msg += ` Cliente: ${xNome.substring(0, 20)}...`;
                    if (produtos.length > 0) msg += ` ${produtos.length} produto(s).`;
                    if (vinculados > 0) msg += ` ${vinculados} vinculado(s) ao estoque.`;
                    if (!nNF && !xNome && produtos.length === 0) {
                        msg = 'Não foi possível extrair todos os dados. Complete manualmente.';
                    }

                    onSetSuccess(msg);
                    onSetActiveView('register');
                    setTimeout(() => onSetSuccess(''), 8000);

                } catch (err) {
                    console.error('Erro ao processar PDF:', err);
                    onSetError('Erro ao processar PDF. Tente usar o arquivo XML ou preencha manualmente.');
                    onSetNfData({ type: 'pdf', fileName: file.name });
                    onSetActiveView('register');
                }
            };
            reader.readAsArrayBuffer(file);
        } else {
            onSetError('Formato não suportado. Use XML ou PDF.');
        }
    };

    return (
        <>
            <p style={{color: 'var(--text-muted)', marginBottom: '20px', fontSize: '13px'}}>
                Importe a NF em formato XML (dados extraídos automaticamente) ou PDF
            </p>

            <div style={{
                border: '2px dashed var(--border)',
                borderRadius: 'var(--radius-lg)',
                padding: '40px',
                textAlign: 'center',
                background: 'var(--bg-primary)'
            }}>
                <input
                    type="file"
                    accept=".xml,.pdf"
                    onChange={handleFileUpload}
                    style={{display: 'none'}}
                    id="nf-upload"
                />
                <label htmlFor="nf-upload" style={{cursor: 'pointer'}}>
                    <div style={{marginBottom: '16px', color: 'var(--text-light)'}}><Icon name="file" size={48} /></div>
                    <div style={{fontWeight: '600', marginBottom: '8px'}}>Clique para selecionar arquivo</div>
                    <div style={{fontSize: '12px', color: 'var(--text-muted)'}}>XML ou PDF</div>
                </label>
            </div>

            {nfFile && (
                <div style={{marginTop: '16px', padding: '12px', background: 'var(--success-light)', borderRadius: 'var(--radius)', fontSize: '13px'}}>
                    Arquivo carregado: <strong>{nfFile.name}</strong>
                </div>
            )}
        </>
    );
}
