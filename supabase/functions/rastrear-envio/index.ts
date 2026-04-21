/**
 * rastrear-envio — Rastreia pedidos via Melhor Envio (API v2) com
 * cadeia de fallback Correios SRO → melhorrastreio para códigos
 * fresh-posted. Persiste status + rastreio_info via PostgREST.
 *
 * Histórico:
 *  v21 (Fase 1 Alerta): dataUltimoEvento grava null quando a API não
 *       retorna timestamp (antes gravava ''). Permite distinguir
 *       "sem dado" (null) de "sem evento válido" (string vazia
 *       histórica).
 *  v22 (Entrega 1 Taxonomia de Devolução): ME `canceled` e `expired`
 *       agora mapeiam para ETIQUETA_CANCELADA (antes: canceled→DEVOLVIDO,
 *       expired caía no default EM_TRANSITO). Semanticamente correto:
 *       esses pacotes nunca sairão do HUB ORNE. ME `returned` continua
 *       → DEVOLVIDO (admin reclassifica para EXTRAVIADO manualmente se
 *       for o caso). Escopo deliberadamente enxuto — RECUSADO/
 *       ENTREGA_FALHOU/FALHA_NA_COLETA ficaram fora desta entrega.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// v22: canceled/expired → ETIQUETA_CANCELADA.
const STATUS_MAP: Record<string, string> = {
  'pending': 'DESPACHADO', 'posted': 'DESPACHADO',
  'released': 'AGUARDANDO_COLETA',
  'in_transit': 'EM_TRANSITO', 'out_for_delivery': 'SAIU_ENTREGA',
  'delivered': 'ENTREGUE', 'returned': 'DEVOLVIDO',
  'not_delivered': 'TENTATIVA_ENTREGA', 'undelivered': 'TENTATIVA_ENTREGA',
  'canceled': 'ETIQUETA_CANCELADA', 'expired': 'ETIQUETA_CANCELADA',
};
// v22: ETIQUETA_CANCELADA e EXTRAVIADO são terminais paralelos a
// ENTREGUE/DEVOLVIDO (rank 6). Permite auto-advance a partir de
// qualquer intermediário.
const STATUS_ORDER: Record<string, number> = {
  'DESPACHADO': 1, 'AGUARDANDO_COLETA': 2, 'EM_TRANSITO': 3, 'SAIU_ENTREGA': 4,
  'TENTATIVA_ENTREGA': 4, 'ENTREGUE': 5,
  'DEVOLVIDO': 6, 'ETIQUETA_CANCELADA': 6, 'EXTRAVIADO': 6,
};
function isAdvanced(cur: string, cand: string): boolean {
  if (!cand || cand === cur) return false;
  // Terminais negativos "forçam" avanço de qualquer intermediário
  if (cand === 'DEVOLVIDO' || cand === 'ETIQUETA_CANCELADA') return true;
  return (STATUS_ORDER[cand] || 0) > (STATUS_ORDER[cur] || 0);
}
const ME_HEADERS = (token: string) => ({
  'Accept': 'application/json', 'Content-Type': 'application/json',
  'Authorization': `Bearer ${token}`, 'User-Agent': 'OrneDecor/1.0',
});
function detectCarrier(codigo: string): { carrier: string; trackingUrl: string } {
  const c = codigo.trim().toUpperCase();
  if (c.startsWith('LGI')) return { carrier: 'Loggi', trackingUrl: `https://melhorrastreio.com.br/rastreio/${encodeURIComponent(codigo)}` };
  if (c.startsWith('JD') || c.startsWith('JAD')) return { carrier: 'Jadlog', trackingUrl: `https://www.jadlog.com.br/jadlog/tracking?cte=${encodeURIComponent(codigo)}` };
  if (/^[A-Z]{2}\d{9,10}[A-Z]{2}$/.test(c)) return { carrier: 'Correios', trackingUrl: `https://rastreamento.correios.com.br/app/index.php?objetos=${encodeURIComponent(codigo)}` };
  return { carrier: 'Outro', trackingUrl: `https://melhorrastreio.com.br/rastreio/${encodeURIComponent(codigo)}` };
}
function isLoggiCode(code: string): boolean {
  return code.trim().toUpperCase().startsWith('LGI');
}
function normalizeNF(nf: string): string { return (nf || '').replace(/^0+/, '').trim(); }
function dbHeaders() { const k = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!; return { 'apikey': k, 'Authorization': `Bearer ${k}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }; }
function dbUrl() { return Deno.env.get('SUPABASE_URL')!; }

// Normaliza um timestamp — retorna string ISO se válido, ou null
function normalizeTs(raw: unknown): string | null {
  if (!raw) return null;
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

async function persistTracking(shippingId: string, currentStatus: string, result: Record<string, any>): Promise<boolean> {
  try {
    const newStatus = result.status;
    const statusAdvanced = newStatus ? isAdvanced(currentStatus, newStatus) : false;
    const rastreioInfo: Record<string, any> = {
      status: statusAdvanced ? newStatus : currentStatus,
      statusOriginal: result.statusOriginal || '', ultimoEvento: result.ultimoEvento || '',
      dataUltimoEvento: normalizeTs(result.dataUltimoEvento),
      codigoRastreio: result.codigoRastreio || '',
      linkRastreio: result.linkRastreio || '', historico: result.historico || [],
      rastreioAutomatico: true,
    };
    if (result.carrierFallback) rastreioInfo.carrierFallback = result.carrierFallback;
    const payload: Record<string, any> = { ultima_atualizacao_rastreio: new Date().toISOString(), rastreio_info: rastreioInfo };
    if (statusAdvanced) { payload.status = newStatus; console.log(`[persist] ${shippingId}: ${currentStatus} -> ${newStatus}`); }
    else { console.log(`[persist] ${shippingId}: checked (${currentStatus})`); }
    if (result.codigoRastreio && !result.codigoRastreio.startsWith('ORD-')) payload.codigo_rastreio = result.codigoRastreio;
    if (result.linkRastreio) payload.link_rastreio = result.linkRastreio;
    const res = await fetch(`${dbUrl()}/rest/v1/shippings?id=eq.${encodeURIComponent(shippingId)}`, { method: 'PATCH', headers: dbHeaders(), body: JSON.stringify(payload) });
    return statusAdvanced && res.ok;
  } catch (err) { console.error(`[persist] Error: ${err.message}`); return false; }
}

function parseCorreiosStatus(desc: string): string {
  const d = desc.toLowerCase();
  if (d.includes('entregue') || d.includes('delivered')) return 'ENTREGUE';
  if (d.includes('saiu para entrega') || d.includes('out for delivery')) return 'SAIU_ENTREGA';
  if (d.includes('postado') || d.includes('objeto postado')) return 'DESPACHADO';
  if (d.includes('devolvido') || d.includes('returned')) return 'DEVOLVIDO';
  if (d.includes('não entregue') || d.includes('tentativa') || d.includes('ausente')) return 'TENTATIVA_ENTREGA';
  return 'EM_TRANSITO';
}
async function tryCorreiosSRO(codigo: string): Promise<Record<string, any> | null> {
  try {
    const res = await fetch(`https://proxyapp.correios.com.br/v1/sro-rastro/${encodeURIComponent(codigo)}`, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const eventos = data.objetos?.[0]?.eventos;
    if (!eventos?.length) return null;
    const ue = eventos[0];
    return { status: parseCorreiosStatus(ue.descricao || ''), codigoRastreio: codigo, ultimoEvento: ue.descricao || '', dataUltimoEvento: normalizeTs(ue.dtHrCriado), historico: eventos, source: 'correios-sro' };
  } catch { return null; }
}
async function tryMelhorRastreio(codigo: string): Promise<Record<string, any> | null> {
  try {
    const res = await fetch(`https://api.melhorrastreio.com.br/api/v1/trackings/${encodeURIComponent(codigo)}`, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'OrneDecor/1.0' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const tracks = data.data?.tracks || data.tracks || [];
    if (!tracks.length) return null;
    const last = tracks[0];
    const desc = (last.title || last.description || last.status || '').toLowerCase();
    let status = 'EM_TRANSITO';
    if (desc.includes('entregue') || desc.includes('delivered')) status = 'ENTREGUE';
    else if (desc.includes('saiu para entrega') || desc.includes('out for delivery')) status = 'SAIU_ENTREGA';
    else if (desc.includes('postado') || desc.includes('posted')) status = 'DESPACHADO';
    else if (desc.includes('devolvido') || desc.includes('returned')) status = 'DEVOLVIDO';
    else if (desc.includes('não entregue') || desc.includes('tentativa') || desc.includes('ausente')) status = 'TENTATIVA_ENTREGA';
    return { status, codigoRastreio: codigo, ultimoEvento: last.title || last.description || '', dataUltimoEvento: normalizeTs(last.date || last.datetime), historico: tracks.map((t: any) => ({ descricao: t.title || t.description, data: t.date || t.datetime, local: t.locale || '' })), source: 'melhorrastreio' };
  } catch { return null; }
}
async function tryCarrierChain(realCode: string, meStatus: string, mapped: string): Promise<{ cr: Record<string, any> | null; diagnostic: Record<string, any> }> {
  const diagnostic: Record<string, any> = { attempted: true, meStatus, code: realCode, timestamp: new Date().toISOString() };
  const sro = await tryCorreiosSRO(realCode);
  if (sro) { diagnostic.result = 'correios-sro-success'; diagnostic.carrierStatus = sro.status; return { cr: sro, diagnostic }; }
  diagnostic.sroResult = 'failed';
  const mr = await tryMelhorRastreio(realCode);
  if (mr) { diagnostic.result = 'melhorrastreio-success'; diagnostic.carrierStatus = mr.status; return { cr: mr, diagnostic }; }
  diagnostic.melhorrastreioResult = 'failed';
  diagnostic.result = 'all-fallbacks-failed';
  return { cr: null, diagnostic };
}

async function trackByUUID(orderId: string, token: string): Promise<Record<string, any> | null> {
  try {
    const res = await fetch('https://melhorenvio.com.br/api/v2/me/shipment/tracking', {
      method: 'POST', headers: ME_HEADERS(token), body: JSON.stringify({ orders: [orderId] }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const t = data[orderId];
    if (!t) return null;
    const tf = t.tracking;
    const hasEv = Array.isArray(tf) && tf.length > 0;
    const le = hasEv ? tf[tf.length - 1] : null;
    const ms = t.status || le?.status || 'pending';
    const realCode = t.tracking_code || (typeof tf === 'string' && tf.length > 3 ? tf : '') || t.protocol || '';
    let mapped = STATUS_MAP[ms] || 'EM_TRANSITO';
    const { trackingUrl } = realCode ? detectCarrier(realCode) : { trackingUrl: '' };
    const result: Record<string, any> = {
      status: mapped, codigoRastreio: realCode, linkRastreio: trackingUrl,
      statusOriginal: ms, ultimoEvento: le?.description || t.status || '',
      dataUltimoEvento: normalizeTs(le?.date),
      historico: hasEv ? tf : (typeof tf === 'string' ? tf : []),
      rastreioAutomatico: true,
    };
    if (['posted', 'released', 'pending'].includes(ms) && realCode && !realCode.startsWith('ORD-')) {
      if (isLoggiCode(realCode)) {
        result.carrierFallback = { attempted: false, meStatus: ms, code: realCode, reason: 'loggi-no-fallback', timestamp: new Date().toISOString() };
      } else {
        const { cr, diagnostic } = await tryCarrierChain(realCode, ms, mapped);
        result.carrierFallback = diagnostic;
        if (cr && cr.status && isAdvanced(mapped, cr.status)) {
          result.status = cr.status; result.ultimoEvento = cr.ultimoEvento || result.ultimoEvento;
          result.dataUltimoEvento = cr.dataUltimoEvento || result.dataUltimoEvento;
          result.historico = cr.historico || result.historico;
          result.statusOriginal = `ME:${ms}|${cr.source}:${cr.status}`;
        }
      }
    }
    return result;
  } catch (err) { console.log(`[track] Error: ${err.message}`); return null; }
}

async function rastrearEPersistir(orderIds: string[]): Promise<Record<string, any>> {
  const token = Deno.env.get('MELHOR_ENVIO_TOKEN');
  const results: Record<string, any> = {};
  if (!token) { for (const id of orderIds) results[id] = { erro: 'Token ME nao configurado.' }; return results; }
  const shippingMap = new Map<string, { id: string; status: string }>();
  try {
    const uuids = orderIds.map(u => `"${u}"`).join(',');
    const res = await fetch(`${dbUrl()}/rest/v1/shippings?select=id,status,melhor_envio_id&melhor_envio_id=in.(${uuids})`, { headers: { ...dbHeaders(), 'Prefer': '' } });
    if (res.ok) { const rows = await res.json(); for (const r of rows) { if (r.melhor_envio_id) shippingMap.set(r.melhor_envio_id, { id: r.id, status: r.status }); } }
  } catch (err) { console.log(`[batch] DB error: ${err.message}`); }
  for (let i = 0; i < orderIds.length; i += 5) {
    const batch = orderIds.slice(i, i + 5);
    try {
      const res = await fetch('https://melhorenvio.com.br/api/v2/me/shipment/tracking', {
        method: 'POST', headers: ME_HEADERS(token), body: JSON.stringify({ orders: batch }),
      });
      if (!res.ok) { for (const id of batch) results[id] = { erro: `ME ${res.status}` }; continue; }
      const data = await res.json();
      for (const id of batch) {
        const t = data[id];
        if (!t) { results[id] = { erro: 'Nao encontrado' }; continue; }
        const tf = t.tracking; const hasEv = Array.isArray(tf) && tf.length > 0;
        const le = hasEv ? tf[tf.length - 1] : null;
        const ms = t.status || le?.status || 'pending';
        const realCode = t.tracking_code || (typeof tf === 'string' && tf.length > 3 ? tf : '') || t.protocol || '';
        let mapped = STATUS_MAP[ms] || 'EM_TRANSITO';
        const { trackingUrl } = realCode ? detectCarrier(realCode) : { trackingUrl: '' };
        let ultimoEvento = le?.description || '';
        let dataUltimoEvento: string | null = normalizeTs(le?.date);
        let historico = hasEv ? tf : (typeof tf === 'string' ? tf : []);
        let statusOriginal = ms; let carrierFallbackInfo: Record<string, any> | undefined;
        if (['posted', 'released', 'pending'].includes(ms) && realCode && !realCode.startsWith('ORD-')) {
          if (isLoggiCode(realCode)) {
            carrierFallbackInfo = { attempted: false, meStatus: ms, code: realCode, reason: 'loggi-no-fallback', timestamp: new Date().toISOString() };
          } else {
            const { cr, diagnostic } = await tryCarrierChain(realCode, ms, mapped);
            carrierFallbackInfo = diagnostic;
            if (cr && cr.status && isAdvanced(mapped, cr.status)) {
              mapped = cr.status; ultimoEvento = cr.ultimoEvento || ultimoEvento;
              dataUltimoEvento = cr.dataUltimoEvento || dataUltimoEvento;
              historico = cr.historico || historico;
              statusOriginal = `ME:${ms}|${cr.source}:${cr.status}`;
            }
          }
        }
        const trackResult: Record<string, any> = {
          status: mapped, codigoRastreio: realCode, linkRastreio: trackingUrl,
          statusOriginal, ultimoEvento, dataUltimoEvento, historico, rastreioAutomatico: true,
        };
        if (carrierFallbackInfo) trackResult.carrierFallback = carrierFallbackInfo;
        const shipping = shippingMap.get(id);
        if (shipping) { trackResult.persisted = await persistTracking(shipping.id, shipping.status, trackResult); trackResult.previousStatus = shipping.status; }
        results[id] = trackResult;
      }
    } catch (err) { for (const id of batch) results[id] = { erro: `Erro: ${err.message}` }; }
    if (i + 5 < orderIds.length) await new Promise(r => setTimeout(r, 1000));
  }
  return results;
}

async function rastrearPorCodigo(codigos: string[]): Promise<Record<string, any>> {
  const results: Record<string, any> = {}; const token = Deno.env.get('MELHOR_ENVIO_TOKEN');
  for (const codigo of codigos) {
    const { carrier, trackingUrl } = detectCarrier(codigo);
    try {
      if (token) {
        let uuid: string | null = null; let dbRow: { id: string; status: string } | null = null;
        try { const r = await fetch(`${dbUrl()}/rest/v1/shippings?select=melhor_envio_id,id,status&codigo_rastreio=eq.${encodeURIComponent(codigo)}&limit=1`, { headers: { ...dbHeaders(), 'Prefer': '' } }); if (r.ok) { const d = await r.json(); const row = d[0]; if (row) { dbRow = { id: row.id, status: row.status }; if (row.melhor_envio_id && !row.melhor_envio_id.startsWith('ORD-')) uuid = row.melhor_envio_id; } } } catch {}
        if (uuid) { const result = await trackByUUID(uuid, token); if (result) { result.linkRastreio = trackingUrl; result.transportadoraDetectada = carrier; if (dbRow) result.persisted = await persistTracking(dbRow.id, dbRow.status, result); results[codigo] = result; continue; } }
      }
      if (isLoggiCode(codigo)) {
        results[codigo] = { status: null, codigoRastreio: codigo, linkRastreio: trackingUrl, transportadoraDetectada: carrier, rastreioAutomatico: false, carrierFallback: { attempted: false, reason: 'loggi-no-fallback' } };
        continue;
      }
      const { cr } = await tryCarrierChain(codigo, 'direct', 'DESPACHADO');
      if (cr) { cr.linkRastreio = trackingUrl; cr.transportadoraDetectada = carrier; try { const r3 = await fetch(`${dbUrl()}/rest/v1/shippings?select=id,status&codigo_rastreio=eq.${encodeURIComponent(codigo)}&limit=1`, { headers: { ...dbHeaders(), 'Prefer': '' } }); if (r3.ok) { const d3 = await r3.json(); if (d3[0]) await persistTracking(d3[0].id, d3[0].status, cr); } } catch {} results[codigo] = cr; continue; }
      results[codigo] = { status: null, codigoRastreio: codigo, linkRastreio: trackingUrl, transportadoraDetectada: carrier, rastreioAutomatico: false };
    } catch (err) { results[codigo] = { status: null, erro: err.message }; }
  }
  return results;
}

async function searchME(q: string, token: string): Promise<any[]> { try { const r = await fetch(`https://melhorenvio.com.br/api/v2/me/orders?q=${encodeURIComponent(q)}&per_page=20`, { headers: ME_HEADERS(token) }); if (!r.ok) return []; const d = await r.json(); return d.data || d || []; } catch { return []; } }
function matchNF(order: any, nf: string): boolean { const n = normalizeNF(nf); return [order.invoice, order.reference, order.protocol, order.name, order.tags, order.reminder, order.volumes?.[0]?.invoice, order.description, order.note].filter(Boolean).map(String).some(f => normalizeNF(f) === n || f.includes(n) || f.includes(nf)); }
function extractOrder(order: any): Record<string, any> { const tc = order.tracking || order.self_tracking || order.protocol || ''; const ms = order.status || 'pending'; let tr = 'Melhor Envio'; if (order.service) { const s = (order.service.name || order.service.company?.name || '').toLowerCase(); if (s.includes('correios') || s.includes('pac') || s.includes('sedex')) tr = 'Correios'; else if (s.includes('jadlog')) tr = 'Jadlog'; else if (s.includes('loggi')) tr = 'Loggi'; } const { trackingUrl } = detectCarrier(tc); return { encontrado: true, melhor_envio_id: order.id, codigo_rastreio: tc, link_rastreio: trackingUrl, transportadora: tr, status: STATUS_MAP[ms] || 'DESPACHADO', statusOriginal: ms }; }
async function buscarPorNF(nfs: string[], clientes?: Record<string, string>): Promise<Record<string, any>> {
  const token = Deno.env.get('MELHOR_ENVIO_TOKEN'); const results: Record<string, any> = {};
  if (!token) { for (const nf of nfs) results[nf] = { encontrado: false }; return results; }
  for (let i = 0; i < Math.min(nfs.length, 10); i++) {
    const nf = nfs[i]; const cn = clientes?.[nf] || null; const debug: string[] = []; let found = false;
    for (const q of [nf, normalizeNF(nf), `NF ${normalizeNF(nf)}`].filter((v, j, a) => a.indexOf(v) === j)) {
      const orders = await searchME(q, token); debug.push(`"${q}": ${orders.length}`);
      if (orders.length > 0) { for (const o of orders) { if (matchNF(o, nf)) { results[nf] = extractOrder(o); results[nf].debug = debug; found = true; break; } } if (found) break; if (orders.length <= 5) { results[nf] = extractOrder(orders[0]); results[nf].debug = debug; found = true; break; } }
      await new Promise(r => setTimeout(r, 500));
    }
    if (!found && cn) { const orders = await searchME(cn, token); if (orders.length > 0) { for (const o of orders) { if (matchNF(o, nf)) { results[nf] = extractOrder(o); found = true; break; } } if (!found && orders.length === 1) { results[nf] = extractOrder(orders[0]); found = true; } } }
    if (!found) results[nf] = { encontrado: false, debug };
    if (results[nf]?.encontrado) { try { const p: Record<string, any> = { melhor_envio_id: results[nf].melhor_envio_id, ultima_atualizacao_rastreio: new Date().toISOString() }; if (results[nf].codigo_rastreio) p.codigo_rastreio = results[nf].codigo_rastreio; if (results[nf].link_rastreio) p.link_rastreio = results[nf].link_rastreio; if (results[nf].transportadora) p.transportadora = results[nf].transportadora; for (const c of ['melhor_envio_id=is.null', 'melhor_envio_id=eq.', 'melhor_envio_id=like.ORD-*']) { await fetch(`${dbUrl()}/rest/v1/shippings?nf_numero=eq.${encodeURIComponent(nf)}&${c}`, { method: 'PATCH', headers: dbHeaders(), body: JSON.stringify(p) }); } } catch {} }
    if (i < Math.min(nfs.length, 10) - 1) await new Promise(r => setTimeout(r, 1500));
  }
  return results;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json(); let results: Record<string, any> = {};
    if (body.orderIds && Array.isArray(body.orderIds)) results = await rastrearEPersistir(body.orderIds);
    else if (body.codigosRastreio && Array.isArray(body.codigosRastreio)) results = await rastrearPorCodigo(body.codigosRastreio);
    else if (body.buscarPorNF && Array.isArray(body.buscarPorNF)) results = await buscarPorNF(body.buscarPorNF, body.clientes);
    else return new Response(JSON.stringify({ success: false, error: 'Forneca orderIds, codigosRastreio ou buscarPorNF' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    return new Response(JSON.stringify({ success: true, data: results }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) { return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
});
