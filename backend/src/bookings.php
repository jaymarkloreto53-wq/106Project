<?php
declare(strict_types=1);

const PAYMENT_METHODS = ['Card', 'GCash', 'PayPal', 'Bank transfer'];
const LIVE_STATUSES   = ['pending approval', 'approved'];

const BOOKING_SQL = 'SELECT b.ref, b.package_id, d.name AS destination, p.departure_date, p.days,
        b.travelers, b.lead_name, b.phone, b.total, b.payment_method, b.status, b.created_at,
        u.username, r.stars AS review_stars, r.comment AS review_text
    FROM bookings b
    JOIN packages p ON p.id = b.package_id
    JOIN destinations d ON d.id = p.destination_id
    JOIN users u ON u.id = b.user_id
    LEFT JOIN reviews r ON r.booking_id = b.id';

function booking_out(array $r): array
{
    return [
        'ref'           => $r['ref'],
        'packageId'     => (int) $r['package_id'],
        'destination'   => $r['destination'],
        'departureDate' => $r['departure_date'],
        'days'          => (int) $r['days'],
        'travelers'     => (int) $r['travelers'],
        'leadName'      => $r['lead_name'],
        'phone'         => $r['phone'],
        'total'         => (float) $r['total'],
        'method'        => $r['payment_method'],
        'status'        => $r['status'],
        'createdAt'     => $r['created_at'],
        'username'      => $r['username'],
        'review'        => $r['review_stars'] !== null
            ? ['stars' => (int) $r['review_stars'], 'text' => $r['review_text']]
            : null,
    ];
}

function booking_by_ref(string $ref): array
{
    $row = q(BOOKING_SQL . ' WHERE b.ref = ?', [$ref])->fetch();
    if (!$row) {
        fail(404, 'Booking not found.');
    }
    return booking_out($row);
}

/**
 * Lock and return one of the CURRENT user's bookings together with its package
 * (call inside tx()). Other people's bookings look like "not found".
 */
function lock_own_booking(string $ref, int $userId): array
{
    $row = null;
    if (preg_match('/^WL-[0-9A-F]{6}$/', $ref)) {
        $row = q(
            'SELECT b.id, b.package_id, b.travelers, b.status, p.price, p.slots,
                    (p.departure_date < CURDATE()) AS departed
             FROM bookings b JOIN packages p ON p.id = b.package_id
             WHERE b.ref = ? AND b.user_id = ? FOR UPDATE',
            [$ref, $userId]
        )->fetch();
    }
    if (!$row) {
        fail(404, 'Booking not found.');
    }
    return $row;
}

function plural(int $n, string $word): string
{
    return "$n $word" . ($n === 1 ? '' : 's');
}

/* ---- list (customers: their own; admin: everyone's) ---- */
route('GET', '/bookings', 'user', function () {
    $u = current_user();
    if ($u['role'] === 'admin') {
        $rows = q(BOOKING_SQL . ' ORDER BY b.id DESC')->fetchAll();
        return ['bookings' => array_map('booking_out', $rows), 'notifications' => []];
    }
    $rows = q(BOOKING_SQL . ' WHERE b.user_id = ? ORDER BY b.id DESC', [$u['id']])->fetchAll();
    $notes = q('SELECT message FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 10', [$u['id']])
        ->fetchAll(PDO::FETCH_COLUMN);
    return ['bookings' => array_map('booking_out', $rows), 'notifications' => $notes];
});

/* ---- create (payment is simulated: no card data is stored or sent to a gateway) ---- */
route('POST', '/bookings', 'user', function () {
    $u = current_user();
    if ($u['role'] !== 'customer') {
        fail(403, 'Admin accounts cannot place bookings.');
    }
    $b = body();
    $packageId = in_int($b, 'packageId', 1, PHP_INT_MAX, 'Package');
    $travelers = in_int($b, 'travelers', 1, 20, 'Travelers');
    $lead      = in_str($b, 'leadName', 1, 120, 'Lead traveler name');
    $phone     = in_str($b, 'phone', 0, 40, 'Phone');
    if ($phone !== '' && !preg_match('/^[0-9+()\-\s.]{3,40}$/', $phone)) {
        fail(422, 'Enter a valid phone number.');
    }
    $method = $b['paymentMethod'] ?? '';
    if (!in_array($method, PAYMENT_METHODS, true)) {
        fail(422, 'Choose a payment method.');
    }
    if ($method === 'Card') {
        $last4 = (string) ($b['cardLast4'] ?? '');
        if (!preg_match('/^\d{4}$/', $last4)) {
            fail(422, 'Enter a valid card number.');
        }
        if ($last4 === '0000') { // demo rule from the original app: cards ending in 0000 are declined
            fail(402, 'Payment declined. Retry with another method or cancel.');
        }
    }

    $ref = tx(function () use ($u, $packageId, $travelers, $lead, $phone, $method) {
        $p = q(
            'SELECT id, price, slots, (departure_date < CURDATE()) AS departed
             FROM packages WHERE id = ? FOR UPDATE',
            [$packageId]
        )->fetch();
        if (!$p) {
            fail(404, 'That package no longer exists.');
        }
        if ((int) $p['departed'] === 1) {
            fail(409, 'This departure has already passed.');
        }
        if ($travelers > (int) $p['slots']) {
            $left = (int) $p['slots'];
            fail(409, "Only " . plural($left, 'slot') . " left. Lower the number of travelers or choose another package.");
        }
        q('UPDATE packages SET slots = slots - ? WHERE id = ?', [$travelers, $packageId]);

        $total = round((float) $p['price'] * $travelers, 2);
        for ($i = 0; ; $i++) {
            $ref = 'WL-' . strtoupper(bin2hex(random_bytes(3)));
            try {
                q(
                    'INSERT INTO bookings (ref, user_id, package_id, travelers, lead_name, phone, total, payment_method)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    [$ref, $u['id'], $packageId, $travelers, $lead, $phone, $total, $method]
                );
                break;
            } catch (PDOException $e) {
                if (($e->errorInfo[1] ?? 0) !== 1062 || $i >= 4) {
                    throw $e;
                }
            }
        }
        log_activity($u['id'], "Booking $ref saved (pending approval)");
        return $ref;
    });

    json_out(booking_by_ref($ref), 201);
});

/* ---- change number of travelers (needs re-approval) ---- */
route('PATCH', '/bookings/{ref}', 'user', function (array $p) {
    $u = current_user();
    $travelers = in_int(body(), 'travelers', 1, 20, 'Travelers');
    $ref = $p['ref'];

    tx(function () use ($u, $ref, $travelers) {
        $b = lock_own_booking($ref, $u['id']);
        if (!in_array($b['status'], LIVE_STATUSES, true)) {
            fail(409, 'This booking can no longer be changed.');
        }
        if ((int) $b['departed'] === 1) {
            fail(409, 'This departure has already passed.');
        }
        $diff = $travelers - (int) $b['travelers'];
        if ($diff === 0) {
            return;
        }
        if ($diff > (int) $b['slots']) {
            fail(409, 'Only ' . plural((int) $b['slots'], 'extra slot') . ' left.');
        }
        q('UPDATE packages SET slots = slots - ? WHERE id = ?', [$diff, $b['package_id']]);
        q(
            'UPDATE bookings SET travelers = ?, total = ?, status = \'pending approval\' WHERE id = ?',
            [$travelers, round((float) $b['price'] * $travelers, 2), $b['id']]
        );
        log_activity($u['id'], "Booking $ref modified");
    });

    return booking_by_ref($ref);
});

/* ---- cancel ---- */
route('POST', '/bookings/{ref}/cancel', 'user', function (array $p) {
    $u = current_user();
    $ref = $p['ref'];

    tx(function () use ($u, $ref) {
        $b = lock_own_booking($ref, $u['id']);
        if (!in_array($b['status'], LIVE_STATUSES, true)) {
            fail(409, 'This booking is already ' . $b['status'] . '.');
        }
        q('UPDATE packages SET slots = slots + ? WHERE id = ?', [$b['travelers'], $b['package_id']]);
        q('UPDATE bookings SET status = \'cancelled\' WHERE id = ?', [$b['id']]);
        log_activity($u['id'], "Booking $ref cancelled");
    });

    return booking_by_ref($ref);
});

/* ---- review (one per approved booking) ---- */
route('POST', '/bookings/{ref}/review', 'user', function (array $p) {
    $u = current_user();
    $ref = $p['ref'];
    $b = body();
    $stars = in_int($b, 'stars', 1, 5, 'Rating');
    $text  = in_str($b, 'text', 1, 1000, 'Review');

    tx(function () use ($u, $ref, $stars, $text) {
        $bk = lock_own_booking($ref, $u['id']);
        if ($bk['status'] !== 'approved') {
            fail(409, 'You can review a booking once it has been approved.');
        }
        try {
            q(
                'INSERT INTO reviews (booking_id, user_id, stars, comment) VALUES (?, ?, ?, ?)',
                [$bk['id'], $u['id'], $stars, $text]
            );
        } catch (PDOException $e) {
            if (($e->errorInfo[1] ?? 0) === 1062) {
                fail(409, 'You already reviewed this booking.');
            }
            throw $e;
        }
        log_activity($u['id'], "Review posted for $ref");
    });

    json_out(booking_by_ref($ref), 201);
});

/* ---- admin: approve / reject a pending booking ---- */
route('POST', '/bookings/{ref}/decision', 'admin', function (array $p) {
    $admin = current_user();
    $ref = $p['ref'];
    $status = body()['status'] ?? '';
    if (!in_array($status, ['approved', 'rejected'], true)) {
        fail(422, 'Decision must be "approved" or "rejected".');
    }

    tx(function () use ($admin, $ref, $status) {
        $b = null;
        if (preg_match('/^WL-[0-9A-F]{6}$/', $ref)) {
            $b = q(
                'SELECT b.id, b.user_id, b.package_id, b.travelers, b.status
                 FROM bookings b WHERE b.ref = ? FOR UPDATE',
                [$ref]
            )->fetch();
        }
        if (!$b) {
            fail(404, 'Booking not found.');
        }
        if ($b['status'] !== 'pending approval') {
            fail(409, 'Only bookings that are pending approval can be approved or rejected.');
        }
        if ($status === 'rejected') {
            q('UPDATE packages SET slots = slots + ? WHERE id = ?', [$b['travelers'], $b['package_id']]);
        }
        q('UPDATE bookings SET status = ? WHERE id = ?', [$status, $b['id']]);
        q('INSERT INTO notifications (user_id, message) VALUES (?, ?)', [$b['user_id'], "Booking $ref was $status."]);
        log_activity($admin['id'], "Booking $ref $status");
    });

    return booking_by_ref($ref);
});
