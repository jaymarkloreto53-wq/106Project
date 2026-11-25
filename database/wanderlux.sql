-- Wanderlux database (MySQL 5.7+ / 8.x / MariaDB 10.3+)
-- Import with phpMyAdmin (Import tab) or:  mysql -u root -p < wanderlux.sql
-- WARNING: this drops and recreates the `wanderlux` database.

DROP DATABASE IF EXISTS wanderlux;
CREATE DATABASE wanderlux CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE wanderlux;

-- ---------------------------------------------------------------- schema

CREATE TABLE users (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username       VARCHAR(40)  NOT NULL,
  email          VARCHAR(190) NOT NULL,
  password_hash  VARCHAR(255) NOT NULL,
  role           ENUM('customer','admin') NOT NULL DEFAULT 'customer',
  email_verified TINYINT(1)   NOT NULL DEFAULT 0,
  verify_token   CHAR(64)     NULL,
  failed_logins  TINYINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until   DATETIME     NULL,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_verify_token (verify_token)
) ENGINE=InnoDB;

CREATE TABLE destinations (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(120) NOT NULL,
  type        VARCHAR(40)  NOT NULL DEFAULT 'Other',
  description VARCHAR(500) NOT NULL DEFAULT '',
  image       VARCHAR(255) NULL,            -- e.g. images/palawan.jpg or uploads/ab12.jpg
  art         VARCHAR(20)  NOT NULL DEFAULT 'beach',  -- fallback illustration key
  latitude    DECIMAL(9,6) NULL,            -- map pin (NULL = not shown on the map)
  longitude   DECIMAL(9,6) NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB;

CREATE TABLE packages (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  destination_id INT UNSIGNED NOT NULL,
  days           SMALLINT UNSIGNED NOT NULL,
  price          DECIMAL(10,2) NOT NULL,
  slots          INT UNSIGNED NOT NULL,
  departure_date DATE NOT NULL,
  PRIMARY KEY (id),
  KEY idx_packages_destination (destination_id),
  CONSTRAINT fk_packages_destination FOREIGN KEY (destination_id)
    REFERENCES destinations (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE bookings (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  ref            CHAR(9) NOT NULL,           -- WL-XXXXXX
  user_id        INT UNSIGNED NOT NULL,
  package_id     INT UNSIGNED NOT NULL,
  travelers      SMALLINT UNSIGNED NOT NULL,
  lead_name      VARCHAR(120) NOT NULL,
  phone          VARCHAR(40)  NOT NULL DEFAULT '',
  total          DECIMAL(10,2) NOT NULL,
  payment_method ENUM('Card','GCash','PayPal','Bank transfer') NOT NULL,
  status         ENUM('pending approval','approved','rejected','cancelled') NOT NULL DEFAULT 'pending approval',
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bookings_ref (ref),
  KEY idx_bookings_user (user_id),
  KEY idx_bookings_package (package_id),
  CONSTRAINT fk_bookings_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  -- RESTRICT: a package that has bookings can never be deleted by accident
  CONSTRAINT fk_bookings_package FOREIGN KEY (package_id) REFERENCES packages (id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE reviews (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  booking_id INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  stars      TINYINT UNSIGNED NOT NULL,
  comment    VARCHAR(1000) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_reviews_booking (booking_id),   -- one review per booking
  KEY idx_reviews_user (user_id),
  CONSTRAINT fk_reviews_booking FOREIGN KEY (booking_id) REFERENCES bookings (id) ON DELETE CASCADE,
  CONSTRAINT fk_reviews_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE notifications (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED NOT NULL,
  message    VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notifications_user (user_id, id),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE activity_log (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED NULL,
  message    VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_activity_created (id),
  CONSTRAINT fk_activity_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ------------------------------------------------------------------ seed
-- Demo accounts: admin / admin123 and guest / guest123.
-- CHANGE THESE PASSWORDS before the site is reachable by anyone else.

INSERT INTO users (username, email, password_hash, role, email_verified) VALUES
('admin', 'admin@wanderlux.test', '$2y$10$bAwZ5OAyA/S44j5eJDMvSu.IijXVDjkCbqRXWqA7xBRhV8xFBTA02', 'admin', 1),
('guest', 'guest@wanderlux.test', '$2y$10$Xyo9E1p7kMs7iUagKKfYTOpB.xjRbHUj87j7UTfw.D7xMQFuJ262m', 'customer', 1);

INSERT INTO destinations (id, name, type, description, image, art, latitude, longitude) VALUES
(1, 'Palawan',         'Adventure', 'El Nido lagoons, limestone cliffs and island hopping.',        'images/palawan.jpg',           'cliffs', 11.178400, 119.393900),
(2, 'Boracay',         'Beach',     'White Beach, sandbars and sunset sailing.',                    'images/boracay.jpg',           'beach', 11.967400, 121.924800),
(3, 'Siargao',         'Beach',     'Surf breaks, Sugba Lagoon and Cloud 9 mornings.',              'images/sargao.jpg',            'surf', 9.785000, 126.159000),
(4, 'Banaue & Sagada', 'Culture',   'Ifugao rice terraces, hanging coffins and mountain cafes.',    'images/banaue_and_sagana.jpg', 'terrace', 16.927000, 121.059000),
(5, 'Vigan',           'Culture',   'Cobblestone Calle Crisologo and Spanish-era houses.',          'images/vigan-city-02.jpg',     'town', 17.574700, 120.386900),
(6, 'Bohol',           'Adventure', 'Chocolate Hills, tarsiers and Loboc river cruises.',           'images/bohol.jpg',             'hills', 9.829700, 124.139700);

INSERT INTO packages (id, destination_id, days, price, slots, departure_date) VALUES
(1, 1, 4, 18500.00, 12, '2027-02-20'),
(2, 2, 4, 16900.00,  8, '2027-03-12'),
(3, 3, 5, 21800.00,  6, '2027-04-02'),
(4, 4, 5, 14200.00,  2, '2027-05-09'),
(5, 5, 3,  9800.00, 10, '2027-06-15'),
(6, 6, 4, 15400.00,  9, '2027-07-08');
