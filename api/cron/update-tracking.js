/**
 * Vercel Cron Job — disparador leve para a EF `cron-update-tracking`.
 *
 * A orquestração do cron foi movida para a Edge Function do Supabase
 * (ver `supabase/functions/cron-update-tracking/index.ts`) porque o
 * endpoint Vercel Hobby tem teto de 60s e estourava 504 quando havia
 * ~280+ pendentes. A EF tem teto ~150-400s e cabe folgadamente.
 *
 * Este wrapper:
 *   1. Valida o Bearer CRON_SECRET (chamada do Vercel Cron ou pg_cron).
 *   2. Chama a EF com SUPABASE_SERVICE_ROLE_KEY.
 *   3. Devolve tal qual a resposta da EF (status + body).
 *
 * Env vars necessárias:
 *   CRON_SECRET                — shared secret entre chamador e Vercel
 *   SUPABASE_URL               — URL do projeto Supabase (staging/prod)
 *   SUPABASE_SERVICE_ROLE_KEY  — autentica o wrapper perante a EF
 */
export default async function handler(req, res) {
  const authHeader = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    console.error('[CRON] Unauthorized — missing or invalid CRON_SECRET');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('[CRON] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  const efUrl = `${SUPABASE_URL}/functions/v1/cron-update-tracking`;
  const startedAt = Date.now();

  try {
    const efRes = await fetch(efUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });

    const duration = Date.now() - startedAt;
    const bodyText = await efRes.text();
    let body;
    try { body = JSON.parse(bodyText); } catch { body = { raw: bodyText }; }

    console.log(`[CRON] EF responded ${efRes.status} em ${duration}ms`);
    return res.status(efRes.status).json({
      wrapper: { duration_ms: duration, ef_status: efRes.status },
      ef: body,
    });
  } catch (err) {
    const duration = Date.now() - startedAt;
    console.error(`[CRON] Erro ao chamar EF: ${err.message}`);
    return res.status(502).json({
      wrapper: { duration_ms: duration, error: err.message },
    });
  }
}
