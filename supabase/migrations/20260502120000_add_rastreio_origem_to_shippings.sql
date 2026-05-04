-- Adiciona coluna rastreio_origem em shippings com 3 valores possíveis:
--
--   'auto_me'  → vínculo direto via integração Melhor Envio.
--                Cron pode/deve atualizar via API ME.
--                Backfill: shippings com melhor_envio_id preenchido.
--
--   'manual'   → operador adiciona/atualiza rastreio manualmente.
--                Cron pula esses shippings — sistema reconhece que
--                rastreio é responsabilidade do operador.
--                Backfill: shippings sem melhor_envio_id (default).
--
--   'externo'  → rastreio gerenciado por sistema externo (uso futuro,
--                ex: integração Total Express). Cron também pula.
--
-- Contexto: a função searchME na EF rastrear-envio assumia que o
-- parâmetro `?q=` da API ME busca em todos os campos (incluindo nota
-- fiscal). Documentação oficial confirma que `q` busca apenas em
-- id|protocol|document|tracking|authorization_code — NF não está nessa
-- lista. Logo, ~50% dos shippings novos sem melhor_envio_id direto na
-- criação ficavam órfãos do cron, sem rastreio puxado.
--
-- Esta coluna torna o sistema honesto sobre quais shippings podem
-- ser tracked automaticamente. CHECK constraint obrigatório protege
-- contra valores inválidos no futuro.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS, padrão DO $$ BEGIN IF NOT
-- EXISTS ... CHECK ... END $$ para constraint, UPDATE com WHERE
-- baseado em estado atual (não-destrutivo se rodar 2x).

-- ──────────────────────────────────────────────────────────────────────
-- 1. Coluna com default 'manual' (caso seguro)
-- ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.shippings
  ADD COLUMN IF NOT EXISTS rastreio_origem text DEFAULT 'manual';

-- ──────────────────────────────────────────────────────────────────────
-- 2. CHECK constraint (idempotente via DO $$)
-- ──────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'shippings_rastreio_origem_check'
      AND conrelid = 'public.shippings'::regclass
  ) THEN
    ALTER TABLE public.shippings
      ADD CONSTRAINT shippings_rastreio_origem_check
      CHECK (rastreio_origem IN ('auto_me', 'manual', 'externo'));
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────
-- 3. Backfill heurístico (idempotente: WHERE rastreio_origem IS NULL OR = 'manual')
--    Heurística: shippings com melhor_envio_id preenchido vieram via
--    integração ME, logo são auto_me. Os demais permanecem manual
--    (default da coluna).
-- ──────────────────────────────────────────────────────────────────────
UPDATE public.shippings
SET rastreio_origem = 'auto_me'
WHERE melhor_envio_id IS NOT NULL
  AND melhor_envio_id <> ''
  AND rastreio_origem = 'manual';
