# Wanderlux

Travel booking site: **React** frontend, **PHP** JSON API, **MySQL** database (runs on WAMP).

```
wanderlux/
├─ frontend/   React app (Vite). Build it, then copy dist/ to the web folder.
├─ backend/    PHP API (PDO + MySQL). Copy to <web folder>/api
└─ database/   SQL files
     wanderlux.sql          full database: tables + demo data  (import this first)
     add_map_coordinates.sql  only if you imported an OLD wanderlux.sql and want to keep your data
     create_db_user.sql     optional: a MySQL user limited to this database (instead of root)
     maintenance.sql        handy queries: reset passwords, unlock users, wipe test bookings
```

## Set up on WAMP (about 10 minutes)

You need WAMP running (green icon), and [Node.js](https://nodejs.org) installed to build the frontend.

**1. Create the database.** Open `http://localhost/phpmyadmin` (user `root`, empty password), click **Import**,
choose `database/wanderlux.sql`, click **Import**. This creates the `wanderlux` database.
(It drops and recreates it, so only do this on a fresh setup.)

**2. Put the backend in WAMP's web folder.** Copy the *contents* of `backend/` to
`C:\wamp64\www\wanderlux\api\` (so `C:\wamp64\www\wanderlux\api\index.php` exists).
If your MySQL `root` has a password, or you made a user with `create_db_user.sql`, edit
`api\config.php` (`db` → `user` / `pass`).

**3. Build the frontend** (in the `frontend` folder, PowerShell):

```powershell
npm.cmd install
npm.cmd run build
```

(If `npm` works for you without `.cmd`, use that. `.cmd` avoids the PowerShell script-policy error.)

**4. Copy the build.** Copy everything *inside* `frontend\dist\` into `C:\wamp64\www\wanderlux\`
(next to the `api` folder). You should now have `index.html`, `assets\`, `images\` and `api\` together.

**5. Open `http://localhost/wanderlux/`.**
Demo logins: `guest / guest123` (customer) and `admin / admin123` (admin).

### If something doesn't work
| Problem | Fix |
|---|---|
| "API was not found" / "Can't reach the server" | Open `http://localhost/wanderlux/api/index.php?r=catalog` in your browser. You should see JSON text. If you get 404, the folder layout is wrong: `index.php` must be directly inside `www\wanderlux\api\` (not in a `backend` subfolder). Find `www` via the WAMP tray icon → **www directory**. |
| "Cannot connect to the database" | MySQL isn't running (WAMP icon should be green), or `api\config.php` has the wrong user/password. |
| Photos you upload don't show | `www\wanderlux\uploads\` is created automatically on the first upload; check Windows lets Apache write there. |
| PowerShell blocks `npm` | Use `npm.cmd`, or run `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`. |

## Developing the frontend (hot reload)

Keep WAMP running with steps 1 and 2 done, then in `frontend`:

```powershell
npm.cmd run dev
```

Open **http://localhost:5173/wanderlux/**. Calls to `/wanderlux/api` and `/wanderlux/uploads` are forwarded to WAMP.
To use a different WAMP address or folder, copy `.env.example` to `.env.local`.

## Before it goes anywhere public

- Change the demo passwords (see `database/maintenance.sql`, query 1).
- In `backend/config.php`: set `demo_mode` to `false`, keep `debug` `false`, and set `public_url` to your real address.
  With `demo_mode` off the confirmation link is sent by email, so PHP's `mail()` must be configured
  (or confirm users by hand with `maintenance.sql`, query 4).
- Use a dedicated MySQL user (`database/create_db_user.sql`) instead of `root`, and serve the site over HTTPS.
- Payment is **simulated**: no card data is stored or charged. Connect a real payment provider before taking real money.

## How it works (short)

- Passwords are hashed (bcrypt). Three wrong passwords lock an account for 15 minutes.
- The server recalculates every price and checks slots inside a database transaction, so two people can't book the last seat.
- Customers can only see and change their own bookings. Admin routes are checked on the server, not just hidden in the UI.
- Photo uploads are checked (JPG/PNG/WebP, max 2 MB) and renamed; PHP files can't run from the uploads folder.
- The map uses OpenStreetMap through Leaflet (free, no API key).
