<?php
declare(strict_types=1);

function login_session(int $userId): void
{
    start_session();
    session_regenerate_id(true);
    $_SESSION['uid'] = $userId;
}

function send_verification_email(string $to, string $username, string $token): bool
{
    $link = rtrim((string) cfg('public_url'), '/') . '/?verify=' . $token;
    $message = "Hi $username,\r\n\r\nWelcome to Wanderlux. Confirm your email to activate your account:\r\n$link\r\n";
    // Needs a working mail setup (SMTP) in php.ini; failure never blocks registration.
    return @mail($to, 'Confirm your Wanderlux account', $message, 'Content-Type: text/plain; charset=utf-8');
}

route('POST', '/auth/register', 'public', function () {
    $b = body();
    $username = in_str($b, 'username', 3, 40, 'Username');
    if (!preg_match('/^[A-Za-z0-9_.-]+$/', $username)) {
        fail(422, 'Username can only use letters, numbers, dots, dashes and underscores.');
    }
    $email = in_str($b, 'email', 1, 190, 'Email');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        fail(422, 'Enter a valid email address.');
    }
    $password = $b['password'] ?? '';
    if (!is_string($password) || strlen($password) < 8) {
        fail(422, 'Password needs at least 8 characters.');
    }
    if (strlen($password) > 72) { // bcrypt only uses the first 72 bytes
        fail(422, 'Password must be at most 72 characters.');
    }

    if (q('SELECT 1 FROM users WHERE username = ?', [$username])->fetch()) {
        fail(409, 'That username is taken.');
    }
    if (q('SELECT 1 FROM users WHERE email = ?', [$email])->fetch()) {
        fail(409, 'That email is already registered.');
    }

    $token = bin2hex(random_bytes(32));
    try {
        q(
            'INSERT INTO users (username, email, password_hash, role, email_verified, verify_token)
             VALUES (?, ?, ?, \'customer\', 0, ?)',
            [$username, $email, password_hash($password, PASSWORD_DEFAULT), $token]
        );
    } catch (PDOException $e) {
        if (($e->errorInfo[1] ?? 0) === 1062) { // lost a race with another signup
            fail(409, 'That username or email is already registered.');
        }
        throw $e;
    }

    if (cfg('demo_mode')) {
        json_out(['demoToken' => $token], 201);
    }
    send_verification_email($email, $username, $token);
    json_out(['sent' => true], 201);
});

route('POST', '/auth/verify', 'public', function () {
    $token = in_str(body(), 'token', 64, 64, 'Confirmation token');
    $u = q(
        'SELECT id, username, email, role FROM users WHERE verify_token = ? AND email_verified = 0',
        [$token]
    )->fetch();
    if (!$u) {
        fail(400, 'This confirmation link is invalid or has already been used.');
    }
    q('UPDATE users SET email_verified = 1, verify_token = NULL WHERE id = ?', [$u['id']]);
    log_activity((int) $u['id'], 'Account created: ' . $u['username']);
    login_session((int) $u['id']);
    return ['user' => user_out($u)];
});

route('POST', '/auth/login', 'public', function () {
    $b = body();
    $username = in_str($b, 'username', 1, 40, 'Username');
    $password = is_string($b['password'] ?? null) ? $b['password'] : '';
    $generic = 'Wrong username or password.';

    $u = q(
        'SELECT id, username, email, role, password_hash, email_verified, failed_logins,
                (locked_until IS NOT NULL AND locked_until > NOW()) AS locked
         FROM users WHERE username = ?',
        [$username]
    )->fetch();

    if (!$u) {
        password_verify($password, password_hash('timing-equalizer', PASSWORD_DEFAULT));
        fail(401, $generic);
    }

    $minutes = (int) cfg('lockout_minutes', 15);
    $lockedMsg = "Too many failed attempts. Try again in $minutes minutes.";
    if ((int) $u['locked'] === 1) {
        fail(423, $lockedMsg);
    }

    if (!password_verify($password, $u['password_hash'])) {
        $count = (int) $u['failed_logins'] + 1;
        if ($count >= (int) cfg('max_failed_logins', 3)) {
            q(
                'UPDATE users SET failed_logins = 0, locked_until = DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE id = ?',
                [$minutes, $u['id']]
            );
            log_activity((int) $u['id'], 'Account locked after repeated failed logins: ' . $u['username']);
            fail(423, $lockedMsg);
        }
        q('UPDATE users SET failed_logins = ? WHERE id = ?', [$count, $u['id']]);
        fail(401, $generic);
    }

    if (!(int) $u['email_verified']) {
        fail(403, 'Please confirm your email address first.');
    }

    q('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?', [$u['id']]);
    if (password_needs_rehash($u['password_hash'], PASSWORD_DEFAULT)) {
        q('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($password, PASSWORD_DEFAULT), $u['id']]);
    }
    login_session((int) $u['id']);
    return ['user' => user_out($u)];
});

route('POST', '/auth/logout', 'public', function () {
    start_session();
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', [
            'expires' => time() - 3600, 'path' => $p['path'], 'httponly' => true, 'samesite' => 'Lax',
        ]);
    }
    session_destroy();
    return ['ok' => true];
});

route('GET', '/auth/me', 'public', function () {
    $u = current_user();
    return ['user' => $u ? user_out($u) : null];
});
