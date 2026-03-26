/**
 * danfeGenerator.js — Generate DANFE PDF from parsed NF-e data using jsPDF
 */
import jsPDF from 'jspdf';

// Helpers
function formatCNPJ(v) {
    if (!v) return '';
    return v.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

function formatCPF(v) {
    if (!v) return '';
    if (v.length === 11) return v.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    return formatCNPJ(v);
}

function formatDate(d) {
    if (!d) return '';
    const dt = new Date(d);
    return dt.toLocaleDateString('pt-BR');
}

function formatMoney(v) {
    return (v || 0).toFixed(2).replace('.', ',');
}

function formatChaveAcesso(c) {
    if (!c) return '';
    return c.replace(/(.{4})/g, '$1 ').trim();
}

/**
 * Generate DANFE PDF document
 * @param {Object} dados - Parsed NF-e data from parseNFeXML
 * @returns {jsPDF} - PDF document instance
 */
export function gerarDANFEPDF(dados) {
    const doc = new jsPDF('p', 'mm', 'a4');
    const W = 210;
    const H = 297;
    const M = 5; // margin
    let y = M;

    doc.setFont('helvetica');

    // ============ HEADER ============
    // Outer header box
    doc.setDrawColor(0);
    doc.setLineWidth(0.3);

    // Emitente box (left)
    const headerH = 28;
    doc.rect(M, y, 90, headerH);

    // DANFE title box (center)
    doc.rect(M + 90, y, 40, headerH);

    // NF info box (right)
    doc.rect(M + 130, y, W - 2 * M - 130, headerH);

    // Emitente content
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    const nomeEmit = dados.emitente.fantasia || dados.emitente.nome;
    doc.text(nomeEmit.substring(0, 40), M + 3, y + 6);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.text(`CNPJ: ${formatCNPJ(dados.emitente.cnpj)}`, M + 3, y + 10);
    const endLine1 = `${dados.emitente.endereco}, ${dados.emitente.numero}`;
    doc.text(endLine1.substring(0, 50), M + 3, y + 14);
    const endLine2 = `${dados.emitente.bairro} - ${dados.emitente.municipio}/${dados.emitente.uf}`;
    doc.text(endLine2.substring(0, 50), M + 3, y + 18);
    doc.text(`CEP: ${dados.emitente.cep} | IE: ${dados.emitente.ie}`, M + 3, y + 22);
    if (dados.emitente.fone) {
        doc.text(`Fone: ${dados.emitente.fone}`, M + 3, y + 26);
    }

    // DANFE title content (center)
    const cx = M + 90 + 20; // center of middle box
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('DANFE', cx, y + 7, { align: 'center' });
    doc.setFontSize(5.5);
    doc.setFont('helvetica', 'normal');
    doc.text('Documento Auxiliar da', cx, y + 12, { align: 'center' });
    doc.text('Nota Fiscal Eletrônica', cx, y + 15.5, { align: 'center' });
    doc.setFontSize(6);
    doc.text('0 - ENTRADA', cx, y + 20, { align: 'center' });
    doc.text('1 - SAÍDA', cx, y + 23.5, { align: 'center' });

    // NF info (right)
    const rx = M + 133;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(`Nº ${dados.numero}`, rx, y + 7);
    doc.text(`Série: ${dados.serie}`, rx, y + 12);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.text(`Emissão: ${formatDate(dados.dataEmissao)}`, rx, y + 18);
    doc.text(`Pág. 1`, rx, y + 23);

    y += headerH + 1;

    // ============ CHAVE DE ACESSO ============
    doc.rect(M, y, W - 2 * M, 9);
    doc.setFontSize(5.5);
    doc.setFont('helvetica', 'normal');
    doc.text('CHAVE DE ACESSO', M + 3, y + 3.5);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text(formatChaveAcesso(dados.chaveAcesso), (W) / 2, y + 7.5, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    y += 10;

    // ============ PROTOCOLO ============
    doc.rect(M, y, W - 2 * M, 8);
    doc.setFontSize(5.5);
    doc.text('PROTOCOLO DE AUTORIZAÇÃO DE USO', M + 3, y + 3.5);
    doc.setFontSize(6.5);
    const protText = dados.protocolo.numero
        ? `${dados.protocolo.numero} - ${formatDate(dados.protocolo.dataAutorizacao)}`
        : 'Sem protocolo';
    doc.text(protText, (W) / 2, y + 7, { align: 'center' });
    y += 9;

    // ============ NATUREZA DA OPERAÇÃO ============
    doc.rect(M, y, W - 2 * M, 8);
    doc.setFontSize(5.5);
    doc.text('NATUREZA DA OPERAÇÃO', M + 3, y + 3.5);
    doc.setFontSize(7);
    doc.text(dados.naturezaOp, M + 3, y + 7);
    y += 9;

    // ============ DESTINATÁRIO ============
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.text('DESTINATÁRIO / REMETENTE', M + 3, y + 3.5);
    doc.setFont('helvetica', 'normal');
    y += 4;

    doc.rect(M, y, W - 2 * M, 16);
    doc.setFontSize(6.5);
    doc.text(`Nome: ${dados.destinatario.nome}`, M + 3, y + 4.5);

    const cpfLabel = (dados.destinatario.cpfCnpj || '').length > 11 ? 'CNPJ' : 'CPF';
    const cpfFormatted = (dados.destinatario.cpfCnpj || '').length > 11
        ? formatCNPJ(dados.destinatario.cpfCnpj)
        : formatCPF(dados.destinatario.cpfCnpj);
    doc.text(`${cpfLabel}: ${cpfFormatted}`, W - M - 55, y + 4.5);

    const endDest = `${dados.destinatario.endereco}, ${dados.destinatario.numero}`;
    doc.text(`Endereço: ${endDest.substring(0, 60)}`, M + 3, y + 9);

    const cidDest = `${dados.destinatario.bairro} - ${dados.destinatario.municipio}/${dados.destinatario.uf} - CEP: ${dados.destinatario.cep}`;
    doc.text(cidDest.substring(0, 70), M + 3, y + 13);

    if (dados.destinatario.fone) {
        doc.text(`Fone: ${dados.destinatario.fone}`, W - M - 55, y + 13);
    }

    y += 18;

    // ============ PRODUTOS ============
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.text('DADOS DOS PRODUTOS / SERVIÇOS', M + 3, y + 3.5);
    y += 4;

    // Column positions
    const colX = [M, M + 8, M + 80, M + 100, M + 114, M + 127, M + 143, M + 163, M + 183];
    const colW = [8, 72, 20, 14, 13, 16, 20, 20, W - 2 * M - 183];
    const headers = ['#', 'DESCRIÇÃO', 'NCM', 'CFOP', 'UN', 'QTD', 'VL.UNIT', 'VL.TOTAL', ''];

    // Header row
    doc.setFillColor(245, 245, 245);
    doc.rect(M, y, W - 2 * M, 5, 'FD');
    doc.setFontSize(5.5);
    doc.setFont('helvetica', 'bold');
    headers.forEach((h, i) => {
        if (h) doc.text(h, colX[i] + 1, y + 3.5);
    });
    y += 5;

    // Product rows
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    for (const prod of dados.produtos) {
        if (y > H - 35) {
            doc.addPage();
            y = M;
        }
        const descShort = prod.descricao.substring(0, 45);
        doc.text(prod.item, colX[0] + 1, y + 3.5);
        doc.text(descShort, colX[1] + 1, y + 3.5);
        doc.text(prod.ncm, colX[2] + 1, y + 3.5);
        doc.text(prod.cfop, colX[3] + 1, y + 3.5);
        doc.text(prod.unidade, colX[4] + 1, y + 3.5);
        doc.text(String(prod.quantidade), colX[5] + 1, y + 3.5);
        doc.text(formatMoney(prod.valorUnitario), colX[6] + 1, y + 3.5);
        doc.text(formatMoney(prod.valorTotal), colX[7] + 1, y + 3.5);
        doc.setDrawColor(220);
        doc.line(M, y + 4.5, W - M, y + 4.5);
        doc.setDrawColor(0);
        y += 5;
    }
    y += 2;

    // ============ TOTAIS ============
    if (y > H - 30) {
        doc.addPage();
        y = M;
    }
    doc.setDrawColor(0);
    doc.rect(M, y, W - 2 * M, 12);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.text('CÁLCULO DO IMPOSTO / TOTAIS', M + 3, y + 4);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);

    const totalY = y + 8;
    doc.text(`Valor Produtos: R$ ${formatMoney(dados.totais.valorProdutos)}`, M + 3, totalY);
    doc.text(`Frete: R$ ${formatMoney(dados.totais.valorFrete)}`, M + 50, totalY);
    doc.text(`Desconto: R$ ${formatMoney(dados.totais.valorDesconto)}`, M + 90, totalY);
    doc.text(`ICMS: R$ ${formatMoney(dados.totais.valorICMS)}`, M + 125, totalY);
    doc.setFont('helvetica', 'bold');
    doc.text(`TOTAL NF: R$ ${formatMoney(dados.totais.valorNF)}`, W - M - 3, totalY, { align: 'right' });
    y += 14;

    // ============ TRANSPORTE ============
    if (y > H - 25) {
        doc.addPage();
        y = M;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.text('TRANSPORTADOR / VOLUMES', M + 3, y + 3.5);
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.rect(M, y, W - 2 * M, 8);
    doc.setFontSize(6);
    const modFrete = { '0': 'CIF', '1': 'FOB', '2': 'Terceiros', '9': 'Sem Frete' };
    doc.text(`Frete: ${modFrete[dados.transporte.modalidade] || dados.transporte.modalidade || '-'}`, M + 3, y + 4.5);
    doc.text(`Volumes: ${dados.transporte.volumes || '-'}`, M + 40, y + 4.5);
    doc.text(`Espécie: ${dados.transporte.especie || '-'}`, M + 70, y + 4.5);
    doc.text(`Peso Líq.: ${dados.transporte.pesoLiquido || '-'} kg`, M + 105, y + 4.5);
    doc.text(`Peso Bruto: ${dados.transporte.pesoBruto || '-'} kg`, M + 145, y + 4.5);
    y += 10;

    // ============ INFO ADICIONAL ============
    if (dados.infoAdicional) {
        if (y > H - 25) {
            doc.addPage();
            y = M;
        }
        doc.rect(M, y, W - 2 * M, 22);
        doc.setFontSize(5.5);
        doc.setFont('helvetica', 'bold');
        doc.text('INFORMAÇÕES COMPLEMENTARES', M + 3, y + 3.5);
        doc.setFont('helvetica', 'normal');
        const info = dados.infoAdicional
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<[^>]*>/g, '');
        const lines = doc.splitTextToSize(info, W - 2 * M - 6);
        doc.text(lines.slice(0, 8), M + 3, y + 7.5);
    }

    return doc;
}
