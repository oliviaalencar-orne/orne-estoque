-- Sub-frente 3.0b — Migration 6: unificar locais_origem com hubs canônicos
-- Trigger dual-write garante consistência de novos HUBs daqui em diante.
DELETE FROM locais_origem;
INSERT INTO locais_origem (name)
SELECT name FROM hubs;
