<?php
// Wanderlux API configuration.
// Defaults match a fresh WAMP install (MySQL user "root" with an empty password).
// For anything beyond local development, create a dedicated MySQL user instead of root.

return [
    'db' => [
        'host' => '127.0.0.1',
        'port' => 3306,
        'name' => 'wanderlux',
        'user' => 'root',
        'pass' => '',
    ],

    'timezone' => 'Asia/Manila',

    // Show real error messages in API responses. Keep false anywhere public.
    'debug' => false,

    // true  = the register response includes the verification token so the
    //         "Open confirmation link" button works without email (demo mode).
    // false = the token is only sent by email (see send_verification_email()).
    'demo_mode' => true,

    // Used to build the link inside the verification email.
    'public_url' => 'http://localhost/wanderlux/',

    // Where admin photo uploads are stored (folder is created automatically).
    // Layout: www/wanderlux/api (this folder) and www/wanderlux/uploads.
    'upload_dir' => __DIR__ . '/../uploads',

    'max_failed_logins' => 3,
    'lockout_minutes'   => 15,
];
