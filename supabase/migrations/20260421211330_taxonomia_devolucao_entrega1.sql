-- 20260421211330 — Taxonomia de Devolução: Entrega 1
--
-- Reconstrução da migration aplicada originalmente em produção via
-- apply_migration direto (não versionada no repo). Staging não a
-- recebeu e ficou em drift — este arquivo fecha a dívida técnica.
--
-- Mudanças:
--   1. Expande shippings_status_check para incluir ETIQUETA_CANCELADA e
--      EXTRAVIADO (terminais paralelos a ENTREGUE/DEVOLVIDO).
--   2. Adiciona colunas de auditoria reclassificacao_automatica e
--      reclassificacao_manual (jsonb). Populadas pela EF rastrear-envio
--      quando ME mapeia canceled/expired → ETIQUETA_CANCELADA, e pelo
--      botão admin "Reclassificar" no painel de despachos.
--
-- Contexto: Entrega 1 da iniciativa "Taxonomia de Devolução" — separa
-- DEVOLVIDO (fluxo comercial de retorno) de ETIQUETA_CANCELADA
-- (pacote nunca saiu do HUB) e EXTRAVIADO (perda verificada).
--
-- Idempotente: pode re-rodar sem efeito colateral.

-- 1. Expande o CHECK de status
ALTER TABLE public.shippings
  DROP CONSTRAINT IF EXISTS shippings_status_check;

ALTER TABLE public.shippings
  ADD CONSTRAINT shippings_status_check CHECK (
    status = ANY (ARRAY[
      'AGUARDANDO_COLETA',
      'DESPACHADO',
      'EM_TRANSITO',
      'SAIU_ENTREGA',
      'TENTATIVA_ENTREGA',
      'ENTREGUE',
      'DEVOLVIDO',
      'ETIQUETA_CANCELADA',
      'EXTRAVIADO'
    ])
  );

-- 2. Colunas de auditoria
ALTER TABLE public.shippings
  ADD COLUMN IF NOT EXISTS reclassificacao_automatica jsonb;

ALTER TABLE public.shippings
  ADD COLUMN IF NOT EXISTS reclassificacao_manual jsonb;

COMMENT ON COLUMN public.shippings.reclassificacao_automatica IS
  'Audit trail da EF rastrear-envio quando remapeia status terminal (ex: ME canceled/expired → ETIQUETA_CANCELADA). Inclui: previousStatus, newStatus, reason, sourceEvent, timestamp.';

COMMENT ON COLUMN public.shippings.reclassificacao_manual IS
  'Audit trail do botão "Reclassificar" no painel admin. Inclui: previousStatus, newStatus, nota, userId, timestamp.';
