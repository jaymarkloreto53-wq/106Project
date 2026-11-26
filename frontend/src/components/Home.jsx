import { useApp } from "../AppContext.js";
import { api } from "../api.js";
import { useLoad } from "../useLoad.js";
import { money } from "../data.js";
import Pic from "./Pic.jsx";
import Hero from "./Hero.jsx";

const LIVE = ["pending approval", "approved"];

/* A big clickable summary box. */
function Tile({ label, value, note, onClick }) {
  return (
    <button className="tile" onClick={onClick}>
      <span className="tile-label">{label}</span>
      <span className="tile-value">{value}</span>
      <span className="tile-note">{note}</span>
    </button>
  );
}

/* ------------------------------------------------------------------ visitors (not logged in) */

function GuestHome() {
  const { db, dest, start } = useApp();
  const photo = db.dests.find((d) => d.img)?.img;

  return (
    <>
      <Hero
        eyebrow="Philippines travel packages"
        title="Journeys crafted with care"
        text="Browse curated trips across the Philippines, check availability and book with confidence."
        image={photo}
        actions={
          <>
            <button className="btn" onClick={() => start("login")}>
              Log in
            </button>
            <button className="btn light" onClick={() => start("register")}>
              Sign up
            </button>
          </>
        }
      />
      <p className="mut">
        <small>Log in or create a free account to browse packages, explore the map and book.</small>
      </p>
      <h2 className="section-title">Popular destinations</h2>
      <div className="grid">
        {db.pkgs.slice(0, 3).map((p) => {
          const d = dest(p.d);
          return (
            <div className="card" key={p.id}>
              <Pic d={d} />
              <h3>{d.name}</h3>
              <small>
                {p.days} days · from {money(p.price)}
              </small>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ customers */

function CustomerHome() {
  const { db, dest, user, go, pick } = useApp();
  const { data } = useLoad(() => api.get("bookings"));

  const bookings = data?.bookings ?? [];
  const active = bookings.filter((b) => LIVE.includes(b.status));
  const pending = active.filter((b) => b.status === "pending approval").length;
  const next = active
    .filter((b) => !b.departed)
    .sort((a, b) => a.departureDate.localeCompare(b.departureDate))[0];
  const updates = data?.notifications.slice(0, 3) ?? [];
  const pinned = db.dests.filter((d) => typeof d.lat === "number").length;

  // Trips that are about to sell out.
  const fillingFast = [...db.pkgs]
    .filter((p) => p.slots > 0 && !p.departed)
    .sort((a, b) => a.slots - b.slots)
    .slice(0, 3);

  const photo = (db.dests.find((d) => d.name === "Palawan") || db.dests.find((d) => d.img))?.img;

  return (
    <>
      <Hero
        eyebrow={`Welcome back, ${user.u}`}
        title="Where to next?"
        text={
          next ? (
            <>
              Your next trip: {next.destination} on <span className="nowrap">{next.departureDate}</span>.
            </>
          ) : (
            "Pick a package, check availability and book in minutes."
          )
        }
        image={photo}
        actions={
          <>
            <button className="btn" onClick={() => go("browse")}>
              Browse packages
            </button>
            <button className="btn light" onClick={() => go("map")}>
              Explore the map
            </button>
          </>
        }
      />

      {updates.length > 0 && (
        <section aria-label="Updates">
          <div className="card okmsg">
            {updates.map((n, i) => (
              <div key={i}>{n}</div>
            ))}
          </div>
        </section>
      )}

      <h2 className="section-title">Quick actions</h2>
      <div className="tiles">
        <Tile label="Packages" value={db.pkgs.length} note="trips available to book" onClick={() => go("browse")} />
        <Tile label="Map" value={pinned} note="destinations to explore" onClick={() => go("map")} />
        <Tile
          label="My bookings"
          value={data ? active.length : "–"}
          note={data ? (pending ? `${pending} awaiting approval` : "active bookings") : "loading…"}
          onClick={() => go("mine")}
        />
      </div>

      <h2 className="section-title">Your next trip</h2>
      {next ? (
        <div className="card next-trip">
          <div>
            <h3>
              {next.destination} · {next.ref}
            </h3>
            <p>
              {next.departureDate} · {next.travelers} traveler{next.travelers > 1 ? "s" : ""} · {money(next.total)}
            </p>
          </div>
          <div className="row">
            <span className={`tag ${next.status.split(" ")[0]}`}>{next.status}</span>
            <button className="btn sm" onClick={() => go("mine")}>
              View booking
            </button>
          </div>
        </div>
      ) : (
        <div className="card next-trip">
          <p style={{ margin: 0 }}>{data ? "No trips booked yet." : "Loading…"}</p>
          <button className="btn sm" onClick={() => go("browse")}>
            Find a trip
          </button>
        </div>
      )}

      {fillingFast.length > 0 && (
        <>
          <h2 className="section-title">Filling up fast</h2>
          <div className="grid">
            {fillingFast.map((p) => {
              const d = dest(p.d);
              return (
                <div className="card" key={p.id}>
                  <Pic d={d} />
                  <h3>{d.name}</h3>
                  <span className="tag">
                    Only {p.slots} slot{p.slots === 1 ? "" : "s"} left
                  </span>
                  <p>
                    {p.days} days · departs {p.date}
                    <br />
                    <span className="price">from {money(p.price)}</span> <small>per traveler</small>
                  </p>
                  <button className="btn" onClick={() => pick(p.id)}>
                    Book a trip
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ admin */

function AdminHome() {
  const { db, user, go, setTab } = useApp();
  const { data } = useLoad(() => api.get("bookings"));
  const pending = (data?.bookings ?? []).filter((b) => b.status === "pending approval");
  const photo = db.dests.find((d) => d.img)?.img;

  const open = (tab) => {
    setTab(tab);
    go("admin");
  };

  return (
    <>
      <Hero
        eyebrow={`Signed in as ${user.u}`}
        title="Admin overview"
        text={
          data
            ? pending.length
              ? `${pending.length} booking${pending.length === 1 ? "" : "s"} waiting for your approval.`
              : "No bookings are waiting for approval."
            : "Loading the latest bookings…"
        }
        image={photo}
        actions={
          <>
            <button className="btn" onClick={() => open(pending.length ? "Bookings" : "Destinations")}>
              Open dashboard
            </button>
            <button className="btn light" onClick={() => go("map")}>
              Explore the map
            </button>
          </>
        }
      />

      <h2 className="section-title">Manage</h2>
      <div className="tiles">
        <Tile
          label="Pending approvals"
          value={data ? pending.length : "–"}
          note="bookings to review"
          onClick={() => open("Bookings")}
        />
        <Tile label="Destinations" value={db.dests.length} note="trips and photos" onClick={() => open("Destinations")} />
        <Tile label="Packages" value={db.pkgs.length} note="prices and slots" onClick={() => open("Packages")} />
        <Tile label="Reports" value="₱" note="sales and activity" onClick={() => open("Reports")} />
      </div>

      {pending.length > 0 && (
        <>
          <h2 className="section-title">Needs your attention</h2>
          {pending.slice(0, 3).map((b) => (
            <div className="card next-trip" key={b.ref} style={{ marginBottom: ".6rem" }}>
              <span>
                <b>{b.ref}</b> · {b.destination} · {b.travelers}× · {b.username} · {money(b.total)}
              </span>
              <button className="btn sm" onClick={() => open("Bookings")}>
                Review
              </button>
            </div>
          ))}
        </>
      )}
    </>
  );
}

export default function Home() {
  const { user } = useApp();
  if (!user) return <GuestHome />;
  return user.role === "admin" ? <AdminHome /> : <CustomerHome />;
}
