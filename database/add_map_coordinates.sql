-- Run this ONLY if you already imported an older wanderlux.sql and want to keep your data.
-- (A fresh import of the current wanderlux.sql already includes these columns.)
USE wanderlux;

ALTER TABLE destinations
  ADD COLUMN latitude  DECIMAL(9,6) NULL AFTER art,
  ADD COLUMN longitude DECIMAL(9,6) NULL AFTER latitude;

UPDATE destinations SET latitude = 11.178400, longitude = 119.393900 WHERE name = 'Palawan';
UPDATE destinations SET latitude = 11.967400, longitude = 121.924800 WHERE name = 'Boracay';
UPDATE destinations SET latitude =  9.785000, longitude = 126.159000 WHERE name = 'Siargao';
UPDATE destinations SET latitude = 16.927000, longitude = 121.059000 WHERE name = 'Banaue & Sagada';
UPDATE destinations SET latitude = 17.574700, longitude = 120.386900 WHERE name = 'Vigan';
UPDATE destinations SET latitude =  9.829700, longitude = 124.139700 WHERE name = 'Bohol';
