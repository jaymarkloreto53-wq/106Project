import { useState } from "react";
import { useApp } from "../AppContext.js";
import { api } from "../api.js";
import { useLoad } from "../useLoad.js";
import { money } from "../data.js";

function BookingCard({ b, reload }) {
  const { run, busy, refreshCatalog, toast } = useApp();
  const live = !["cancelled", "rejected"].includes(b.status);
  const canChange = live && !b.departed; // a trip that has already left can't be changed or cancelled
  const [count, setCount] = useState(String(b.travelers));
  const [stars, setStars] = useState(5);
  const [text, setText] = useState("");

  const changed = async (fn, msg) => {
    if (await run(fn, msg)) {
      refreshCatalog(); // slot counts moved
      reload();
    }
  };

  return (
    <div className="card" style={{ marginBottom: "1rem" }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3>
          {b.destination} · {b.ref}
        </h3>
        <span className={`tag ${b.status.split(" ")[0]}`}>{b.status}</span>
      </div>
      <p>
        {b.departureDate} · {b.travelers} traveler{b.travelers > 1 ? "s" : ""} · {money(b.total)} via {b.method}
      </p>
      {live && b.departed && (
        <p className="mut">
          <small>This trip has already departed, so it can no longer be changed or cancelled.</small>
        </p>
      )}
      {canChange && (
        <div className="row">
          <label htmlFor={`m${b.ref}`} style={{ margin: 0 }}>
            Travelers
          </label>
          <input
            id={`m${b.ref}`}
            type="number"
            min="1"
            value={count}
            onChange={(e) => setCount(e.target.value)}
            style={{ width: "5rem" }}
          />
          <button
            className="btn sm"
            disabled={busy}
            onClick={() => changed(() => api.patch(`bookings/${b.ref}`, { travelers: Number(count) }), "Booking updated")}
          >
            Update
          </button>
          <button
            className="btn sm bad"
            disabled={busy}
            onClick={() => changed(() => api.post(`bookings/${b.ref}/cancel`), "Booking cancelled")}
          >
            Cancel booking
          </button>
        </div>
      )}
      {b.status === "approved" &&
        (b.review ? (
          <p>
            Your review: {"★".repeat(b.review.stars)} {b.review.text}
          </p>
        ) : (
          <>
            <h3 style={{ marginTop: "1rem" }}>Review and rating</h3>
            <small>Opens after your trip. For this demo it's open once a booking is approved.</small>
            <div className="stars">
              {[1, 2, 3, 4, 5].map((i) => (
                <button key={i} aria-label={`${i} stars`} onClick={() => setStars(i)}>
                  {i <= stars ? "★" : "☆"}
                </button>
              ))}
            </div>
            <textarea
              rows={2}
              placeholder="How was the trip?"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <p>
              <button
                className="btn sm"
                disabled={busy}
                onClick={() => {
                  if (!text.trim()) return toast("Write a few words first.");
                  changed(() => api.post(`bookings/${b.ref}/review`, { stars, text: text.trim() }), "Review posted");
                }}
              >
                Post review
              </button>
            </p>
          </>
        ))}
    </div>
  );
}

export default function MyBookings() {
  const { go, logout } = useApp();
  const { data, error, loading, reload } = useLoad(() => api.get("bookings"));

  return (
    <>
      <h2>My bookings</h2>
      {loading && <p role="status">Loading your bookings…</p>}
      {error && (
        <p className="err" role="alert">
          {error}{" "}
          <button className="btn alt" onClick={reload}>
            Try again
          </button>
        </p>
      )}
      {data && (
        <>
          {data.notifications.length > 0 && (
            <div className="card okmsg" style={{ marginBottom: "1rem" }}>
              {data.notifications.slice(0, 3).map((n, i) => (
                <div key={i}>{n}</div>
              ))}
            </div>
          )}
          {data.bookings.length ? (
            data.bookings.map((b) => <BookingCard key={b.ref} b={b} reload={reload} />)
          ) : (
            <>
              <p>No bookings yet. Pick a package to start.</p>
              <button className="btn" onClick={() => go("browse")}>
                Browse packages
              </button>
            </>
          )}
        </>
      )}
      
    </>
  );
}
