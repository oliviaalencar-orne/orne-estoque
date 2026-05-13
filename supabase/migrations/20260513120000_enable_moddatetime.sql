-- Sub-frente 3.0a (Frente 3) — habilita extension `moddatetime`
--
-- Necessaria para o trigger `motivos_devolucao_updated_at` da migration
-- 20260513120100. Isolada em migration propria (DDL infra) para que o
-- rollback da tabela seja independente da extension; a extension
-- permanece disponivel para usos futuros.
--
-- Idempotente: CREATE EXTENSION IF NOT EXISTS. Validado no pre-flight
-- de 13/05/2026 que a extension nao estava habilitada em nenhum dos
-- dois ambientes (staging + prod), apenas pgcrypto.

CREATE EXTENSION IF NOT EXISTS moddatetime;
