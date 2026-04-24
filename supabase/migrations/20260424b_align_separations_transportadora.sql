-- 20260424b — Alinha staging com produção: adiciona coluna transportadora em separations
--
-- Drift detectado em 24/04/2026: prod tem coluna `transportadora` há meses,
-- staging não. Hook `useSeparations.updateSeparation` faz mapping `transportadora`,
-- então submits em staging falhavam com PGRST204 (Could not find the 'transportadora'
-- column of 'separations' in the schema cache).
--
-- Segundo incidente de drift de schema em pouco tempo (Entrega 1 de Devoluções
-- foi o primeiro). Protocolo daqui pra frente: validar schema em AMBOS os
-- ambientes antes de declarar estrutura.
--
-- Escopo: aplicar APENAS em staging (produção já tem a coluna). A migration
-- chave_acesso (20260424_add_chave_acesso_to_separations.sql) é a pendência
-- de prod no próximo merge.

ALTER TABLE public.separations
  ADD COLUMN IF NOT EXISTS transportadora TEXT;

COMMENT ON COLUMN public.separations.transportadora IS
  'Nome da transportadora escolhida para o envio (adicionada para alinhar com produção)';
