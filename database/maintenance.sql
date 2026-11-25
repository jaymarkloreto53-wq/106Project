-- Handy one-off queries for running Wanderlux. Run them in phpMyAdmin (SQL tab).
-- Not needed for the first setup: wanderlux.sql already creates everything.
USE wanderlux;

-- 1. Change a password. First make the hash on your PC (PowerShell, from the WAMP PHP folder):
--      php -r "echo password_hash('YourNewPassword', PASSWORD_DEFAULT);"
--    then paste the result below.
-- UPDATE users SET password_hash = 'PASTE-HASH-HERE' WHERE username = 'admin';

-- 2. Make an existing user an admin (or back to a customer).
-- UPDATE users SET role = 'admin'    WHERE username = 'someone';
-- UPDATE users SET role = 'customer' WHERE username = 'someone';

-- 3. Unlock an account that was locked after 3 wrong passwords.
-- UPDATE users SET failed_logins = 0, locked_until = NULL WHERE username = 'someone';

-- 4. Confirm an email by hand (e.g. when email sending is not set up).
-- UPDATE users SET email_verified = 1, verify_token = NULL WHERE username = 'someone';

-- 5. Look at things.
-- SELECT id, username, email, role, email_verified, created_at FROM users;
-- SELECT ref, status, travelers, total, created_at FROM bookings ORDER BY id DESC;
-- SELECT d.name, p.days, p.price, p.slots, p.departure_date
--   FROM packages p JOIN destinations d ON d.id = p.destination_id;

-- 6. Wipe test bookings and give all slots back to a fresh start (keeps users, trips and prices).
--    This deletes every booking, review and notification!
-- DELETE FROM reviews;
-- DELETE FROM notifications;
-- DELETE FROM bookings;
-- DELETE FROM activity_log;
-- UPDATE packages SET slots = CASE id
--   WHEN 1 THEN 12 WHEN 2 THEN 8 WHEN 3 THEN 6 WHEN 4 THEN 2 WHEN 5 THEN 10 WHEN 6 THEN 9 ELSE slots END;
