-- 20260423 — Disparador pg_cron direto para cron-update-tracking EF
--
-- Contexto: o disparador anterior (trigger_vercel_cron_update_tracking)
-- chama o wrapper Vercel, que tem teto de 60s no plano Hobby. A EF
-- cron-update-tracking tem teto de 150s e frequentemente passa de 60s
-- (112s observados em prod com 259 pendentes). Resultado: o trabalho
-- é feito mas o return path perde a resposta, gerando timeout falso
-- em net._http_response.
--
-- Esta função chama a EF direto via pg_net, dentro da rede do Supabase,
-- sem passar pela Vercel. Usa production_service_role_key do vault (JWT
-- legacy) que a EF valida em verify_jwt=true + check interno de role.
--
-- timeout_milliseconds := 160000 dá 10s de margem sobre o teto da EF.
--
-- Logs:
--   SELECT * FROM cron.job_run_details ORDER BY start_time DESC;
--   SELECT * FROM net._http_response ORDER BY created DESC LIMIT 20;

CREATE OR REPLACE FUNCTION public.trigger_cron_update_tracking_ef()
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
  WHERE name = 'production_service_role_key'
  LIMIT 1;

  IF v_secret IS NULL THEN
    RAISE EXCEPTION 'Secret production_service_role_key não encontrado no vault — rode vault.create_secret(...) antes';
  END IF;

  SELECT net.http_post(
    url     := 'https://ppslljqxsdsdmwfiayok.supabase.co/functions/v1/cron-update-tracking',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_secret,
      'Content-Type',  'application/json',
      'x-triggered-by','pg_cron_ef_direct'
    ),
    body        := '{}'::jsonb,
    timeout_milliseconds := 160000
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_cron_update_tracking_ef() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trigger_cron_update_tracking_ef() TO postgres;

COMMENT ON FUNCTION public.trigger_cron_update_tracking_ef() IS
  'pg_cron: chama cron-update-tracking EF direto via pg_net, bypassing Vercel wrapper (teto 60s). Secret JWT legacy lido do vault (production_service_role_key). Ver 20260423_trigger_cron_ef_direct.sql.';
