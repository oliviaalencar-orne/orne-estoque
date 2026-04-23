-- supabase/seed/cron_load_test.sql
--
-- Seed de carga para validar a EF `cron-update-tracking` no ambiente
-- staging. 40 shippings representativos amostrados de produção em
-- 22/04/2026, com PII anonimizado e campos estruturais preservados
-- (codigo_rastreio, melhor_envio_id reais para exercitar as APIs
-- Melhor Envio / Correios SRO / melhorrastreio).
--
-- Composição aprovada (resolve 241 pendentes prod em 40 representativos):
--   Bucket 1: 15 DESPACHADO sem_codigo       → força Fase 2 (NF search)
--   Bucket 2: 12 DESPACHADO-me (LGI)         → Fase 3a ME tracking
--   Bucket 3:  5 AGUARDANDO_COLETA-me (LGI)  → Fase 3a ME tracking
--   Bucket 4:  3 EM_TRANSITO-me (2 LGI + 1 Correios AD-format) → Fase 3a
--   Bucket 5a: 1 Loggi sem ME                → Fase 3b (Loggi skip fallback)
--   Bucket 5b: 2 TENTATIVA_ENTREGA-me (AN Correios) → Fase 3a + fallback
--   Bucket 5c: 2 AGUARDANDO_COLETA código "outro" (ME prefix) → Fase 3b
--
-- Anonimização aplicada:
--   - id                      → 'TEST-loadtest-NNN' (prefixo identificável)
--   - nf_numero               → 'TEST-NNN'
--   - cliente                 → 'Cliente Teste NNN'
--   - destino                 → 'Rua Teste 100, Cidade Teste, UF'
--   - recebedor_nome, observacoes, comprovante_obs,
--     telefone_cliente, hub_telefone, motivo_devolucao → NULL
--   - comprovante_fotos, produtos, verificacao_manual  → '[]'::jsonb / NULL
--   - rastreio_info, reclassificacao_automatica/manual → NULL
--   - user_id                 → 'seed-load-test'
--   - ultima_atualizacao_rastreio → NOW() - 5 days (simula pendente real)
--
-- Campos preservados (estruturais):
--   - status, codigo_rastreio, melhor_envio_id, transportadora,
--     date (data de criação original), tipo, entrega_local (=false)
--
-- Para remover todos os dados seedados:
--   DELETE FROM shippings WHERE id LIKE 'TEST-%' OR user_id = 'seed-load-test';
--
-- Idempotente: rodar 2x apenas atualiza as mesmas 40 linhas via ON CONFLICT.

BEGIN;

-- Limpeza preventiva para garantir idempotência completa
DELETE FROM public.shippings WHERE id LIKE 'TEST-loadtest-%';

-- ── Bucket 1: 15 DESPACHADO sem_codigo ─────────────────────────────────
INSERT INTO public.shippings (
  id, nf_numero, cliente, destino, transportadora, codigo_rastreio, melhor_envio_id,
  status, date, user_id, ultima_atualizacao_rastreio, tipo, entrega_local, produtos
) VALUES
('TEST-loadtest-001', 'TEST-001', 'Cliente Teste 001', 'Rua Teste 100, Cidade Teste, UF', 'Entrega Local', '', '', 'DESPACHADO', '2026-04-22 18:25:00.831+00', 'seed-load-test', NOW() - INTERVAL '5 days', 'despacho', false, '[]'::jsonb),
('TEST-loadtest-002', 'TEST-002', 'Cliente Teste 002', 'Rua Teste 100, Cidade Teste, UF', 'Entrega Local', '', '', 'DESPACHADO', '2026-04-16 13:56:28.265+00', 'seed-load-test', NOW() - INTERVAL '5 days', 'despacho', false, '[]'::jsonb),
('TEST-loadtest-003', 'TEST-003', 'Cliente Teste 003', 'Rua Teste 100, Cidade Teste, UF', 'Entrega Local', '', '', 'DESPACHADO', '2026-04-16 13:55:59.626+00', 'seed-load-test', NOW() - INTERVAL '5 days', 'despacho', false, '[]'::jsonb),
('TEST-loadtest-004', 'TEST-004', 'Cliente Teste 004', 'Rua Teste 100, Cidade Teste, UF', 'Entrega Local', '', '', 'DESPACHADO', '2026-04-14 13:01:55.956+00', 'seed-load-test', NOW() - INTERVAL '5 days', 'despacho', false, '[]'::jsonb),
('TEST-loadtest-005', 'TEST-005', 'Cliente Teste 005', 'Rua Teste 100, Cidade Teste, UF', 'Entrega Local', '', '', 'DESPACHADO', '2026-04-02 21:48:32.153+00', 'seed-load-test', NOW() - INTERVAL '5 days', 'despacho', false, '[]'::jsonb),
('TEST-loadtest-006', 'TEST-006', 'Cliente Teste 006', 'Rua Teste 100, Cidade Teste, UF', 'Entrega Local', '', '', 'DESPACHADO', '2026-04-16 13:56:37.046+00', 'seed-load-test', NOW() - INTERVAL '5 days', 'despacho', false, '[]'::jsonb),
('TEST-loadtest-007', 'TEST-007', 'Cliente Teste 007', 'Rua Teste 100, Cidade Teste, UF', 'Entrega Local', '', '', 'DESPACHADO', '2026-04-16 17:45:11.561+00', 'seed-load-test', NOW() - INTERVAL '5 days', 'despacho', false, '[]'::jsonb),
('TEST-loadtest-008', 'TEST-008', 'Cliente Teste 008', 'Rua Teste 100, Cidade Teste, UF', 'Entrega Local', '', '', 'DESPACHADO', '2026-04-06 19:41:33.333+00', 'seed-load-test', NOW() - INTERVAL '5 days', 'despacho', false, '[]'::jsonb),
('TEST-loadtest-009', 'TEST-009', 'Cliente Teste 009', 'Rua Teste 100, Cidade Teste, UF', 'Entrega Local', '', '', 'DESPACHADO', '2026-04-02 21:48:36.345+00', 'seed-load-test', NOW() - INTERVAL '5 days', 'despacho', false, '[]'::jsonb),
('TEST-loadtest-010', 'TEST-010', 'Cliente Teste 010', 'Rua Teste 100, Cidade Teste, UF', 'Entrega Local', '', '', 'DESPACHADO', '2026-04-16 13:57:51.637+00', 'seed-load-test', NOW() - INTERVAL '5 days', 'despacho', false, '[]'::jsonb),
('TEST-loadtest-011', 'TEST-011', 'Cliente Teste 011', 'Rua Teste 100, Cidade Teste, UF', 'Entrega Local', '', '', 'DESPACHADO', '2026-04-02 21:48:32.794+00', 'seed-load-test', NOW() - INTERVAL '5 days', 'despacho', false, '[]'::jsonb),
('TEST-loadtest-012', 'TEST-012', 'Cliente Teste 012', 'Rua Teste 100, Cidade Teste, UF', 'Entrega Local', '', '', 'DESPACHADO', '2026-04-06 19:41:30.678+00', 'seed-load-test', NOW() - INTERVAL '5 days', 'despacho', false, '[]'::jsonb),
('TEST-loadtest-013', 'TEST-013', 'Cliente Teste 013', 'Rua Teste 100, Cidade Teste, UF', 'Entrega Local', '', '', 'DESPACHADO', '2026-04-22 18:14:48.474+00', 'seed-load-test', NOW() - INTERVAL '5 days', 'despacho', false, '[]'::jsonb),
('TEST-loadtest-014', 'TEST-014', 'Cliente Teste 014', 'Rua Teste 100, Cidade Teste, UF', 'Entrega Local', '', '', 'DESPACHADO', '2026-04-16 13:56:11.295+00', 'seed-load-test', NOW() - INTERVAL '5 days', 'despacho', false, '[]'::jsonb),
('TEST-loadtest-015', 'TEST-015', 'Cliente Teste 015', 'Rua Teste 100, Cidade Teste, UF', 'Entrega Local', '', '', 'DESPACHADO', '2026-04-09 16:00:36.082+00', 'seed-load-test', NOW() - INTERVAL '5 days', 'despacho', false, '[]'::jsonb);

-- ── Bucket 2: 12 DESPACHADO-me (todos Loggi via ME, códigos LGI-*) ─────
INSERT INTO public.shippings (
  id, nf_numero, cliente, destino, transportadora, codigo_rastreio, melhor_envio_id,
  status, date, user_id, ultima_atualizacao_rastreio, tipo, entrega_local, produtos
) VALUES
('TEST-loadtest-016', 'TEST-016', 'Cliente Teste 016', 'Rua Teste 100, Cidade Teste, UF', 'Loggi',        'LGI-ME2626POU39BR', 'a180e89b-76c0-41c9-b64b-62232e125e26', 'DESPACHADO', '2026-04-12 15:23:01.893+00', 'seed-load-test', NOW() - INTERVAL '5 days', 'despacho',  false, '[]'::jsonb),
('TEST-loadtest-017', 'TEST-017', 'Cliente Teste 017', 'Rua Teste 100, Cidade Teste, UF', 'Loggi',        'LGI-ME2626YQD40BR', 'a18cd514-c0a0-4804-a214-2f87ab0bb40e', 'DESPACHADO', '2026-04-16 13:56:30.456+00', 'seed-load-test', NOW() - INTERVAL '5 days', 'despacho',  false, '[]'::jsonb),
('TEST-loadtest-018', 'TEST-018', 'Cliente Teste 018', 'Rua Teste 100, Cidade Teste, UF', 'Loggi',        'LGI-ME262787BS2BR', 'a19b0c16-704a-4a71-a4a4-7bd609b09f75', 'DESPACHADO', '2026-04-22 19:01:21.764+00', 'seed-load-test', NOW() - INTERVAL '5 days', 'despacho',  false, '[]'::jsonb),
('TEST-loadtest-019', 'TEST-019', 'Cliente Teste 019', 'Rua Teste 100, Cidade Teste, UF', 'Melhor Envio', 'LGI-ME26275Z990BR', 'a197425f-289d-4d3f-86b6-71b5414c2321', 'DESPACHADO', '2026-04-17 17:49:52.839+00', 'seed-load-test', NOW() - INTERVAL '5 days', 'devolucao', false, '[]'::jsonb),
('TEST-loadtest-020', 'TEST-020', 'Cliente Teste 020', 'Rua Teste 100, Cidade Teste, UF', 'Loggi',        'LGI-ME262787798BR', 'a19b0bb9-c1fa-4ade-b98a-1112b5685133', 'DESPACHADO', '2026-04-22 19:01:20.632+00', 'seed-load-test', NOW() - INTERVAL '5 days', 'despacho',  false, '[]'::jsonb),
('TEST-loadtest-021', 'TEST-021', 'Cliente Teste 021', 'Rua Teste 100, Cidade Teste, UF', 'Loggi',        'LGI-ME2626YIFI6BR', 'a18cbef2-3254-45ee-89d4-035010ba8d63', 'DESPACHADO', '2026-04-16 13:55:54.058+00', 'seed-load-test', NOW() - INTERVAL '5 days', 'despacho',  false, '[]'::jsonb),
('TEST-loadtest-022', 'TEST-022', 'Cliente Teste 022', 'Rua Teste 100, Cidade Teste, UF', 'Loggi',        'LGI-ME262706SF3BR', 'a18e9ad7-f5ac-40df-8dbf-c810da79f147', 'DESPACHADO', '2026-04-16 13:56:35.041+00', 'seed-load-test', NOW() - INTERVAL '5 days', 'despacho',  false, '[]'::jsonb),
('TEST-loadtest-023', 'TEST-023', 'Cliente Teste 023', 'Rua Teste 100, Cidade Teste, UF', 'Loggi',        'LGI-ME2626ZLDZ6BR', 'a18d3838-04c8-42bf-b6a2-db3e2645050a', 'DESPACHADO', '2026-04-16 13:56:01.672+00', 'seed-load-test', NOW() - INTERVAL '5 days', 'despacho',  false, '[]'::jsonb),
('TEST-loadtest-024', 'TEST-024', 'Cliente Teste 024', 'Rua Teste 100, Cidade Teste, UF', 'Loggi',        'LGI-ME262706YJ3BR', 'a18e9bcd-0531-46aa-9a17-80613e776c43', 'DESPACHADO', '2026-04-16 13:55:27.009+00', 'seed-load-test', NOW() - INTERVAL '5 days', 'despacho',  false, '[]'::jsonb),
('TEST-loadtest-025', 'TEST-025', 'Cliente Teste 025', 'Rua Teste 100, Cidade Teste, UF', 'Loggi',        'LGI-ME2626YLQI6BR', 'a18cc86d-4e5a-4e89-8bb7-90537246d065', 'DESPACHADO', '2026-04-16 13:56:15.194+00', 'seed-load-test', NOW() - INTERVAL '5 days', 'despacho',  false, '[]'::jsonb),
('TEST-loadtest-026', 'TEST-026', 'Cliente Teste 026', 'Rua Teste 100, Cidade Teste, UF', 'Loggi',        'LGI-ME2626YEXR6BR', 'a18cb45c-b10c-4168-a103-55c8eed6d7ff', 'DESPACHADO', '2026-04-16 13:56:34.08+00',  'seed-load-test', NOW() - INTERVAL '5 days', 'despacho',  false, '[]'::jsonb),
('TEST-loadtest-027', 'TEST-027', 'Cliente Teste 027', 'Rua Teste 100, Cidade Teste, UF', 'Loggi',        'LGI-ME262706IR3BR', 'a18e99b3-bf2a-46c2-aeb4-9cf3d31e679e', 'DESPACHADO', '2026-04-16 13:55:56.327+00', 'seed-load-test', NOW() - INTERVAL '5 days', 'despacho',  false, '[]'::jsonb);

-- ── Bucket 3: 5 AGUARDANDO_COLETA-me (LGI-*) ───────────────────────────
INSERT INTO public.shippings (
  id, nf_numero, cliente, destino, transportadora, codigo_rastreio, melhor_envio_id,
  status, date, user_id, ultima_atualizacao_rastreio, tipo, entrega_local, produtos
) VALUES
('TEST-loadtest-028', 'TEST-028', 'Cliente Teste 028', 'Rua Teste 100, Cidade Teste, UF', 'Loggi',        'LGI-ME2626NDR06BR', 'a17eca70-74fc-4f3b-8ede-3c7d7195a478', 'AGUARDANDO_COLETA', '2026-04-12 15:23:07.439+00', 'seed-load-test', NOW() - INTERVAL '5 days', 'despacho',  false, '[]'::jsonb),
('TEST-loadtest-029', 'TEST-029', 'Cliente Teste 029', 'Rua Teste 100, Cidade Teste, UF', 'Loggi',        'LGI-ME26275QD24BR', 'a1972762-5616-40fb-ae9f-c822d478816d', 'AGUARDANDO_COLETA', '2026-04-21 14:23:58.788+00', 'seed-load-test', NOW() - INTERVAL '5 days', 'despacho',  false, '[]'::jsonb),
('TEST-loadtest-030', 'TEST-030', 'Cliente Teste 030', 'Rua Teste 100, Cidade Teste, UF', 'Melhor Envio', 'LGI-ME2626S1P63BR', 'a183160b-6a55-491d-92ed-5bbb66b59b4c', 'AGUARDANDO_COLETA', '2026-04-08 15:17:17.551+00', 'seed-load-test', NOW() - INTERVAL '5 days', 'devolucao', false, '[]'::jsonb),
('TEST-loadtest-031', 'TEST-031', 'Cliente Teste 031', 'Rua Teste 100, Cidade Teste, UF', 'Loggi',        'LGI-ME26275QJH2BR', 'a19727db-a1da-48fa-9271-2ca5e10908c5', 'AGUARDANDO_COLETA', '2026-04-21 14:23:57.783+00', 'seed-load-test', NOW() - INTERVAL '5 days', 'despacho',  false, '[]'::jsonb),
('TEST-loadtest-032', 'TEST-032', 'Cliente Teste 032', 'Rua Teste 100, Cidade Teste, UF', 'Loggi',        'LGI-ME2626ZCO84BR', 'a18d1e35-0c5f-4ac1-8677-58d32323e147', 'AGUARDANDO_COLETA', '2026-04-14 21:05:11.329+00', 'seed-load-test', NOW() - INTERVAL '5 days', 'devolucao', false, '[]'::jsonb);

-- ── Bucket 4: 3 EM_TRANSITO-me (mix LGI + Correios AD-format) ──────────
INSERT INTO public.shippings (
  id, nf_numero, cliente, destino, transportadora, codigo_rastreio, melhor_envio_id,
  status, date, user_id, ultima_atualizacao_rastreio, tipo, entrega_local, produtos
) VALUES
('TEST-loadtest-033', 'TEST-033', 'Cliente Teste 033', 'Rua Teste 100, Cidade Teste, UF', 'Melhor Envio', 'LGI-ME26272CH54BR', 'a190bdbe-5ca3-4ff0-9b72-a632fa0023ea', 'EM_TRANSITO', '2026-04-17 19:24:30.723+00', 'seed-load-test', NOW() - INTERVAL '5 days', 'despacho',  false, '[]'::jsonb),
('TEST-loadtest-034', 'TEST-034', 'Cliente Teste 034', 'Rua Teste 100, Cidade Teste, UF', 'Correios',     'AD344210598BR',    'a18d2574-5844-4711-b857-31e6f212261f', 'EM_TRANSITO', '2026-04-16 13:56:25.401+00', 'seed-load-test', NOW() - INTERVAL '5 days', 'despacho',  false, '[]'::jsonb),
('TEST-loadtest-035', 'TEST-035', 'Cliente Teste 035', 'Rua Teste 100, Cidade Teste, UF', 'Loggi',        'LGI-ME2626ZD860BR', 'a18d1fd2-5dbe-45dd-9591-9f809016853b', 'EM_TRANSITO', '2026-04-15 16:55:55.944+00', 'seed-load-test', NOW() - INTERVAL '5 days', 'devolucao', false, '[]'::jsonb);

-- ── Bucket 5: casos edge ───────────────────────────────────────────────
-- 5a: 1 Loggi sem ME (por codigo_rastreio path → Fase 3b)
INSERT INTO public.shippings (
  id, nf_numero, cliente, destino, transportadora, codigo_rastreio, melhor_envio_id,
  status, date, user_id, ultima_atualizacao_rastreio, tipo, entrega_local, produtos
) VALUES
('TEST-loadtest-036', 'TEST-036', 'Cliente Teste 036', 'Rua Teste 100, Cidade Teste, UF', 'Loggi',    'LGI-ME2625WRAZ5BR', '', 'EM_TRANSITO',       '2026-03-21 14:04:21.846+00', 'seed-load-test', NOW() - INTERVAL '5 days', 'despacho', false, '[]'::jsonb),

-- 5b: 2 TENTATIVA_ENTREGA-me (códigos AN-format Correios + melhor_envio_id)
('TEST-loadtest-037', 'TEST-037', 'Cliente Teste 037', 'Rua Teste 100, Cidade Teste, UF', 'Correios', 'AN763152797BR',     'a16d0b6d-1f57-4a1a-a0c9-29e62b78a57c', 'TENTATIVA_ENTREGA', '2026-04-01 17:44:33.756+00', 'seed-load-test', NOW() - INTERVAL '5 days', 'despacho', false, '[]'::jsonb),
('TEST-loadtest-038', 'TEST-038', 'Cliente Teste 038', 'Rua Teste 100, Cidade Teste, UF', 'Correios', 'AN772270956BR',     'a170dde6-83ee-4249-9198-998a1f2c8c7b', 'TENTATIVA_ENTREGA', '2026-04-01 17:44:28.766+00', 'seed-load-test', NOW() - INTERVAL '5 days', 'despacho', false, '[]'::jsonb),

-- 5c: 2 AGUARDANDO_COLETA código "outro" (ME prefix sem LGI, sem AN)
('TEST-loadtest-039', 'TEST-039', 'Cliente Teste 039', 'Rua Teste 100, Cidade Teste, UF', '',         'ME2626JT4X0BR',     '',                                     'AGUARDANDO_COLETA', '2026-04-06 18:15:11.986+00', 'seed-load-test', NOW() - INTERVAL '5 days', 'devolucao', false, '[]'::jsonb),
('TEST-loadtest-040', 'TEST-040', 'Cliente Teste 040', 'Rua Teste 100, Cidade Teste, UF', 'Loggi',    'ME2626K8BA4BR',     'https://www.melhorrastreio.com.br/app/melhorenvio/ME2626K8BA4BR', 'AGUARDANDO_COLETA', '2026-04-06 18:52:54.836+00', 'seed-load-test', NOW() - INTERVAL '5 days', 'devolucao', false, '[]'::jsonb);

-- Ajuste 2: proteção estrutural para linhas tipo='devolucao'. Mesmo
-- com produtos=[], marcar entrada_criada=true garante que a Fase 4 da
-- EF (auto-entrada de estoque a partir de devoluções ENTREGUES) seja
-- filtrada antes de qualquer lógica, cobrindo bug/regressão/edge case
-- hipotéticos.
UPDATE public.shippings
   SET entrada_criada = true
 WHERE id LIKE 'TEST-loadtest-%' AND tipo = 'devolucao';

-- Validação: esperamos exatamente 40 linhas TEST-loadtest-* e 6 com
-- tipo='devolucao' AND entrada_criada=true.
DO $$
DECLARE
  n_total   int;
  n_dev_protegidas int;
BEGIN
  SELECT COUNT(*) INTO n_total
    FROM public.shippings WHERE id LIKE 'TEST-loadtest-%';
  IF n_total <> 40 THEN
    RAISE EXCEPTION 'Seed esperava 40 linhas, encontrou %', n_total;
  END IF;

  SELECT COUNT(*) INTO n_dev_protegidas
    FROM public.shippings
    WHERE user_id = 'seed-load-test'
      AND tipo = 'devolucao'
      AND entrada_criada = true;
  IF n_dev_protegidas <> 6 THEN
    RAISE EXCEPTION 'Esperava 6 devolucoes protegidas, encontrou %', n_dev_protegidas;
  END IF;

  RAISE NOTICE 'Seed OK: % linhas total, % devolucoes com entrada_criada=true',
    n_total, n_dev_protegidas;
END $$;

COMMIT;
