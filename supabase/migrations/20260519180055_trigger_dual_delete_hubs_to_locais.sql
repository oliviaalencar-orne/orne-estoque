-- Sub-frente 3.0b — Migration 8: trigger BEFORE DELETE em hubs → locais_origem
-- Complementa o trigger INSERT/UPDATE da M5. Hard delete em hubs propaga para
-- locais_origem (princípio "não acumular trabalho residual").
CREATE OR REPLACE FUNCTION sync_hubs_delete_to_locais_origem()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM locais_origem WHERE name = OLD.name;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS hubs_sync_delete_to_locais ON hubs;
CREATE TRIGGER hubs_sync_delete_to_locais
  BEFORE DELETE ON hubs
  FOR EACH ROW EXECUTE FUNCTION sync_hubs_delete_to_locais_origem();
