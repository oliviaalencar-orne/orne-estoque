/**
 * Vercel Cron Job — Atualização automática de rastreios
 *
 * Executa diariamente às 11:00 UTC / 08:00 BRT (configurado no vercel.json).
 * Busca shippings com status DESPACHADO ou EM_TRANSITO que possuem
 * código de rastreio ou melhorEnvioId, e chama a Edge Function
 * `rastrear-envio` para atualizar o status automaticamente.
 *
 * Env vars necessárias (Vercel → Settings → Environment Variables):
 *   CRON_SECRET              — Vercel Cron secret (verificação automática)
 *   SUPABASE_URL             — URL do projeto Supabase
 *   SUPABASE_SERVICE_ROLE_KEY — Service role key (acesso admin ao DB + Edge Functions)
 *
 * A Edge Function `rastrear-envio` também precisa de:
 *   MELHOR_ENVIO_TOKEN       — Token do Melhor Envio (configurar em Supabase → Edge Function Secrets)
 */

const VALID_STATUSES = ['DESPACHADO', 'AGUARDANDO_COLETA', 'EM_TRANSITO', 'SAIU_ENTREGA', 'TENTATIVA_ENTREGA', 'ENTREGUE', 'DEVOLVIDO'];

// Progressão válida — só avança, nunca retrocede
const STATUS_RANK = {
  DESPACHADO: 0,
  AGUARDANDO_COLETA: 0.5,
  EM_TRANSITO: 1,
  SAIU_ENTREGA: 2,
  TENTATIVA_ENTREGA: 2,
  ENTREGUE: 3,
  DEVOLVIDO: 3, // mesmo nível que ENTREGUE (final)
};

function shouldUpdateStatus(currentStatus, newStatus) {
  if (!VALID_STATUSES.includes(newStatus)) return false;
  if (currentStatus === 'ENTREGUE' || currentStatus === 'DEVOLVIDO') return false;
  return (STATUS_RANK[newStatus] ?? -1) > (STATUS_RANK[currentStatus] ?? -1);
}

/**
 * Helper: update a shipping record in Supabase.
 * Always writes ultima_atualizacao_rastreio so we know the cron ran.
 */
async function patchShipping(restUrl, headers, shippingId, payload) {
  const res = await fetch(`${restUrl}/shippings?id=eq.${shippingId}`, {
    method: 'PATCH',
    headers: { ...headers, 'Prefer': 'return=minimal' },
    body: JSON.stringify(payload),
  });
  return res.ok;
}

export default async function handler(req, res) {
  // --- Segurança: verificar CRON_SECRET ---
  const authHeader = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    console.error('[CRON] Unauthorized request — missing or invalid CRON_SECRET');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('[CRON] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;
  const REST_URL = `${SUPABASE_URL}/rest/v1`;

  const supabaseHeaders = {
    'apikey': SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };

  try {
    // 1. Buscar shippings pendentes de atualização (4 status ativos)
    const query = new URLSearchParams({
      select: 'id,nf_numero,cliente,status,codigo_rastreio,melhor_envio_id,transportadora,entrega_local',
      or: '(status.eq.DESPACHADO,status.eq.AGUARDANDO_COLETA,status.eq.EM_TRANSITO,status.eq.SAIU_ENTREGA,status.eq.TENTATIVA_ENTREGA)',
    });

    const shippingsRes = await fetch(`${REST_URL}/shippings?${query}`, {
      headers: supabaseHeaders,
    });

    if (!shippingsRes.ok) {
      const errText = await shippingsRes.text();
      console.error('[CRON] Erro ao buscar shippings:', shippingsRes.status, errText);
      return res.status(500).json({ error: 'Failed to fetch shippings' });
    }

    const allShippingsRaw = await shippingsRes.json();
    // Filter out local deliveries (entrega_local=true) — they don't need tracking
    const allShippings = allShippingsRaw.filter(s => !s.entrega_local);
    const now = new Date().toISOString();
    console.log(`[CRON] ${allShippingsRaw.length} pendentes total, ${allShippingsRaw.length - allShippings.length} entregas locais ignoradas`);

    // ── Step 1.5: NF search — find tracking for shippings without codes ──
    const semRastreio = allShippings.filter(
      s => (!s.codigo_rastreio || !s.codigo_rastreio.trim()) &&
           (!s.melhor_envio_id || !s.melhor_envio_id.trim()) &&
           s.nf_numero && s.nf_numero.trim() &&
           s.status === 'DESPACHADO'
    );

    let nfFound = 0;
    if (semRastreio.length > 0) {
      console.log(`[CRON] Buscando rastreio por NF para ${semRastreio.length} despachos sem código`);
      // Process in batches of 10 (Edge Function limit)
      for (let i = 0; i < semRastreio.length; i += 10) {
        const batch = semRastreio.slice(i, i + 10);
        const nfNumbers = batch.map(s => s.nf_numero.trim());
        const clientes = {};
        for (const s of batch) {
          if (s.cliente) clientes[s.nf_numero.trim()] = s.cliente;
        }
        try {
          const payload = { buscarPorNF: nfNumbers };
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
                // Edge Function already saved to DB, but update local record too
                const payload = { ultima_atualizacao_rastreio: now };
                if (result.codigo_rastreio) payload.codigo_rastreio = result.codigo_rastreio;
                if (result.melhor_envio_id) payload.melhor_envio_id = result.melhor_envio_id;
                if (result.link_rastreio) payload.link_rastreio = result.link_rastreio;
                if (result.transportadora) payload.transportadora = result.transportadora;
                await patchShipping(REST_URL, supabaseHeaders, shipping.id, payload);
                // Update local object so step 2 can track it
                if (result.melhor_envio_id) shipping.melhor_envio_id = result.melhor_envio_id;
                if (result.codigo_rastreio) shipping.codigo_rastreio = result.codigo_rastreio;
                console.log(`[CRON] NF ${shipping.nf_numero}: encontrado ${result.codigo_rastreio} (${result.transportadora})`);
                nfFound++;
              }
            }
          }
        } catch (err) {
          console.error('[CRON] Erro ao buscar NFs:', err.message);
        }
        // Rate limit between batches
        if (i + 10 < semRastreio.length) {
          await new Promise(r => setTimeout(r, 2000));
        }
      }
      console.log(`[CRON] Busca por NF: ${nfFound} encontrados de ${semRastreio.length}`);
    }

    // Filtrar: precisa ter código de rastreio OU melhor_envio_id
    const shippings = allShippings.filter(
      s => (s.codigo_rastreio && s.codigo_rastreio.trim()) || (s.melhor_envio_id && s.melhor_envio_id.trim())
    );

    console.log(`[CRON] Encontrados ${shippings.length} despachos para rastrear (de ${allShippings.length} pendentes)`);

    if (shippings.length === 0) {
      return res.status(200).json({ message: 'Nenhum despacho para rastrear', updated: 0 });
    }

    // 2. Separar por tipo de rastreio
    const porMelhorEnvio = shippings.filter(s => s.melhor_envio_id && s.melhor_envio_id.trim());
    const porCodigo = shippings.filter(s => !s.melhor_envio_id?.trim() && s.codigo_rastreio?.trim());

    let updated = 0;
    let checked = 0;
    let errors = 0;

    // 3a. Rastrear via Melhor Envio (em batch — a API aceita array)
    if (porMelhorEnvio.length > 0) {
      const orderIds = porMelhorEnvio.map(s => s.melhor_envio_id.trim());
      console.log(`[CRON] Rastreando ${orderIds.length} via Melhor Envio`);

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
              console.log(`[CRON] ${shipping.nf_numero}: ${info?.erro || 'sem dados'}`);
              // Still mark as checked so we know the cron ran
              await patchShipping(REST_URL, supabaseHeaders, shipping.id, {
                ultima_atualizacao_rastreio: now,
                rastreio_info: info || { erro: 'sem dados' },
              });
              checked++;
              continue;
            }

            const updatePayload = {
              ultima_atualizacao_rastreio: now,
              rastreio_info: info,
            };

            if (info.status && shouldUpdateStatus(shipping.status, info.status)) {
              updatePayload.status = info.status;
              console.log(`[CRON] ${shipping.nf_numero}: ${shipping.status} → ${info.status}`);
            } else {
              console.log(`[CRON] ${shipping.nf_numero}: sem mudança (${shipping.status} → ${info.status || 'N/A'})`);
            }
            // Always save tracking code and link if available
            if (info.codigoRastreio) updatePayload.codigo_rastreio = info.codigoRastreio;
            if (info.linkRastreio) updatePayload.link_rastreio = info.linkRastreio;

            const ok = await patchShipping(REST_URL, supabaseHeaders, shipping.id, updatePayload);
            if (ok) {
              if (updatePayload.status) updated++;
              checked++;
            } else {
              errors++;
            }
          }
        } else {
          console.error('[CRON] Erro na resposta do Melhor Envio:', trackData.error || 'sem dados');
          errors += porMelhorEnvio.length;
        }
      } catch (err) {
        console.error('[CRON] Erro ao chamar rastrear-envio (Melhor Envio):', err.message);
        errors += porMelhorEnvio.length;
      }
    }

    // 3b. Rastrear por código de rastreio (Correios/transportadora) — em batches de 5
    if (porCodigo.length > 0) {
      const BATCH_SIZE = 5;
      console.log(`[CRON] Rastreando ${porCodigo.length} por código de rastreio`);

      for (let i = 0; i < porCodigo.length; i += BATCH_SIZE) {
        const batch = porCodigo.slice(i, i + BATCH_SIZE);
        const codigos = batch.map(s => s.codigo_rastreio.trim());

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
                console.log(`[CRON] ${shipping.nf_numero}: ${info?.erro || 'sem dados'}`);
                // Still mark as checked
                await patchShipping(REST_URL, supabaseHeaders, shipping.id, {
                  ultima_atualizacao_rastreio: now,
                  rastreio_info: info || { erro: 'sem dados' },
                });
                checked++;
                continue;
              }

              const updatePayload = {
                ultima_atualizacao_rastreio: now,
                rastreio_info: info,
              };

              if (info.status && shouldUpdateStatus(shipping.status, info.status)) {
                updatePayload.status = info.status;
                console.log(`[CRON] ${shipping.nf_numero}: ${shipping.status} → ${info.status}`);
              } else {
                console.log(`[CRON] ${shipping.nf_numero}: sem mudança (${shipping.status} → ${info.status || 'N/A'})`);
              }
              // Always save tracking code and link if available
              if (info.codigoRastreio) updatePayload.codigo_rastreio = info.codigoRastreio;
              if (info.linkRastreio) updatePayload.link_rastreio = info.linkRastreio;

              const ok = await patchShipping(REST_URL, supabaseHeaders, shipping.id, updatePayload);
              if (ok) {
                if (updatePayload.status) updated++;
                checked++;
              } else {
                errors++;
              }
            }
          } else {
            console.error('[CRON] Erro na resposta (código rastreio):', trackData.error || 'sem dados');
            errors += batch.length;
          }
        } catch (err) {
          console.error('[CRON] Erro ao chamar rastrear-envio (código):', err.message);
          errors += batch.length;
        }

        // Delay entre batches para respeitar rate limits
        if (i + BATCH_SIZE < porCodigo.length) {
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }

    // 4. Auto-create stock entries for devoluções that reached ENTREGUE
    let devEntriesCreated = 0;
    let devEntriesErrors = 0;
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
      const devolucoes = devRes.ok ? await devRes.json() : [];

      for (const dev of devolucoes) {
        if (!dev.produtos?.length) continue;

        // Atomic guard: flip entrada_criada
        const guardRes = await fetch(
          `${REST_URL}/shippings?id=eq.${dev.id}&entrada_criada=eq.false`,
          {
            method: 'PATCH',
            headers: { ...supabaseHeaders, 'Prefer': 'return=representation' },
            body: JSON.stringify({ entrada_criada: true }),
          }
        );
        const guardData = await guardRes.json();
        if (!guardData?.length) continue; // already claimed

        const nfDev = `DEV-${dev.nf_numero || ''}`;

        for (const prod of dev.produtos) {
          const sku = prod.produtoEstoque?.sku || prod.sku;
          const quantidade = prod.quantidade;
          if (!sku || !quantidade) { devEntriesErrors++; continue; }

          // Check for existing entry (avoid duplicates from manual entries)
          const dupQuery = `sku=eq.${encodeURIComponent(sku)}&or=(nf.eq.${encodeURIComponent(nfDev)},nf.eq.${encodeURIComponent(dev.nf_numero || '')})&select=id&limit=1`;
          const dupRes = await fetch(`${REST_URL}/entries?${dupQuery}`, { headers: supabaseHeaders });
          const dupData = dupRes.ok ? await dupRes.json() : [];
          if (dupData.length > 0) {
            console.log(`[CRON] Entrada já existe para SKU ${sku} NF ${nfDev}, pulando`);
            continue;
          }

          // Verify SKU exists
          const skuRes = await fetch(`${REST_URL}/products?sku=eq.${encodeURIComponent(sku)}&select=sku`, {
            headers: supabaseHeaders,
          });
          const skuData = await skuRes.json();
          if (!skuData?.length) {
            console.warn(`[CRON] Devolução SKU não encontrado: ${sku}`);
            devEntriesErrors++;
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
            devEntriesCreated++;
            console.log(`[CRON] Entrada devolução criada: ${sku} x${quantidade} (NF: DEV-${dev.nf_numero})`);
          } else {
            devEntriesErrors++;
            console.error(`[CRON] Erro ao criar entrada devolução: ${await entryRes.text()}`);
          }
        }
      }
      if (devolucoes.length > 0) {
        console.log(`[CRON] Devoluções processadas: ${devolucoes.length}, entradas criadas: ${devEntriesCreated}, erros: ${devEntriesErrors}`);
      }
    } catch (err) {
      console.error('[CRON] Erro ao processar devoluções:', err.message);
    }

    const summary = {
      message: 'Cron job concluído',
      total: shippings.length,
      nfSearched: semRastreio.length,
      nfFound,
      melhorEnvio: porMelhorEnvio.length,
      codigoRastreio: porCodigo.length,
      checked,
      updated,
      errors,
      devEntriesCreated,
      devEntriesErrors,
      timestamp: now,
    };

    console.log('[CRON] Resumo:', JSON.stringify(summary));
    return res.status(200).json(summary);
  } catch (err) {
    console.error('[CRON] Erro geral:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
