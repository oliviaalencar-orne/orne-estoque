-- 20260424 — Adiciona chave_acesso à tabela separations (Import XML NF-e)
--
-- Contexto: o fluxo de Importação por XML (abril 2026) traz a chave de acesso
-- da NF-e (44 dígitos) diretamente do arquivo SEFAZ. Ela é a chave de dedup
-- mais confiável — mais que o numero_nf, que pode se repetir entre emissores.
--
-- shippings já tem coluna chave_acesso (introduzida em fluxo anterior). Este
-- patch equipara separations ao mesmo padrão.
--
-- Política de dedup no import XML:
--   1. Se chave_acesso vier no XML (caso normal): buscar por chave_acesso.
--   2. Senão: fallback para numero_nf.
--
-- Índice parcial: a vasta maioria das separations legadas tem chave_acesso
-- NULL, então índice completo desperdiçaria espaço. WHERE chave_acesso IS
-- NOT NULL mantém lookups O(log n) para novos registros sem custo nos antigos.

ALTER TABLE public.separations
  ADD COLUMN IF NOT EXISTS chave_acesso TEXT NULL;

CREATE INDEX IF NOT EXISTS separations_chave_acesso_idx
  ON public.separations (chave_acesso)
  WHERE chave_acesso IS NOT NULL;

COMMENT ON COLUMN public.separations.chave_acesso IS
  'Chave de acesso da NF-e (44 dígitos). Preenchida pelo fluxo de Import XML. NULL em separations criadas por outros caminhos (Tiny, manual).';
