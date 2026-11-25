-- OPTIONAL but recommended before the site is reachable by anyone else.
-- Creates a MySQL user that can only touch the `wanderlux` database, instead of using `root`.
-- Run in phpMyAdmin (SQL tab) AFTER importing wanderlux.sql. Change the password first!
--
-- MySQL 5.7+ / 8.x / MariaDB 10.3+. Afterwards edit backend/config.php:
--   'user' => 'wanderlux_app',  'pass' => 'the password you chose below'

CREATE USER IF NOT EXISTS 'wanderlux_app'@'localhost' IDENTIFIED BY 'CHANGE-THIS-PASSWORD';

GRANT SELECT, INSERT, UPDATE, DELETE ON wanderlux.* TO 'wanderlux_app'@'localhost';

FLUSH PRIVILEGES;
