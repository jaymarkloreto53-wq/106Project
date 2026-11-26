import { useState } from "react";
import { useApp } from "../AppContext.js";
import { api } from "../api.js";
import { useLoad } from "../useLoad.js";
import { money } from "../data.js";

const TABS = ["Destinations", "Packages", "Bookings", "Users", "Reports"];
const gap = { marginBottom: ".6rem" };

function Status({ loading, error, reload }) {
  if (loading) return <p role="status">Loading…</p>;
  if (error)
    return (
      <p className="err" role="alert">
        {error}{" "}
        <button className="btn alt" onClick={reload}>
          Try again
        </button>
      </p>
    );
  return null;
}

/* ---------------------------------------------------------------- destinations */

function DestRow({ d }) {
  const { run, busy, refreshCatalog, toast } = useApp();
  const [name, setName] = useState(d.name);
  const [type, setType] = useState(d.type);
  const [desc, setDesc] = useState(d.desc);
  const [lat, setLat] = useState(d.lat ?? "");
  const [lng, setLng] = useState(d.lng ?? "");

  const save = async () => {
    const ok = await run(
      () => api.put(`destinations/${d.id}`, { name, type, description: desc, lat, lng }),
      `Saved: ${name}`,
    );
    if (ok) refreshCatalog();
  };

  const upload = async (file) => {
    if (!file) return;
    if (file.size > 2e6) return toast("Choose an image under 2 MB.");
    const form = new FormData();
    form.append("image", file);
    const ok = await run(() => api.upload(`destinations/${d.id}/image`, form), `Photo updated for ${d.name}`);
    if (ok) refreshCatalog();
  };

  const remove = async () => {
    if (!window.confirm(`Delete ${d.name} and its packages?`)) return;
    const ok = await run(() => api.del(`destinations/${d.id}`), `Deleted ${d.name}`);
    if (ok) refreshCatalog();
  };

  return (
    <div className="card row" style={gap}>
      <input value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 2 }} aria-label="Name" />
      <input value={type} onChange={(e) => setType(e.target.value)} style={{ flex: 1 }} aria-label="Type" />
      <input value={desc} onChange={(e) => setDesc(e.target.value)} style={{ flex: 4 }} aria-label="Description" />
      <input type="number" step="any" placeholder="Lat" value={lat} onChange={(e) => setLat(e.target.value)} style={{ width: "6.5rem" }} aria-label="Latitude" />
      <input type="number" step="any" placeholder="Lng" value={lng} onChange={(e) => setLng(e.target.value)} style={{ width: "6.5rem" }} aria-label="Longitude" />
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label={`Photo for ${d.name}`}
        onChange={(e) => {
          upload(e.target.files[0]);
          e.target.value = "";
        }}
        style={{ flex: 3 }}
      />
      <button className="btn sm" disabled={busy} onClick={save}>
        Save
      </button>{" "}
      <button className="btn sm bad" disabled={busy} onClick={remove}>
        Delete
      </button>
    </div>
  );
}

const EMPTY = { name: "", type: "", desc: "", days: "", price: "", slots: "", date: "", lat: "", lng: "" };

function NewDest() {
  const { run, busy, refreshCatalog, toast } = useApp();
  const [f, setF] = useState(EMPTY);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const add = async () => {
    if (!f.name.trim()) return toast("Enter a destination name.");
    if (!Number(f.price)) return toast("Enter a package price so travelers can book it.");
    const body = {
      name: f.name,
      type: f.type,
      description: f.desc,
      price: Number(f.price),
      lat: f.lat,
      lng: f.lng,
    };
    if (f.days) body.days = Number(f.days);
    if (f.slots) body.slots = Number(f.slots);
    if (f.date) body.date = f.date;
    const ok = await run(() => api.post("destinations", body), `Added ${f.name.trim()}`);
    if (ok) {
      setF(EMPTY);
      refreshCatalog();
    }
  };

  return (
    <div className="card row">
      <input placeholder="New destination" value={f.name} onChange={set("name")} style={{ flex: 2 }} />
      <input placeholder="Type" value={f.type} onChange={set("type")} style={{ flex: 1 }} />
      <input placeholder="Description" value={f.desc} onChange={set("desc")} style={{ flex: 4 }} />
      <input type="number" min="1" placeholder="Days" value={f.days} onChange={set("days")} style={{ width: "5rem" }} aria-label="Days" />
      <input type="number" min="1" placeholder="Price ₱" value={f.price} onChange={set("price")} style={{ width: "7rem" }} aria-label="Price" />
      <input type="number" min="1" placeholder="Slots" value={f.slots} onChange={set("slots")} style={{ width: "5rem" }} aria-label="Slots" />
      <input type="date" value={f.date} onChange={set("date")} aria-label="Departure date" />
      <input type="number" step="any" placeholder="Latitude" value={f.lat} onChange={set("lat")} style={{ width: "7rem" }} aria-label="Latitude" />
      <input type="number" step="any" placeholder="Longitude" value={f.lng} onChange={set("lng")} style={{ width: "7rem" }} aria-label="Longitude" />
      <button className="btn sm" disabled={busy} onClick={add}>
        Add
      </button>
    </div>
  );
}

function Destinations() {
  const { db } = useApp();
  return (
    <>
      {db.dests.map((d) => (
        <DestRow key={`${d.id}-${d.name}-${d.lat}-${d.lng}`} d={d} />
      ))}
      <NewDest />
    </>
  );
}

/* ---------------------------------------------------------------- packages */

function PkgRow({ p }) {
  const { dest, run, busy, refreshCatalog } = useApp();
  const [price, setPrice] = useState(String(p.price));
  const [slots, setSlots] = useState(String(p.slots));
  const [date, setDate] = useState(p.date);

  const update = async () => {
    const ok = await run(
      () => api.put(`packages/${p.id}`, { price: Number(price), slots: Number(slots), date }),
      "Package updated",
    );
    if (ok) refreshCatalog();
  };

  return (
    <div className="card row" style={gap}>
      <b style={{ flex: 2 }}>
        {dest(p.d)?.name} · {p.days}d {p.departed && <span className="tag cancelled">Departed</span>}
      </b>
      <label style={{ margin: 0 }}>Departs</label>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Departure date" />
      <label style={{ margin: 0 }}>Price ₱</label>
      <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} style={{ width: "7rem" }} />
      <label style={{ margin: 0 }}>Slots</label>
      <input type="number" value={slots} onChange={(e) => setSlots(e.target.value)} style={{ width: "5rem" }} />
      <button className="btn sm" disabled={busy} onClick={update}>
        Update
      </button>
    </div>
  );
}

function Packages() {
  const { db } = useApp();
  // The key makes each row re-read its numbers when a booking changes the slot count.
  return db.pkgs.map((p) => <PkgRow key={`${p.id}-${p.price}-${p.slots}-${p.date}`} p={p} />);
}

/* ---------------------------------------------------------------- bookings */

function Bookings() {
  const { run, busy, refreshCatalog } = useApp();
  const { data, loading, error, reload } = useLoad(() => api.get("bookings"));

  const decide = async (ref, status) => {
    const ok = await run(() => api.post(`bookings/${ref}/decision`, { status }), `Booking ${ref} ${status}`);
    if (ok) {
      refreshCatalog();
      reload();
    }
  };

  return (
    <>
      <Status loading={loading} error={error} reload={reload} />
      {data &&
        (data.bookings.length ? (
          data.bookings.map((b) => (
            <div className="card row" style={{ ...gap, justifyContent: "space-between" }} key={b.ref}>
              <span>
                <b>{b.ref}</b> · {b.destination} · {b.travelers}× · {b.username} · {money(b.total)}{" "}
                <span className={`tag ${b.status.split(" ")[0]}`}>{b.status}</span>
              </span>
              {b.status === "pending approval" && (
                <span>
                  <button className="btn sm" disabled={busy} onClick={() => decide(b.ref, "approved")}>
                    Approve
                  </button>{" "}
                  <button className="btn sm bad" disabled={busy} onClick={() => decide(b.ref, "rejected")}>
                    Reject
                  </button>
                </span>
              )}
            </div>
          ))
        ) : (
          <p>No bookings yet.</p>
        ))}
    </>
  );
}

/* ---------------------------------------------------------------- users + reviews */

function Users() {
  const { run, busy } = useApp();
  const users = useLoad(() => api.get("admin/users"));
  const reviews = useLoad(() => api.get("admin/reviews"));

  const remove = async (id) => {
    if (await run(() => api.del(`admin/reviews/${id}`), "Review removed")) reviews.reload();
  };

  return (
    <>
      <h3>Users</h3>
      <Status loading={users.loading} error={users.error} reload={users.reload} />
      {users.data && (
        <div className="scroll">
          {users.data.users.map((u) => (
            <p key={u.id}>
              {u.username} · {u.role} · {u.email}
              {u.verified ? "" : " · not confirmed"}
            </p>
          ))}
        </div>
      )}
      <h3>Reviews</h3>
      <Status loading={reviews.loading} error={reviews.error} reload={reviews.reload} />
      {reviews.data &&
        (reviews.data.reviews.length ? (
          reviews.data.reviews.map((r) => (
            <div className="card row" style={{ ...gap, justifyContent: "space-between" }} key={r.id}>
              <span>
                {r.username} {"★".repeat(r.stars)} {r.text}
              </span>
              <button className="btn sm bad" disabled={busy} onClick={() => remove(r.id)}>
                Remove
              </button>
            </div>
          ))
        ) : (
          <p>No reviews to manage yet.</p>
        ))}
    </>
  );
}

/* ---------------------------------------------------------------- reports */

function Reports() {
  const { data: r, loading, error, reload } = useLoad(() => api.get("admin/report"));
  const mx = r ? Math.max(1, ...r.byDestination.map((x) => x.total)) : 1;

  return (
    <>
      <Status loading={loading} error={error} reload={reload} />
      {r && (
        <>
          <p>
            Sales (excluding cancelled and rejected): <b className="price">{money(r.sales)}</b> across{" "}
            {r.bookingCount} booking{r.bookingCount === 1 ? "" : "s"}.
          </p>
          <h3>Sales by destination</h3>
          {r.byDestination.length ? (
            r.byDestination.map((x) => (
              <div key={x.name}>
                <p style={{ margin: ".3rem 0" }}>
                  {x.name} · {money(x.total)}
                </p>
                <div className="bar" style={{ width: `${(x.total / mx) * 100}%` }} />
              </div>
            ))
          ) : (
            <p>No sales yet. Book a trip as the guest user to see trends.</p>
          )}
          <h3 style={{ marginTop: "1.5rem" }}>Activity log</h3>
          {r.log.length ? (
            r.log.map((l, i) => (
              <div key={i}>
                <small>
                  {l.at} · {l.message}
                </small>
              </div>
            ))
          ) : (
            <small>Nothing logged yet.</small>
          )}
        </>
      )}
    </>
  );
}

const PANELS = { Destinations, Packages, Bookings, Users, Reports };

export default function Admin() {
  const { tab, setTab, logout } = useApp();
  const Panel = PANELS[tab];

  return (
    <>
      <h2>Admin dashboard</h2>
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t} aria-current={tab === t} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      <Panel />
      <p style={{ marginTop: "2rem" }}>
        <button className="btn alt" onClick={logout}>
          Log out
        </button>
      </p>
    </>
  );
}
