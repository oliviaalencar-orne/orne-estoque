-- Sub-frente 3.0b — Migration 8: trigger BEFORE DELETE em hubs → locais_origem
--
-- Complementa o trigger INSERT/UPDATE da M5 (sync_hubs_to_locais_origem).
-- Princípio "não acumular trabalho residual": quando o admin remove um HUB
-- canônico via HubsModal, a entrada correspondente em locais_origem deve
-- desaparecer junto — sem isso, a tabela legacy de locais_origem acumularia
-- nomes órfãos a cada delete, e o caminho saída (DespachoForm, XML, Tiny)
-- continuaria mostrando opções inexistentes.
--
-- BEFORE DELETE é seguro: o trigger roda na mesma transação do DELETE em
-- hubs; se algo falhar abaixo (FK em hub_aliases.name_canonical), o trigger
-- também é revertido.

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
