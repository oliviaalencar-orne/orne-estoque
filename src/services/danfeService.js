/**
 * danfeService.js — Fetch NF-e XML from Tiny and generate DANFE PDFs
 */
import { supabaseClient } from '@/config/supabase';
import { parseNFeXML } from '@/utils/danfeParser';
import { gerarDANFEPDF } from '@/utils/danfeGenerator';
import JSZip from 'jszip';

/**
 * Fetch XML for a single NF and generate + download DANFE PDF
 * @param {string} nfNumero
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function downloadDANFE(nfNumero) {
    const { data, error } = await supabaseClient.functions.invoke('tiny-download-nf', {
        body: { nfNumeros: [nfNumero] },
    });

    if (error || !data?.success) {
        return { success: false, error: error?.message || 'Falha ao buscar NF no Tiny' };
    }

    const result = data.data?.[nfNumero];
    if (!result?.success || !result?.xml) {
        return { success: false, error: `NF ${nfNumero}: não encontrada ou não autorizada` };
    }

    const dados = parseNFeXML(result.xml);
    const doc = gerarDANFEPDF(dados);
    doc.save(`DANFE_NF_${nfNumero}.pdf`);

    return { success: true };
}

/**
 * Fetch XMLs for multiple NFs and generate a ZIP with all DANFEs
 * @param {string[]} nfNumeros
 * @param {function} onProgress - callback(current, total, vinculados)
 * @returns {Promise<{success: boolean, generated: number, errors: string[]}>}
 */
export async function downloadDANFEsEmLote(nfNumeros, onProgress) {
    const BATCH_SIZE = 20; // Edge function limit
    const pdfs = [];
    const errors = [];
    let processed = 0;

    for (let i = 0; i < nfNumeros.length; i += BATCH_SIZE) {
        const batch = nfNumeros.slice(i, i + BATCH_SIZE);

        onProgress?.(processed, nfNumeros.length, pdfs.length);

        const { data, error } = await supabaseClient.functions.invoke('tiny-download-nf', {
            body: { nfNumeros: batch },
        });

        if (error || !data?.success) {
            batch.forEach((nf) => errors.push(`NF ${nf}: erro na requisição`));
            processed += batch.length;
            continue;
        }

        for (const nf of batch) {
            processed++;
            const result = data.data?.[nf];
            if (!result?.success || !result?.xml) {
                errors.push(`NF ${nf}: não encontrada ou não autorizada`);
                continue;
            }
            try {
                const dados = parseNFeXML(result.xml);
                const doc = gerarDANFEPDF(dados);
                const pdfBlob = doc.output('blob');
                pdfs.push({ nome: `DANFE_NF_${nf}.pdf`, blob: pdfBlob });
            } catch (e) {
                errors.push(`NF ${nf}: erro ao gerar PDF`);
            }
        }

        onProgress?.(processed, nfNumeros.length, pdfs.length);
    }

    if (pdfs.length === 0) {
        return { success: false, generated: 0, errors };
    }

    // Single PDF: direct download
    if (pdfs.length === 1) {
        const url = URL.createObjectURL(pdfs[0].blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = pdfs[0].nome;
        a.click();
        URL.revokeObjectURL(url);
        return { success: true, generated: 1, errors };
    }

    // Multiple: ZIP
    const zip = new JSZip();
    for (const pdf of pdfs) {
        zip.file(pdf.nome, pdf.blob);
    }
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DANFEs_${new Date().toISOString().slice(0, 10)}.zip`;
    a.click();
    URL.revokeObjectURL(url);

    return { success: true, generated: pdfs.length, errors };
}
