-- =============================================================================
-- Migration: defeitos_por_nf
-- Data:      2026-04-16
-- Autor:     Olivia (Fase 2.3)
--
-- Objetivo:
--   Permitir marcar defeitos por unidade/NF em vez de apenas no produto inteiro.
--
-- Mudancas estruturais:
--   1. entries.defeito             (boolean, default false)    — NOVO
--   2. entries.defeito_descricao   (text,    default '')       — NOVO
--   3. products.defeitos_por_nf    (jsonb,   default '[]')     — NOVO
--
--   products.defeito permanece como FLAG RESUMO:
--     true sempre que QUALQUER entry do SKU tiver defeito=true.
--     (logica de manutencao ficara no app layer — ver handleSaveEdit
--     em StockView.jsx e flows que criam entries)
--
-- Formato do JSONB defeitos_por_nf:
--   [
--     { "nf": "2305", "descricao": "SOQUETE DANIFICADO", "entry_id": "<uuid>" },
--     ...
--   ]
--   - nf:         string da NF (pode ser '' para entry sem NF)
--   - descricao:  descricao textual do defeito
--   - entry_id:   uuid da entry especifica (pode ser null na entrada generica)
--
-- Backfill:
--   Para cada product com defeito=true hoje (N=1 na producao):
--     1. Casa com entries via (sku = products.sku AND nf = products.nf_origem).
--     2. Se casar, marca essas entries com defeito=true/descricao e as
--        adiciona ao JSONB com entry_id.
--     3. Se nao casar, insere UMA entrada generica em defeitos_por_nf
--        (entry_id = null) preservando a descricao do produto.
--
-- Idempotencia:
--   Todas as operacoes sao safe para rerun:
--     - ADD COLUMN IF NOT EXISTS
--     - CREATE INDEX IF NOT EXISTS
--     - Backfill so atualiza registros ainda nao migrados
--
-- Impacto esperado (medido em 2026-04-16):
--   - products afetados (defeito=true):  1
--   - entries com SKU defeituoso:        varia (1+)
--   - total products:                    10854 (so 1 tera jsonb preenchido)
--   - total entries:                     205
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. PRODUCTS: colunas-base de defeito (no-op em prod; adiciona em staging)
-- -----------------------------------------------------------------------------
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS defeito boolean DEFAULT false;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS defeito_descricao text DEFAULT '';

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS defeito_data timestamp with time zone;

-- -----------------------------------------------------------------------------
-- 1. ENTRIES: novos campos
-- -----------------------------------------------------------------------------
ALTER TABLE entries
  ADD COLUMN IF NOT EXISTS defeito boolean DEFAULT false;

ALTER TABLE entries
  ADD COLUMN IF NOT EXISTS defeito_descricao text DEFAULT '';

-- -----------------------------------------------------------------------------
-- 2. PRODUCTS: novo campo jsonb
-- -----------------------------------------------------------------------------
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS defeitos_por_nf jsonb DEFAULT '[]'::jsonb;

-- -----------------------------------------------------------------------------
-- 3. Indices de suporte
-- -----------------------------------------------------------------------------
-- Indice parcial: consulta rapida de entries defeituosas por SKU
CREATE INDEX IF NOT EXISTS idx_entries_defeito_sku
  ON entries (sku)
  WHERE defeito = true;

-- Indice GIN: consulta/filtro por NF dentro do JSONB
CREATE INDEX IF NOT EXISTS idx_products_defeitos_por_nf_gin
  ON products USING GIN (defeitos_por_nf);

-- -----------------------------------------------------------------------------
-- 4. BACKFILL parte 1: marca entries casadas como defeituosas
-- -----------------------------------------------------------------------------
-- Heuristica de matching: products.nf_origem == entries.nf (mesmo SKU)
-- Idempotente: condicao "e.defeito IS DISTINCT FROM true" evita rerun-updates
UPDATE entries e
SET
  defeito = true,
  defeito_descricao = COALESCE(NULLIF(p.defeito_descricao, ''), '')
FROM products p
WHERE e.sku = p.sku
  AND p.defeito = true
  AND p.nf_origem IS NOT NULL
  AND p.nf_origem <> ''
  AND e.nf = p.nf_origem
  AND e.defeito IS DISTINCT FROM true;

-- -----------------------------------------------------------------------------
-- 5. BACKFILL parte 2: popula products.defeitos_por_nf
-- -----------------------------------------------------------------------------
-- Estrategia:
--   Caso A — existem entries marcadas com defeito=true para esse SKU
--            => gera array com uma entrada por entry (com entry_id)
--   Caso B — nao ha entries casadas
--            => gera UMA entrada generica (entry_id=null) com nf_origem/descricao do produto
-- Idempotente: so atualiza produtos com defeitos_por_nf vazio/null
UPDATE products p
SET defeitos_por_nf = COALESCE(
  -- Caso A
  (
    SELECT jsonb_agg(
      jsonb_build_object(
        'nf',        COALESCE(NULLIF(e.nf, ''), ''),
        'descricao', COALESCE(NULLIF(e.defeito_descricao, ''), NULLIF(p.defeito_descricao, ''), ''),
        'entry_id',  e.id::text
      )
      ORDER BY e.date DESC
    )
    FROM entries e
    WHERE e.sku = p.sku
      AND e.defeito = true
  ),
  -- Caso B
  jsonb_build_array(
    jsonb_build_object(
      'nf',        COALESCE(NULLIF(p.nf_origem, ''), ''),
      'descricao', COALESCE(NULLIF(p.defeito_descricao, ''), ''),
      'entry_id',  NULL
    )
  )
)
WHERE p.defeito = true
  AND (p.defeitos_por_nf IS NULL OR p.defeitos_por_nf = '[]'::jsonb);

-- -----------------------------------------------------------------------------
-- 6. Relatorio pos-migracao (apenas NOTICE, nao bloqueia)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_entries_defeito     int;
  v_products_defeito    int;
  v_products_com_jsonb  int;
BEGIN
  SELECT COUNT(*) INTO v_entries_defeito
    FROM entries WHERE defeito = true;

  SELECT COUNT(*) INTO v_products_defeito
    FROM products WHERE defeito = true;

  SELECT COUNT(*) INTO v_products_com_jsonb
    FROM products WHERE jsonb_array_length(defeitos_por_nf) > 0;

  RAISE NOTICE '--------------------------------------------------------';
  RAISE NOTICE ' Migration defeitos_por_nf — resultado:';
  RAISE NOTICE '   entries com defeito=true ........... %', v_entries_defeito;
  RAISE NOTICE '   products com defeito=true .......... %', v_products_defeito;
  RAISE NOTICE '   products com defeitos_por_nf [>0] .. %', v_products_com_jsonb;
  RAISE NOTICE '--------------------------------------------------------';
END $$;

COMMIT;

-- =============================================================================
-- ROLLBACK (executar manualmente se necessario — NAO faz parte da migration)
-- =============================================================================
-- BEGIN;
--   DROP INDEX IF EXISTS idx_products_defeitos_por_nf_gin;
--   DROP INDEX IF EXISTS idx_entries_defeito_sku;
--   ALTER TABLE products DROP COLUMN IF EXISTS defeitos_por_nf;
--   ALTER TABLE entries  DROP COLUMN IF EXISTS defeito_descricao;
--   ALTER TABLE entries  DROP COLUMN IF EXISTS defeito;
-- COMMIT;
