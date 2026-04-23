-- 20260423b — Re-agendar pg_cron para 4 execuções/dia apontando para EF direto
--
-- Contexto: substituir os 2 jobs antigos (trigger_vercel_cron_update_tracking,
-- que passava pelo wrapper Vercel com teto de 60s) por 4 jobs espaçados no
-- expediente, apontando para trigger_cron_update_tracking_ef (direto no EF,
-- teto de 150s com visibilidade completa do return path).
--
-- Distribuição dos 4 horários (BRT = UTC-3):
--   08h BRT = 11 UTC  — início do expediente
--   12h BRT = 15 UTC  — pico do expediente
--   16h BRT = 19 UTC  — fim da tarde
--   20h BRT = 23 UTC  — noite, pega últimas atualizações do dia
--
-- Mesma rota chamada 4x/dia resolve a latência de detecção de status
-- (se um pacote entrega às 10h, não precisa esperar até 18h no dia seguinte
-- para o sistema saber).
--
-- Idempotente: cron.unschedule e cron.schedule não falham se o estado já
-- corresponder ao desejado. Pode re-rodar com segurança.

-- 1. Desativar quaisquer jobs que ainda apontem para o trigger antigo
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT jobid, jobname FROM cron.job
           WHERE command LIKE '%trigger_vercel_cron_update_tracking%' LOOP
    PERFORM cron.unschedule(r.jobid);
    RAISE NOTICE 'Unscheduled legacy job: % (id=%)', r.jobname, r.jobid;
  END LOOP;
END $$;

-- 2. Criar/substituir os 4 jobs novos
SELECT cron.schedule(
  'cron-ef-08h-brt', '0 11 * * *',
  $cron$SELECT public.trigger_cron_update_tracking_ef();$cron$
);
SELECT cron.schedule(
  'cron-ef-12h-brt', '0 15 * * *',
  $cron$SELECT public.trigger_cron_update_tracking_ef();$cron$
);
SELECT cron.schedule(
  'cron-ef-16h-brt', '0 19 * * *',
  $cron$SELECT public.trigger_cron_update_tracking_ef();$cron$
);
SELECT cron.schedule(
  'cron-ef-20h-brt', '0 23 * * *',
  $cron$SELECT public.trigger_cron_update_tracking_ef();$cron$
);
