<?php
declare(strict_types=1);

// Wanderlux JSON API front controller.
// Clean URLs:  /wanderlux/api/catalog   (via .htaccess)
// Fallback:    /wanderlux/api/index.php?r=catalog

require __DIR__ . '/src/bootstrap.php';

error_reporting(E_ALL);
ini_set('display_errors', '0');
date_default_timezone_set((string) cfg('timezone', 'UTC'));

set_exception_handler(function (Throwable $e): void {
    if ($e instanceof HttpError) {
        json_out(['error' => $e->getMessage()], $e->status);
    }
    error_log('Wanderlux: ' . $e);
    $msg = cfg('debug')
        ? $e->getMessage()
        : ($e instanceof PDOException ? 'Database error.' : 'Server error.');
    json_out(['error' => $msg], 500);
});

header('X-Content-Type-Options: nosniff');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// Cross-site request guard: a browser always sends Origin on cross-site writes.
if ($method !== 'GET' && !empty($_SERVER['HTTP_ORIGIN'])) {
    $o = parse_url($_SERVER['HTTP_ORIGIN']);
    $originHost = strtolower(($o['host'] ?? '') . (isset($o['port']) ? ':' . $o['port'] : ''));
    if ($originHost !== strtolower($_SERVER['HTTP_HOST'] ?? '')) {
        fail(403, 'Cross-site requests are not allowed.');
    }
}

require __DIR__ . '/src/auth.php';
require __DIR__ . '/src/catalog.php';
require __DIR__ . '/src/bookings.php';
require __DIR__ . '/src/admin.php';

$path = '/' . trim((string) ($_GET['r'] ?? ($_SERVER['PATH_INFO'] ?? '')), '/');
dispatch($method, $path);
