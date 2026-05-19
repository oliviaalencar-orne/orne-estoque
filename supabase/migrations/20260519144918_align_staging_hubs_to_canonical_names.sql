-- STAGING-ONLY: in prod this migration is no-op (names already canonical).
-- Applied only to staging gyzhrxnrfrgmpgvopzec on 2026-05-19 (timestamp 20260519144918).
--
-- Sub-frente 3.0b — STAGING ONLY (drift fix descoberto no pré-flight)
-- Em staging, hubs.name estava como "Curitiba"/"Rio de Janeiro"/"São Paulo".
-- Em prod, hubs.name já é "HUB CWB"/"HUB RJ"/"HUB VG".
-- Alinhando para a Migration 3 (FK hub_aliases.name_canonical -> hubs.name) funcionar.
UPDATE hubs SET name = 'HUB CWB' WHERE name = 'Curitiba';
UPDATE hubs SET name = 'HUB RJ' WHERE name = 'Rio de Janeiro';
UPDATE hubs SET name = 'HUB VG' WHERE name = 'São Paulo';
