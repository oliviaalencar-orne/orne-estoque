-- Sub-frente 3.0b — Migration 2 (idempotente via DO block)
-- Em prod, locais_origem_name_key já existe; hubs ainda não tem UNIQUE em name.
-- Em staging, ambos serão criados.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hubs_name_unique') THEN
    ALTER TABLE hubs ADD CONSTRAINT hubs_name_unique UNIQUE (name);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname IN ('locais_origem_name_unique', 'locais_origem_name_key')
  ) THEN
    ALTER TABLE locais_origem ADD CONSTRAINT locais_origem_name_unique UNIQUE (name);
  END IF;
END $$;
