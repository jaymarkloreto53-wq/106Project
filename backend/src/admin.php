<?php
declare(strict_types=1);

/* ------------------------------------------------------------------ uploads */

function upload_error_message(int $code): string
{
    return match ($code) {
        UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => 'Choose an image under 2 MB.',
        UPLOAD_ERR_NO_FILE                        => 'Choose an image to upload.',
        default                                   => 'The upload failed. Please try again.',
    };
}

/** Validate and store an uploaded photo; returns its site-relative path (uploads/xxxx.jpg). */
function save_uploaded_image(array $file): string
{
    $err = (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE);
    if ($err !== UPLOAD_ERR_OK) {
        fail(422, upload_error_message($err));
    }
    if ((int) $file['size'] > 2000000) {
        fail(422, 'Choose an image under 2 MB.');
    }
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
    $ext = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'][$mime] ?? null;
    if ($ext === null || @getimagesize($file['tmp_name']) === false) {
        fail(422, 'Upload a JPG, PNG or WebP image.');
    }

    $dir = (string) cfg('upload_dir');
    if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
        fail(500, 'The uploads folder could not be created.');
    }
    // Uploaded files must never be executable, whatever their name.
    $guard = $dir . '/.htaccess';
    if (!is_file($guard)) {
        file_put_contents($guard, "<FilesMatch \"\\.(php|phtml|phar|php[0-9])$\">\n  Require all denied\n</FilesMatch>\n");
    }

    $name = bin2hex(random_bytes(12)) . '.' . $ext;
    if (!move_uploaded_file($file['tmp_name'], $dir . '/' . $name)) {
        fail(500, 'The uploaded file could not be saved.');
    }
    return 'uploads/' . $name;
}

function remove_uploaded_image(?string $path): void
{
    if ($path !== null && str_starts_with($path, 'uploads/')) {
        $file = (string) cfg('upload_dir') . '/' . basename($path);
        if (is_file($file)) {
            @unlink($file);
        }
    }
}

/** Optional map coordinates: both empty = no pin; otherwise both must be valid. Returns [lat, lng] or [null, null]. */
function in_coords(array $b): array
{
    $lat = $b['lat'] ?? null;
    $lng = $b['lng'] ?? null;
    $blank = fn ($v) => $v === null || $v === '';
    if ($blank($lat) && $blank($lng)) {
        return [null, null];
    }
    if ($blank($lat) || $blank($lng) || !is_numeric($lat) || !is_numeric($lng)) {
        fail(422, 'Enter both latitude and longitude, or leave both empty.');
    }
    $lat = round((float) $lat, 6);
    $lng = round((float) $lng, 6);
    if ($lat < -90 || $lat > 90 || $lng < -180 || $lng > 180) {
        fail(422, 'Latitude must be between -90 and 90, and longitude between -180 and 180.');
    }
    return [$lat, $lng];
}

function destination_row(string $id): array
{
    $row = ctype_digit($id) ? q('SELECT id, name, image FROM destinations WHERE id = ?', [$id])->fetch() : false;
    if (!$row) {
        fail(404, 'Destination not found.');
    }
    return $row;
}

/* ------------------------------------------------------------------ destinations + packages */

route('POST', '/destinations', 'admin', function () {
    $admin = current_user();
    $b = body();
    $name  = in_str($b, 'name', 1, 120, 'Destination name');
    $type  = in_str($b, 'type', 0, 40, 'Type') ?: 'Other';
    $desc  = in_str($b, 'description', 0, 500, 'Description');
    $price = in_money($b, 'price', 'Package price');
    $days  = in_int($b, 'days', 1, 60, 'Days', 3);
    $slots = in_int($b, 'slots', 1, 10000, 'Slots', 10);
    $date  = in_date($b, 'date', 'Departure date', date('Y-m-d', strtotime('+30 days')));
    [$lat, $lng] = in_coords($b);

    $id = tx(function ($pdo) use ($name, $type, $desc, $price, $days, $slots, $date, $lat, $lng) {
        q(
            'INSERT INTO destinations (name, type, description, latitude, longitude) VALUES (?, ?, ?, ?, ?)',
            [$name, $type, $desc, $lat, $lng]
        );
        $id = (int) $pdo->lastInsertId();
        q(
            'INSERT INTO packages (destination_id, days, price, slots, departure_date) VALUES (?, ?, ?, ?, ?)',
            [$id, $days, $price, $slots, $date]
        );
        return $id;
    });
    log_activity($admin['id'], "Destination $name added");
    json_out(['id' => $id], 201);
});

route('PUT', '/destinations/{id}', 'admin', function (array $p) {
    $admin = current_user();
    $dest = destination_row($p['id']);
    $b = body();
    $name = in_str($b, 'name', 1, 120, 'Destination name');
    $type = in_str($b, 'type', 0, 40, 'Type');
    $desc = in_str($b, 'description', 0, 500, 'Description');
    [$lat, $lng] = in_coords($b);
    q(
        'UPDATE destinations SET name = ?, type = COALESCE(NULLIF(?, \'\'), type), description = ?,
                latitude = ?, longitude = ? WHERE id = ?',
        [$name, $type, $desc, $lat, $lng, $dest['id']]
    );
    log_activity($admin['id'], "Destination $name updated");
    return ['ok' => true];
});

route('POST', '/destinations/{id}/image', 'admin', function (array $p) {
    $admin = current_user();
    $dest = destination_row($p['id']);
    if (empty($_FILES['image'])) {
        fail(422, 'Choose an image to upload.');
    }
    $path = save_uploaded_image($_FILES['image']);
    q('UPDATE destinations SET image = ? WHERE id = ?', [$path, $dest['id']]);
    remove_uploaded_image($dest['image']);
    log_activity($admin['id'], 'Photo updated for ' . $dest['name']);
    return ['image' => $path];
});

route('DELETE', '/destinations/{id}', 'admin', function (array $p) {
    $admin = current_user();
    $dest = destination_row($p['id']);
    $blocked = "Can't delete " . $dest['name'] . ': it has bookings.';

    if (q(
        'SELECT 1 FROM bookings b JOIN packages p ON p.id = b.package_id WHERE p.destination_id = ? LIMIT 1',
        [$dest['id']]
    )->fetch()) {
        fail(409, $blocked);
    }
    try {
        q('DELETE FROM destinations WHERE id = ?', [$dest['id']]); // packages go with it (ON DELETE CASCADE)
    } catch (PDOException $e) {
        if (($e->errorInfo[1] ?? 0) === 1451) { // a booking appeared in the meantime
            fail(409, $blocked);
        }
        throw $e;
    }
    remove_uploaded_image($dest['image']);
    log_activity($admin['id'], 'Destination ' . $dest['name'] . ' deleted');
    return ['ok' => true];
});

route('PUT', '/packages/{id}', 'admin', function (array $p) {
    $admin = current_user();
    $row = ctype_digit($p['id'])
        ? q(
            'SELECT p.id, d.name FROM packages p JOIN destinations d ON d.id = p.destination_id WHERE p.id = ?',
            [$p['id']]
        )->fetch()
        : false;
    if (!$row) {
        fail(404, 'Package not found.');
    }
    $b = body();
    $price = in_money($b, 'price', 'Price');
    $slots = in_int($b, 'slots', 0, 10000, 'Slots');
    // Optional: a new departure date (this is how a departed package is reopened).
    $date = (($b['date'] ?? '') === '') ? null : in_date($b, 'date', 'Departure date');
    q(
        'UPDATE packages SET price = ?, slots = ?, departure_date = COALESCE(?, departure_date) WHERE id = ?',
        [$price, $slots, $date, $row['id']]
    );
    log_activity($admin['id'], 'Package ' . $row['name'] . ' updated');
    return ['ok' => true];
});

/* ------------------------------------------------------------------ users, reviews, reports */

route('GET', '/admin/users', 'admin', function () {
    $rows = q('SELECT id, username, email, role, email_verified, created_at FROM users ORDER BY id')->fetchAll();
    return ['users' => array_map(fn ($u) => [
        'id'       => (int) $u['id'],
        'username' => $u['username'],
        'email'    => $u['email'],
        'role'     => $u['role'],
        'verified' => (bool) $u['email_verified'],
    ], $rows)];
});

route('GET', '/admin/reviews', 'admin', function () {
    $rows = q(
        'SELECT r.id, r.stars, r.comment, u.username, b.ref
         FROM reviews r JOIN users u ON u.id = r.user_id JOIN bookings b ON b.id = r.booking_id
         ORDER BY r.id DESC'
    )->fetchAll();
    return ['reviews' => array_map(fn ($r) => [
        'id'       => (int) $r['id'],
        'stars'    => (int) $r['stars'],
        'text'     => $r['comment'],
        'username' => $r['username'],
        'ref'      => $r['ref'],
    ], $rows)];
});

route('DELETE', '/admin/reviews/{id}', 'admin', function (array $p) {
    $admin = current_user();
    if (!ctype_digit($p['id'])) {
        fail(404, 'Review not found.');
    }
    $deleted = q('DELETE FROM reviews WHERE id = ?', [$p['id']])->rowCount();
    if ($deleted === 0) {
        fail(404, 'Review not found.');
    }
    log_activity($admin['id'], 'Review removed');
    return ['ok' => true];
});

route('GET', '/admin/report', 'admin', function () {
    $totals = q(
        'SELECT COALESCE(SUM(total), 0) AS sales, COUNT(*) AS bookings
         FROM bookings WHERE status NOT IN (\'cancelled\', \'rejected\')'
    )->fetch();
    $by = q(
        'SELECT d.name, SUM(b.total) AS total
         FROM bookings b JOIN packages p ON p.id = b.package_id JOIN destinations d ON d.id = p.destination_id
         WHERE b.status NOT IN (\'cancelled\', \'rejected\')
         GROUP BY d.id, d.name ORDER BY total DESC'
    )->fetchAll();
    $log = q('SELECT message, created_at FROM activity_log ORDER BY id DESC LIMIT 8')->fetchAll();

    return [
        'sales'         => (float) $totals['sales'],
        'bookingCount'  => (int) $totals['bookings'],
        'byDestination' => array_map(fn ($r) => ['name' => $r['name'], 'total' => (float) $r['total']], $by),
        'log'           => array_map(fn ($r) => ['message' => $r['message'], 'at' => $r['created_at']], $log),
    ];
});
