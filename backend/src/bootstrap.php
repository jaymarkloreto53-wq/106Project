<?php
declare(strict_types=1);

/* ------------------------------------------------------------------ errors */

final class HttpError extends RuntimeException
{
    public function __construct(public int $status, string $message)
    {
        parent::__construct($message);
    }
}

function fail(int $status, string $message): never
{
    throw new HttpError($status, $message);
}

function json_out(mixed $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/* ------------------------------------------------------------------ config + db */

function cfg(string $key, mixed $default = null): mixed
{
    static $config = null;
    $config ??= require __DIR__ . '/../config.php';
    return $config[$key] ?? $default;
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }
    $c = cfg('db');
    $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $c['host'], $c['port'], $c['name']);
    try {
        $pdo = new PDO($dsn, $c['user'], $c['pass'], [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
    } catch (PDOException $e) {
        error_log('Wanderlux DB connect failed: ' . $e->getMessage());
        fail(503, cfg('debug')
            ? 'Cannot connect to the database: ' . $e->getMessage()
            : 'Cannot connect to the database. Check that MySQL is running and backend/config.php is correct.');
    }
    return $pdo;
}

/** Run $fn inside a transaction; roll back and rethrow on any error. */
function tx(callable $fn): mixed
{
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $result = $fn($pdo);
        $pdo->commit();
        return $result;
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
}

/** Prepared-statement helper: returns the executed statement. */
function q(string $sql, array $params = []): PDOStatement
{
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    return $stmt;
}

function log_activity(?int $userId, string $message): void
{
    q('INSERT INTO activity_log (user_id, message) VALUES (?, ?)', [$userId, mb_substr($message, 0, 255)]);
}

/* ------------------------------------------------------------------ request input */

function body(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === '' || $raw === false) {
        return [];
    }
    $type = $_SERVER['CONTENT_TYPE'] ?? '';
    if (stripos($type, 'application/json') === false) {
        fail(415, 'Send JSON with Content-Type: application/json.');
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        fail(400, 'Invalid JSON body.');
    }
    return $data;
}

function in_str(array $b, string $key, int $min, int $max, string $label): string
{
    $v = $b[$key] ?? null;
    if (!is_string($v)) {
        if ($min === 0) {
            return '';
        }
        fail(422, "$label is required.");
    }
    $v = trim($v);
    $len = mb_strlen($v);
    if ($len < $min) {
        fail(422, $min === 1 ? "$label is required." : "$label needs at least $min characters.");
    }
    if ($len > $max) {
        fail(422, "$label must be at most $max characters.");
    }
    return $v;
}

function in_int(array $b, string $key, int $min, int $max, string $label, ?int $default = null): int
{
    $v = $b[$key] ?? null;
    if (($v === null || $v === '') && $default !== null) {
        return $default;
    }
    $n = filter_var($v, FILTER_VALIDATE_INT);
    if ($n === false || $n < $min || $n > $max) {
        fail(422, "$label must be a whole number between $min and $max.");
    }
    return $n;
}

function in_money(array $b, string $key, string $label): float
{
    $v = $b[$key] ?? null;
    if (!is_numeric($v) || (float) $v <= 0 || (float) $v > 10000000) {
        fail(422, "$label must be a number greater than 0.");
    }
    return round((float) $v, 2);
}

function in_date(array $b, string $key, string $label, ?string $default = null): string
{
    $v = $b[$key] ?? null;
    if (($v === null || $v === '') && $default !== null) {
        return $default;
    }
    $d = is_string($v) ? DateTime::createFromFormat('!Y-m-d', $v) : false;
    if (!$d || $d->format('Y-m-d') !== $v) {
        fail(422, "$label must be a valid date (YYYY-MM-DD).");
    }
    return $v;
}

/* ------------------------------------------------------------------ sessions + users */

function start_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    ini_set('session.use_strict_mode', '1');
    session_name('wl_sid');
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'httponly' => true,
        'samesite' => 'Lax',
        'secure'   => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
    ]);
    session_start();
}

/** The logged-in user (id, username, email, role) or null. */
function current_user(): ?array
{
    static $loaded = false, $user = null;
    if ($loaded) {
        return $user;
    }
    $loaded = true;
    start_session();
    $id = $_SESSION['uid'] ?? null;
    if ($id) {
        $row = q('SELECT id, username, email, role FROM users WHERE id = ? AND email_verified = 1', [$id])->fetch();
        if ($row) {
            $row['id'] = (int) $row['id'];
            $user = $row;
        } else {
            unset($_SESSION['uid']);
        }
    }
    return $user;
}

function user_out(array $u): array
{
    return ['id' => (int) $u['id'], 'username' => $u['username'], 'email' => $u['email'], 'role' => $u['role']];
}

/* ------------------------------------------------------------------ router */

$GLOBALS['__routes'] = [];

/** $access: 'public' | 'user' | 'admin'. Handlers return an array (sent as 200 JSON) or call json_out(). */
function route(string $method, string $pattern, string $access, callable $handler): void
{
    $regex = '#^' . preg_replace('#\{(\w+)\}#', '(?P<$1>[^/]+)', $pattern) . '$#';
    $GLOBALS['__routes'][] = [$method, $regex, $access, $handler];
}

function dispatch(string $method, string $path): never
{
    $pathMatched = false;
    foreach ($GLOBALS['__routes'] as [$m, $regex, $access, $handler]) {
        if (!preg_match($regex, $path, $match)) {
            continue;
        }
        $pathMatched = true;
        if ($m !== $method) {
            continue;
        }
        if ($access !== 'public') {
            $user = current_user();
            if (!$user) {
                fail(401, 'Please log in.');
            }
            if ($access === 'admin' && $user['role'] !== 'admin') {
                fail(403, 'Admin access required.');
            }
        }
        $params = array_filter($match, 'is_string', ARRAY_FILTER_USE_KEY);
        json_out($handler($params) ?? []);
    }
    fail($pathMatched ? 405 : 404, $pathMatched ? 'Method not allowed.' : 'Not found.');
}
