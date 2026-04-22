/**
 * cron-update-tracking — Orquestrador de atualização de rastreios.
 *
 * Porta a lógica de `api/cron/update-tracking.js` (Vercel serverless,
 * teto 60s no Hobby) para o runtime de Edge Function do Supabase
 * (teto ~150-400s), eliminando o 504 observado com 280+ pendentes.
 *
 * Fluxo:
 *   pg_cron  → cron-update-tracking → rastrear-envio → Postgres
 *   Vercel   → cron-update-tracking → rastrear-envio → Postgres
 *
 * Esta EF NÃO duplica a lógica de rastreio: delega tudo à
 * `rastrear-envio` via HTTP interno do Supabase (mesmo padrão do
 * endpoint Vercel atual). Não paraleliza internamente nesta rodada
 * — primeiro validar que serial com headroom maior já resolve.
 *
 * Auth: verify_jwt=true (plataforma valida assinatura). Em runtime,
 * exigimos que o JWT tenha role=service_role para proteger contra
 * usuários anônimos chamarem o cron.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const VALID_STATUSES = [
  'DESPACHADO', 'AGUARDANDO_COLETA', 'EM_TRANSITO', 'SAIU_ENTREGA',
  'TENTATIVA_ENTREGA', 'ENTREGUE', 'DEVOLVIDO',
  'ETIQUETA_CANCELADA', 'EXTRAVIADO',
];

const STATUS_RANK: Record<string, number> = {
  DESPACHADO: 0,
  AGUARDANDO_COLETA: 0.5,
  EM_TRANSITO: 1,
  SAIU_ENTREGA: 2,
  TENTATIVA_ENTREGA: 2,
  ENTREGUE: 3,
  DEVOLVIDO: 3,
  ETIQUETA_CANCELADA: 3,
  EXTRAVIADO: 3,
};

const TERMINAL_STATUSES = new Set([
  'ENTREGUE', 'DEVOLVIDO', 'ETIQUETA_CANCELADA', 'EXTRAVIADO',
]);

function shouldUpdateStatus(currentStatus: string, newStatus: string): boolean {
  if (!VALID_STATUSES.includes(newStatus)) return false;
  if (TERMINAL_STATUSES.has(currentStatus)) return false;
  return (STATUS_RANK[newStatus] ?? -1) > (STATUS_RANK[currentStatus] ?? -1);
}

type DbHeaders = {
  apikey: string;
  Authorization: string;
  'Content-Type': string;
};

async function patchShipping(
  restUrl: string,
  headers: DbHeaders,
  shippingId: string,
  payload: Record<string, unknown>,
): Promise<boolean> {
  const res = await fetch(`${restUrl}/shippings?id=eq.${shippingId}`, {
    method: 'PATCH',
    headers: { ...headers, 'Prefer': 'return=minimal' },
    body: JSON.stringify(payload),
  });
  return res.ok;
}

// Decodifica o payload de um JWT sem validar assinatura — a plataforma
// já fez isso (verify_jwt=true). Usado apenas para conferir o claim role.
function decodeJwtRole(auth: string | null): string | null {
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')),
    );
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

type Summary = {
  fases: {
    busca: { pendentes_total: number; entregas_locais_ignoradas: number };
    nf: { tentativas: number; encontrados: number };
    me: { total: number; checked: number; updated: number; errors: number };
    correios: { total: number; checked: number; updated: number; errors: number };
    time_alerts: { aplicados: number };
    devolucoes: { processadas: number; entradas_criadas: number; erros: number };
  };
  total_atualizados: number;
  duration_ms: number;
  errors: string[];
  timestamp: string;
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startedAt = Date.now();
  const summary: Summary = {
    fases: {
      busca: { pendentes_total: 0, entregas_locais_ignoradas: 0 },
      nf: { tentativas: 0, encontrados: 0 },
      me: { total: 0, checked: 0, updated: 0, errors: 0 },
      correios: { total: 0, checked: 0, updated: 0, errors: 0 },
      time_alerts: { aplicados: 0 },
      devolucoes: { processadas: 0, entradas_criadas: 0, erros: 0 },
    },
    total_atualizados: 0,
    duration_ms: 0,
    errors: [],
    timestamp: new Date().toISOString(),
  };

  // --- Auth: exigir role=service_role no JWT ---
  const role = decodeJwtRole(req.headers.get('authorization'));
  if (role !== 'service_role') {
    return new Response(
      JSON.stringify({ error: 'Requires service_role JWT', role }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return new Response(
      JSON.stringify({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const REST_URL = `${SUPABASE_URL}/rest/v1`;
  const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;
  const supabaseHeaders: DbHeaders = {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };

  try {
    // ── Fase 1: buscar shippings pendentes ──────────────────────
    const query = new URLSearchParams({
      select:
        'id,nf_numero,cliente,status,codigo_rastreio,melhor_envio_id,transportadora,entrega_local',
      or:
        '(status.eq.DESPACHADO,status.eq.AGUARDANDO_COLETA,status.eq.EM_TRANSITO,status.eq.SAIU_ENTREGA,status.eq.TENTATIVA_ENTREGA)',
    });

    const shippingsRes = await fetch(`${REST_URL}/shippings?${query}`, {
      headers: supabaseHeaders,
    });
    if (!shippingsRes.ok) {
      const txt = await shippingsRes.text();
      throw new Error(`Falha ao buscar shippings: ${shippingsRes.status} ${txt}`);
    }

    const allShippingsRaw = await shippingsRes.json() as Array<Record<string, any>>;
    const allShippings = allShippingsRaw.filter((s) => !s.entrega_local);
    summary.fases.busca.pendentes_total = allShippingsRaw.length;
    summary.fases.busca.entregas_locais_ignoradas =
      allShippingsRaw.length - allShippings.length;
    const now = new Date().toISOString();
    console.log(
      `[CRON-EF] Fase 1: ${allShippingsRaw.length} pendentes, ${summary.fases.busca.entregas_locais_ignoradas} locais ignoradas`,
    );

    // ── Fase 2: NF search (shippings sem código) ────────────────
    const semRastreio = allShippings.filter(
      (s) =>
        (!s.codigo_rastreio || !s.codigo_rastreio.trim()) &&
        (!s.melhor_envio_id || !s.melhor_envio_id.trim()) &&
        s.nf_numero && s.nf_numero.trim() &&
        s.status === 'DESPACHADO',
    );
    summary.fases.nf.tentativas = semRastreio.length;

    if (semRastreio.length > 0) {
      console.log(`[CRON-EF] Fase 2: buscando rastreio por NF em ${semRastreio.length} despachos`);
      for (let i = 0; i < semRastreio.length; i += 10) {
        const batch = semRastreio.slice(i, i + 10);
        const nfNumbers = batch.map((s) => s.nf_numero.trim());
        const clientes: Record<string, string> = {};
        for (const s of batch) {
          if (s.cliente) clientes[s.nf_numero.trim()] = s.cliente;
        }
        try {
          const payload: Record<string, unknown> = { buscarPorNF: nfNumbers };
          if (Object.keys(clientes).length > 0) payload.clientes = clientes;
          const nfRes = await fetch(`${FUNCTIONS_URL}/rastrear-envio`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify(payload),
          });
          const nfData = await nfRes.json();
          if (nfData.success && nfData.data) {
            for (const shipping of batch) {
              const result = nfData.data[shipping.nf_numero.trim()];
              if (result?.encontrado) {
                const p: Record<string, unknown> = { ultima_atualizacao_rastreio: now };
                if (result.codigo_rastreio) p.codigo_rastreio = result.codigo_rastreio;
                if (result.melhor_envio_id) p.melhor_envio_id = result.melhor_envio_id;
                if (result.link_rastreio) p.link_rastreio = result.link_rastreio;
                if (result.transportadora) p.transportadora = result.transportadora;
                await patchShipping(REST_URL, supabaseHeaders, shipping.id, p);
                if (result.melhor_envio_id) shipping.melhor_envio_id = result.melhor_envio_id;
                if (result.codigo_rastreio) shipping.codigo_rastreio = result.codigo_rastreio;
                summary.fases.nf.encontrados++;
              }
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          summary.errors.push(`nf batch ${i}: ${msg}`);
          console.error(`[CRON-EF] Erro NF batch ${i}: ${msg}`);
        }
        if (i + 10 < semRastreio.length) {
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
      console.log(
        `[CRON-EF] Fase 2 OK: ${summary.fases.nf.encontrados}/${semRastreio.length} encontrados`,
      );
    }

    // Filtrar: precisa ter código de rastreio OU melhor_envio_id
    const shippings = allShippings.filter(
      (s) =>
        (s.codigo_rastreio && s.codigo_rastreio.trim()) ||
        (s.melhor_envio_id && s.melhor_envio_id.trim()),
    );

    const porMelhorEnvio = shippings.filter(
      (s) => s.melhor_envio_id && s.melhor_envio_id.trim(),
    );
    const porCodigo = shippings.filter(
      (s) => !s.melhor_envio_id?.trim() && s.codigo_rastreio?.trim(),
    );
    summary.fases.me.total = porMelhorEnvio.length;
    summary.fases.correios.total = porCodigo.length;

    // ── Fase 3a: Melhor Envio ──────────────────────────────────
    if (porMelhorEnvio.length > 0) {
      const orderIds = porMelhorEnvio.map((s) => s.melhor_envio_id.trim());
      console.log(`[CRON-EF] Fase 3a: rastreando ${orderIds.length} via Melhor Envio`);

      try {
        const trackRes = await fetch(`${FUNCTIONS_URL}/rastrear-envio`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({ orderIds }),
        });
        const trackData = await trackRes.json();

        if (trackData.success && trackData.data) {
          for (const shipping of porMelhorEnvio) {
            const info = trackData.data[shipping.melhor_envio_id.trim()];
            if (!info || info.erro) {
              await patchShipping(REST_URL, supabaseHeaders, shipping.id, {
                ultima_atualizacao_rastreio: now,
                rastreio_info: info || { erro: 'sem dados' },
              });
              summary.fases.me.checked++;
              continue;
            }
            const updatePayload: Record<string, unknown> = {
              ultima_atualizacao_rastreio: now,
              rastreio_info: info,
            };
            if (info.status && shouldUpdateStatus(shipping.status, info.status)) {
              updatePayload.status = info.status;
            }
            if (info.codigoRastreio) updatePayload.codigo_rastreio = info.codigoRastreio;
            if (info.linkRastreio) updatePayload.link_rastreio = info.linkRastreio;

            const ok = await patchShipping(
              REST_URL, supabaseHeaders, shipping.id, updatePayload,
            );
            if (ok) {
              if (updatePayload.status) summary.fases.me.updated++;
              summary.fases.me.checked++;
            } else {
              summary.fases.me.errors++;
            }
          }
        } else {
          const errMsg = trackData.error || 'sem dados';
          summary.errors.push(`me: ${errMsg}`);
          summary.fases.me.errors += porMelhorEnvio.length;
          console.error(`[CRON-EF] ME erro: ${errMsg}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        summary.errors.push(`me exception: ${msg}`);
        summary.fases.me.errors += porMelhorEnvio.length;
      }
    }

    // ── Fase 3b: Correios/transportadora por código ─────────────
    if (porCodigo.length > 0) {
      const BATCH_SIZE = 5;
      console.log(`[CRON-EF] Fase 3b: rastreando ${porCodigo.length} por código`);

      for (let i = 0; i < porCodigo.length; i += BATCH_SIZE) {
        const batch = porCodigo.slice(i, i + BATCH_SIZE);
        const codigos = batch.map((s) => s.codigo_rastreio.trim());

        try {
          const trackRes = await fetch(`${FUNCTIONS_URL}/rastrear-envio`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({ codigosRastreio: codigos }),
          });
          const trackData = await trackRes.json();

          if (trackData.success && trackData.data) {
            for (const shipping of batch) {
              const info = trackData.data[shipping.codigo_rastreio.trim()];
              if (!info || info.erro) {
                await patchShipping(REST_URL, supabaseHeaders, shipping.id, {
                  ultima_atualizacao_rastreio: now,
                  rastreio_info: info || { erro: 'sem dados' },
                });
                summary.fases.correios.checked++;
                continue;
              }
              const updatePayload: Record<string, unknown> = {
                ultima_atualizacao_rastreio: now,
                rastreio_info: info,
              };
              if (info.status && shouldUpdateStatus(shipping.status, info.status)) {
                updatePayload.status = info.status;
              }
              if (info.codigoRastreio) updatePayload.codigo_rastreio = info.codigoRastreio;
              if (info.linkRastreio) updatePayload.link_rastreio = info.linkRastreio;

              const ok = await patchShipping(
                REST_URL, supabaseHeaders, shipping.id, updatePayload,
              );
              if (ok) {
                if (updatePayload.status) summary.fases.correios.updated++;
                summary.fases.correios.checked++;
              } else {
                summary.fases.correios.errors++;
              }
            }
          } else {
            const errMsg = trackData.error || 'sem dados';
            summary.errors.push(`correios batch ${i}: ${errMsg}`);
            summary.fases.correios.errors += batch.length;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          summary.errors.push(`correios batch ${i} exception: ${msg}`);
          summary.fases.correios.errors += batch.length;
        }

        if (i + BATCH_SIZE < porCodigo.length) {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    }

    // ── Fase 3c: time alerts (stuck 10+ dias úteis) ─────────────
    try {
      const cutoffDate = new Date();
      let bizDays = 0;
      while (bizDays < 10) {
        cutoffDate.setDate(cutoffDate.getDate() - 1);
        const dow = cutoffDate.getDay();
        if (dow !== 0 && dow !== 6) bizDays++;
      }
      const cutoffISO = cutoffDate.toISOString();

      const stuckQuery = new URLSearchParams({
        select: 'id,nf_numero,status,codigo_rastreio,date,rastreio_info,entrega_local',
        or: '(status.eq.DESPACHADO,status.eq.AGUARDANDO_COLETA)',
        'date': `lt.${cutoffISO}`,
      });
      const stuckRes = await fetch(`${REST_URL}/shippings?${stuckQuery}`, {
        headers: supabaseHeaders,
      });
      const stuckShippings = stuckRes.ok
        ? await stuckRes.json() as Array<Record<string, any>>
        : [];

      for (const s of stuckShippings) {
        const fb = s.rastreio_info?.carrierFallback;
        const isFallbackFailed = fb &&
          (fb.result === 'all-fallbacks-failed' || fb.reason === 'loggi-no-fallback');
        if (!isFallbackFailed) continue;
        if (s.entrega_local) continue;

        const ok = await patchShipping(REST_URL, supabaseHeaders, s.id, {
          status: 'TENTATIVA_ENTREGA',
          ultima_atualizacao_rastreio: now,
          rastreio_info: {
            ...s.rastreio_info,
            timeAlert: {
              reason: 'stuck-10-business-days',
              previousStatus: s.status,
              alertDate: now,
              shippingDate: s.date,
            },
          },
        });
        if (ok) summary.fases.time_alerts.aplicados++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      summary.errors.push(`time_alerts: ${msg}`);
      console.error(`[CRON-EF] Time alerts erro: ${msg}`);
    }

    // ── Fase 4: devoluções → auto-entradas de estoque ──────────
    try {
      const devQuery = new URLSearchParams({
        select: '*',
        tipo: 'eq.devolucao',
        status: 'eq.ENTREGUE',
        entrada_criada: 'eq.false',
      });
      const devRes = await fetch(`${REST_URL}/shippings?${devQuery}`, {
        headers: supabaseHeaders,
      });
      const devolucoes = devRes.ok
        ? await devRes.json() as Array<Record<string, any>>
        : [];
      summary.fases.devolucoes.processadas = devolucoes.length;

      for (const dev of devolucoes) {
        if (!dev.produtos?.length) continue;

        const guardRes = await fetch(
          `${REST_URL}/shippings?id=eq.${dev.id}&entrada_criada=eq.false`,
          {
            method: 'PATCH',
            headers: { ...supabaseHeaders, 'Prefer': 'return=representation' },
            body: JSON.stringify({ entrada_criada: true }),
          },
        );
        const guardData = await guardRes.json() as Array<unknown>;
        if (!guardData?.length) continue;

        const nfDev = `DEV-${dev.nf_numero || ''}`;

        for (const prod of dev.produtos) {
          const sku = prod.produtoEstoque?.sku || prod.sku;
          const quantidade = prod.quantidade;
          if (!sku || !quantidade) {
            summary.fases.devolucoes.erros++;
            continue;
          }

          const dupQuery =
            `sku=eq.${encodeURIComponent(sku)}&or=(nf.eq.${encodeURIComponent(nfDev)},nf.eq.${encodeURIComponent(dev.nf_numero || '')})&select=id&limit=1`;
          const dupRes = await fetch(`${REST_URL}/entries?${dupQuery}`, { headers: supabaseHeaders });
          const dupData = dupRes.ok ? await dupRes.json() as Array<unknown> : [];
          if (dupData.length > 0) continue;

          const skuRes = await fetch(
            `${REST_URL}/products?sku=eq.${encodeURIComponent(sku)}&select=sku`,
            { headers: supabaseHeaders },
          );
          const skuData = skuRes.ok ? await skuRes.json() as Array<unknown> : [];
          if (!skuData?.length) {
            summary.fases.devolucoes.erros++;
            continue;
          }

          const entryPayload = {
            type: 'DEVOLUCAO',
            sku,
            quantity: quantidade,
            supplier: dev.cliente || '',
            nf: nfDev,
            local_entrada: dev.hub_destino || '',
            date: now,
            user_id: 'cron-auto',
          };

          const entryRes = await fetch(`${REST_URL}/entries`, {
            method: 'POST',
            headers: { ...supabaseHeaders, 'Prefer': 'return=minimal' },
            body: JSON.stringify(entryPayload),
          });

          if (entryRes.ok) {
            summary.fases.devolucoes.entradas_criadas++;
          } else {
            summary.fases.devolucoes.erros++;
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      summary.errors.push(`devolucoes: ${msg}`);
      console.error(`[CRON-EF] Devoluções erro: ${msg}`);
    }

    summary.total_atualizados =
      summary.fases.me.updated +
      summary.fases.correios.updated +
      summary.fases.time_alerts.aplicados;
    summary.duration_ms = Date.now() - startedAt;

    console.log(`[CRON-EF] Concluído em ${summary.duration_ms}ms:`, JSON.stringify(summary));
    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    summary.errors.push(`fatal: ${msg}`);
    summary.duration_ms = Date.now() - startedAt;
    console.error(`[CRON-EF] Erro fatal: ${msg}`);
    return new Response(JSON.stringify(summary), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
