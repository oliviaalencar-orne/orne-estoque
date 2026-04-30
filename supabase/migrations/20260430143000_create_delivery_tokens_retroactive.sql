-- Migration retroativa: registra schema das tabelas delivery_tokens e
-- delivery_token_shippings que existem em produção desde antes do
-- versionamento via CLI. Em staging, cria as tabelas pela primeira vez.
--
-- Por que retroativa: as tabelas foram criadas no SQL Editor do Supabase
-- diretamente em produção, sem migration versionada. Resultado: drift
-- entre prod e staging (staging não tinha as tabelas), e qualquer
-- redeploy "from scratch" perderia o schema.
--
-- Toda a migration é IDEMPOTENTE:
--   - CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS são nativos.
--   - ALTER TABLE ... ENABLE ROW LEVEL SECURITY é no-op se já habilitado.
--   - CREATE POLICY IF NOT EXISTS NÃO é suportado em PG 17 — usamos o
--     padrão DO $$ ... pg_policies CHECK ... CREATE POLICY ... END $$;
--     que é verdadeiramente no-op em prod.
--
-- Em produção é no-op puro; em staging cria tudo do zero.
--
-- Schema replicado literalmente do que existe em produção
-- (ppslljqxsdsdmwfiayok), inspecionado via pg_attribute, pg_constraint,
-- pg_indexes e pg_policies em 30/04/2026.

-- ──────────────────────────────────────────────────────────────────────
-- Tabela: delivery_tokens
-- ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.delivery_tokens (
  id                  uuid                     NOT NULL DEFAULT gen_random_uuid(),
  token               text                     NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'::text),
  shipping_id         text,
  entregador_nome     text                     DEFAULT ''::text,
  entregador_telefone text                     DEFAULT ''::text,
  status              text                     DEFAULT 'ativo'::text,
  max_uploads         integer                  DEFAULT 5,
  uploads_count       integer                  DEFAULT 0,
  created_at          timestamp with time zone DEFAULT now(),
  expires_at          timestamp with time zone DEFAULT (now() + '48:00:00'::interval),
  used_at             timestamp with time zone,
  CONSTRAINT delivery_tokens_pkey         PRIMARY KEY (id),
  CONSTRAINT delivery_tokens_token_key    UNIQUE (token),
  CONSTRAINT delivery_tokens_status_check CHECK (status = ANY (ARRAY['ativo'::text, 'usado'::text, 'expirado'::text])),
  CONSTRAINT delivery_tokens_shipping_id_fkey
    FOREIGN KEY (shipping_id) REFERENCES public.shippings(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_delivery_tokens_shipping ON public.delivery_tokens USING btree (shipping_id);
CREATE INDEX IF NOT EXISTS idx_delivery_tokens_token    ON public.delivery_tokens USING btree (token);

ALTER TABLE public.delivery_tokens ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'delivery_tokens'
      AND policyname = 'authenticated_manage_tokens'
  ) THEN
    CREATE POLICY authenticated_manage_tokens
      ON public.delivery_tokens
      AS PERMISSIVE
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────
-- Tabela: delivery_token_shippings
-- ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.delivery_token_shippings (
  id            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  token_id      uuid                     NOT NULL,
  shipping_id   text                     NOT NULL,
  fotos         jsonb                    DEFAULT '[]'::jsonb,
  status        text                     DEFAULT 'pendente'::text,
  comprovado_at timestamp with time zone,
  created_at    timestamp with time zone DEFAULT now(),
  CONSTRAINT delivery_token_shippings_pkey         PRIMARY KEY (id),
  CONSTRAINT delivery_token_shippings_token_id_shipping_id_key UNIQUE (token_id, shipping_id),
  CONSTRAINT delivery_token_shippings_status_check CHECK (status = ANY (ARRAY['pendente'::text, 'comprovado'::text])),
  CONSTRAINT delivery_token_shippings_token_id_fkey
    FOREIGN KEY (token_id) REFERENCES public.delivery_tokens(id) ON DELETE CASCADE,
  CONSTRAINT delivery_token_shippings_shipping_id_fkey
    FOREIGN KEY (shipping_id) REFERENCES public.shippings(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_dts_token_id    ON public.delivery_token_shippings USING btree (token_id);
CREATE INDEX IF NOT EXISTS idx_dts_shipping_id ON public.delivery_token_shippings USING btree (shipping_id);

ALTER TABLE public.delivery_token_shippings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'delivery_token_shippings'
      AND policyname = 'authenticated_manage_dts'
  ) THEN
    CREATE POLICY authenticated_manage_dts
      ON public.delivery_token_shippings
      AS PERMISSIVE
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
