-- Sub-frente 3.0a (Frente 3) — Tabela `motivos_devolucao` editavel pelo admin
--
-- Substitui a constante hardcoded em DevolucaoForm.jsx:10-16 por uma
-- fonte editavel sem deploy. Decisao #5 do plano v1.1.
--
-- Padrao RLS: 4 policies separadas (SELECT/INSERT/UPDATE/DELETE) seguindo
-- a forma de prod-hubs. SELECT liberado para qualquer authenticated;
-- mutacoes restritas a is_stock_admin() — defense in depth alem do
-- guard app-level no hook. Confirmado no CP1 (2026-05-13).
--
-- Seed: 5 motivos historicos (Defeito, Arrependimento, Produto errado,
-- Avaria no transporte, Outro), cobrindo 100% das 84 devolucoes em prod
-- com motivo preenchido (distribuicao validada no pre-flight).
--
-- `motivo_devolucao` em `shippings` permanece como texto livre (sem FK)
-- — desativar motivo NAO quebra historico (Risco R4 do plano).

CREATE TABLE public.motivos_devolucao (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  nome text NOT NULL UNIQUE,
  ativo boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.motivos_devolucao IS
  'Motivos de devolucao editaveis pelo admin (Sub-frente 3.0a). '
  'Consumido por DevolucaoForm, ShippingList (edit modal) e TinyNFeImport '
  'via hook useMotivosDevolucao. Desativar (ativo=false) oculta de novos '
  'cadastros sem afetar shippings.motivo_devolucao historico.';

CREATE TRIGGER motivos_devolucao_updated_at
  BEFORE UPDATE ON public.motivos_devolucao
  FOR EACH ROW EXECUTE FUNCTION moddatetime('updated_at');

ALTER TABLE public.motivos_devolucao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read motivos_devolucao"
  ON public.motivos_devolucao FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Stock admins insert motivos_devolucao"
  ON public.motivos_devolucao FOR INSERT
  TO authenticated WITH CHECK (is_stock_admin());

CREATE POLICY "Stock admins update motivos_devolucao"
  ON public.motivos_devolucao FOR UPDATE
  TO authenticated USING (is_stock_admin()) WITH CHECK (is_stock_admin());

CREATE POLICY "Stock admins delete motivos_devolucao"
  ON public.motivos_devolucao FOR DELETE
  TO authenticated USING (is_stock_admin());

INSERT INTO public.motivos_devolucao (nome, ordem) VALUES
  ('Defeito', 1),
  ('Arrependimento', 2),
  ('Produto errado', 3),
  ('Avaria no transporte', 4),
  ('Outro', 5)
ON CONFLICT (nome) DO NOTHING;
