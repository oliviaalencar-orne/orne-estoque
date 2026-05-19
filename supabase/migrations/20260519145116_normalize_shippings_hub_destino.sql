-- Sub-frente 3.0b — Migration 4: normalizar hub_destino para canônicos
-- Em staging: no-op (6 devoluções com hub_destino=NULL).
-- Em prod: afetará 88 rows (14 RJ + 74 VG).
UPDATE shippings SET hub_destino = 'HUB CWB' WHERE hub_destino = 'G+SHIP CWB';
UPDATE shippings SET hub_destino = 'HUB RJ'  WHERE hub_destino = 'G+SHIP RJ';
UPDATE shippings SET hub_destino = 'HUB VG'  WHERE hub_destino = 'G+SHIP VG';
