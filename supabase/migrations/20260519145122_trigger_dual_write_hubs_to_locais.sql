-- Sub-frente 3.0b — Migration 5: trigger dual-write hubs -> locais_origem
-- Mantém locais_origem populada quando admin cria/edita um HUB.
-- Unidirecional (Decisão fechada do CP1).
CREATE OR REPLACE FUNCTION sync_hubs_to_locais_origem()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO locais_origem (name)
  VALUES (NEW.name)
  ON CONFLICT (name) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS hubs_sync_to_locais ON hubs;
CREATE TRIGGER hubs_sync_to_locais
  AFTER INSERT OR UPDATE ON hubs
  FOR EACH ROW EXECUTE FUNCTION sync_hubs_to_locais_origem();
