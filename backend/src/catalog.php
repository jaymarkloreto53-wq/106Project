<?php
declare(strict_types=1);

// Public catalogue: every destination and its package.
route('GET', '/catalog', 'public', function () {
    $destinations = q('SELECT id, name, type, description, image, art, latitude, longitude FROM destinations ORDER BY id')->fetchAll();
    $packages = q('SELECT id, destination_id, days, price, slots, departure_date, (departure_date < CURDATE()) AS departed FROM packages ORDER BY id')->fetchAll();

    return [
        'destinations' => array_map(fn ($d) => [
            'id'          => (int) $d['id'],
            'name'        => $d['name'],
            'type'        => $d['type'],
            'description' => $d['description'],
            'image'       => $d['image'],
            'art'         => $d['art'],
            'lat'         => $d['latitude'] !== null ? (float) $d['latitude'] : null,
            'lng'         => $d['longitude'] !== null ? (float) $d['longitude'] : null,
        ], $destinations),
        'packages' => array_map(fn ($p) => [
            'id'            => (int) $p['id'],
            'destinationId' => (int) $p['destination_id'],
            'days'          => (int) $p['days'],
            'price'         => (float) $p['price'],
            'slots'         => (int) $p['slots'],
            'departureDate' => $p['departure_date'],
            'departed'      => (bool) $p['departed'],
        ], $packages),
    ];
});
