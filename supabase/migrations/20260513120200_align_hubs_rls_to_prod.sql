-- Sub-frente 3.0a (Frente 3) — Alinha RLS de `hubs` em staging com prod
--
-- Drift detectado no pre-flight de 13/05/2026:
--   Staging: 1 policy "Allow all for authenticated" (roles=public, cmd=ALL, qual=true)
--   Prod:    4 policies separadas (SELECT/INSERT/UPDATE/DELETE) roles=authenticated
--
-- Esta migration normaliza staging para a forma de prod. Idempotente:
-- em prod e um no-op funcional (DROP+CREATE produz o mesmo conjunto de
-- 4 policies). Em staging, remove a policy unica permissive e cria as
-- 4 separadas equivalentes.
--
-- Nao altera comportamento: as 4 policies de prod aceitam qualquer
-- authenticated (qual=true / with_check=true). O gate admin permanece
-- app-level via useHubs(isStockAdmin) — esta migration nao introduz
-- restricao adicional, apenas alinha a *forma* das policies.
--
-- Confirmado no CP1: trabalho extra grátis para nao propagar drift.

DROP POLICY IF EXISTS "Allow all for authenticated" ON public.hubs;
DROP POLICY IF EXISTS "Allow authenticated read hubs"   ON public.hubs;
DROP POLICY IF EXISTS "Allow authenticated insert hubs" ON public.hubs;
DROP POLICY IF EXISTS "Allow authenticated update hubs" ON public.hubs;
DROP POLICY IF EXISTS "Allow authenticated delete hubs" ON public.hubs;

CREATE POLICY "Allow authenticated read hubs"
  ON public.hubs FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Allow authenticated insert hubs"
  ON public.hubs FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated update hubs"
  ON public.hubs FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated delete hubs"
  ON public.hubs FOR DELETE
  TO authenticated USING (true);
