-- Sub-frente 3.0b — STAGING ONLY
-- Remove 3 duplicatas em staging mantendo registro de menor id para cada nome.
DELETE FROM locais_origem WHERE id NOT IN (
  SELECT MIN(id) FROM locais_origem GROUP BY name
);
