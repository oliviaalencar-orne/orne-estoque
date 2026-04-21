-- Fase 1 de Confiança de Rastreio: campo para verificação manual
-- de envios suspeitos. JSONB nullable, compatível com registros existentes.
--
-- Estrutura esperada:
--   {
--     decisao: 'confirmado_entregue' | 'ainda_em_transito',
--     por_usuario_id: uuid,
--     por_usuario_role: 'admin' | 'operador',
--     data: ISO8601,
--     nota: texto opcional,
--     historico: [ { decisao, data, por_usuario_id, nota } ]
--   }
--
-- RLS: policy de UPDATE em shippings já cobre admin+operador.

ALTER TABLE shippings
  ADD COLUMN IF NOT EXISTS verificacao_manual JSONB;

-- Índice parcial para filtrar rapidamente por decisão quando há verificação.
CREATE INDEX IF NOT EXISTS idx_shippings_verificacao_decisao
  ON shippings ((verificacao_manual->>'decisao'))
  WHERE verificacao_manual IS NOT NULL;
