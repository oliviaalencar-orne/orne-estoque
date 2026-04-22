-- 20260422 — pg_cron + pg_net como redundância do Vercel Cron para update-tracking
--
-- Contexto: Vercel Hobby cron falhou ~55% dos dias (17, 19, 20, 22/04).
-- Solução: pg_cron invoca a mesma rota Vercel (/api/cron/update-tracking)
-- via pg_net 2x/dia. Zero mudança de lógica — apenas novo gatilho redundante.
--
-- Plano de rollout:
--   1. Esta migration: habilita extensões + função + agenda (3 dias dual-run).
--   2. Após 3 dias de cobertura garantida: remover cron Vercel do vercel.json.
--
-- Logs: SELECT * FROM cron.job_run_details ORDER BY start_time DESC;
--       SELECT * FROM net._http_response ORDER BY created DESC LIMIT 20;
--
-- Secret esperado no vault com nome 'vercel_cron_secret' — setar via:
--   SELECT vault.create_secret('<valor_do_CRON_SECRET>', 'vercel_cron_secret',
--          'Shared secret entre Vercel Cron e pg_cron para /api/cron/update-tracking');

-- 1. Extensões
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Função que dispara a rota Vercel de update-tracking.
--
-- Lê o secret do vault e faz HTTP POST assíncrono via pg_net. Retorna
-- o request_id (pg_net) para que o logger do pg_cron registre uma
-- referência rastreável em cron.job_run_details.
CREATE OR REPLACE FUNCTION public.trigger_vercel_cron_update_tracking()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, net
AS $$
DECLARE
  v_secret text;
  v_request_id bigint;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'vercel_cron_secret'
  LIMIT 1;

  IF v_secret IS NULL THEN
    RAISE EXCEPTION 'Secret vercel_cron_secret não encontrado no vault — rode vault.create_secret(...) antes';
  END IF;

  SELECT net.http_post(
    url     := 'https://estoque.ornedecor.com/api/cron/update-tracking',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_secret,
      'Content-Type',  'application/json',
      'x-triggered-by','pg_cron'
    ),
    body        := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_vercel_cron_update_tracking() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trigger_vercel_cron_update_tracking() TO postgres;

COMMENT ON FUNCTION public.trigger_vercel_cron_update_tracking() IS
  'pg_cron job: dispara /api/cron/update-tracking na Vercel com CRON_SECRET lido do vault. Redundância para Vercel Hobby cron instável. Ver 20260422_pg_cron_update_tracking.sql.';

-- 3. Agenda 2x/dia (08h BRT = 11 UTC, 18h BRT = 21 UTC)
--
-- ATENÇÃO: só agenda se o vault tiver o secret. Caso contrário levanta NOTICE.
-- Se a migration for re-aplicada, cron.schedule substitui a job de mesmo nome.
DO $$
DECLARE
  v_has_secret boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM vault.decrypted_secrets WHERE name = 'vercel_cron_secret'
  ) INTO v_has_secret;

  IF v_has_secret THEN
    PERFORM cron.schedule(
      'vercel-update-tracking-08h-brt',
      '0 11 * * *',
      $cron$SELECT public.trigger_vercel_cron_update_tracking();$cron$
    );
    PERFORM cron.schedule(
      'vercel-update-tracking-18h-brt',
      '0 21 * * *',
      $cron$SELECT public.trigger_vercel_cron_update_tracking();$cron$
    );
    RAISE NOTICE 'pg_cron jobs agendadas: vercel-update-tracking-08h-brt e -18h-brt';
  ELSE
    RAISE NOTICE 'Secret vercel_cron_secret ausente — jobs NÃO agendadas. Rode vault.create_secret(...) e depois re-execute os cron.schedule manualmente.';
  END IF;
END
$$;
