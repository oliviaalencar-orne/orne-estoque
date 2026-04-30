-- Migration retroativa: registra fundações de RLS que existem em produção
-- desde antes do versionamento via CLI mas não tinham migration versionada
-- em supabase/migrations/. Em staging, cria-as pela primeira vez.
--
-- Itens:
--   F3) FK  public.user_profiles.id → auth.users(id) ON DELETE CASCADE
--       Crítico: sem essa FK, staging permite user_profile órfão (sem
--       auth.users correspondente), e DELETE em auth.users não cascata
--       para user_profiles.
--
--   D1) Função public.is_operador() — usada por policies RLS de prod
--       em separations, exits, shippings. Sem ela, staging não consegue
--       reproduzir comportamento de RLS por role 'operador'.
--
-- Toda a migration é IDEMPOTENTE:
--   - CREATE OR REPLACE FUNCTION é idempotente nativo.
--   - ALTER TABLE ADD CONSTRAINT IF NOT EXISTS não existe em Postgres,
--     então usamos o padrão DO $$ BEGIN IF NOT EXISTS (SELECT FROM
--     pg_constraint ...) THEN ALTER TABLE ... END $$;
--
-- Em produção é no-op puro (FK e função já existem); em staging cria.
--
-- Schema replicado literalmente do que existe em produção
-- (ppslljqxsdsdmwfiayok), inspecionado via pg_proc, pg_constraint
-- em 30/04/2026.

-- ──────────────────────────────────────────────────────────────────────
-- D1: Função is_operador()
-- ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_operador()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid()
      AND role = 'operador'
      AND status = 'approved'
  );
END;
$function$;

-- ──────────────────────────────────────────────────────────────────────
-- F3: FK user_profiles_id_fkey → auth.users(id) ON DELETE CASCADE
-- ──────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'user_profiles_id_fkey'
      AND conrelid = 'public.user_profiles'::regclass
  ) THEN
    ALTER TABLE public.user_profiles
      ADD CONSTRAINT user_profiles_id_fkey
      FOREIGN KEY (id)
      REFERENCES auth.users(id)
      ON DELETE CASCADE;
  END IF;
END $$;
