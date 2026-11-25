import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useApp } from "../AppContext.js";
import { money } from "../data.js";
import Pic from "./Pic.jsx";

const PH_CENTER = [12.5, 122.5];
const PH_ZOOM = 6;

// Great-circle distance in km.
function distanceKm(a, b) {
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

const km = (n) => Math.round(n).toLocaleString("en-US") + " km";

const pinIcon = (active) =>
  L.divIcon({
    className: "wl-pin-wrap",
    html: `<span class="wl-pin${active ? " active" : ""}"></span>`,
    iconSize: [28, 36],
    iconAnchor: [14, 34],
    popupAnchor: [0, -32],
  });

// Popup content is built with DOM nodes + textContent, so destination text can never inject HTML.
function buildPopup(d, pkg, onAction, actionLabel) {
  const el = document.createElement("div");
  el.className = "wl-popup";
  const h = document.createElement("h3");
  h.textContent = d.name;
  const tag = document.createElement("span");
  tag.className = "tag";
  tag.textContent = d.type;
  const p = document.createElement("p");
  p.textContent = d.desc;
  el.append(h, tag, p);
  if (pkg) {
    const info = document.createElement("p");
    info.textContent = `${pkg.days} days · departs ${pkg.date} · from ${money(pkg.price)}`;
    el.append(info);
  }
  if (actionLabel) {
    const b = document.createElement("button");
    b.className = "btn sm";
    b.type = "button";
    b.textContent = actionLabel;
    b.addEventListener("click", onAction);
    el.append(b);
  }
  return el;
}

export default function MapView() {
  const { db, user, go, start, pick } = useApp();
  const [type, setType] = useState("");
  const [selected, setSelected] = useState(null);
  const [me, setMe] = useState(null); // [lat, lng] once the visitor shares location
  const [geoMsg, setGeoMsg] = useState("");
  const [locating, setLocating] = useState(false);

  const mapEl = useRef(null);
  const map = useRef(null);
  const markers = useRef(new Map());
  const meLayer = useRef(null);

  const types = useMemo(() => [...new Set(db.dests.map((d) => d.type))], [db.dests]);

  // Destinations that have a map pin, with their package and (if known) distance from the visitor.
  const places = useMemo(
    () =>
      db.dests
        .filter((d) => typeof d.lat === "number" && typeof d.lng === "number")
        .filter((d) => !type || d.type === type)
        .map((d) => {
          const pkgs = db.pkgs.filter((p) => p.d === d.id);
          const pkg = pkgs.sort((a, b) => a.date.localeCompare(b.date))[0] || null;
          return { d, pkg, dist: me ? distanceKm(me, [d.lat, d.lng]) : null };
        })
        .sort((a, b) => (me ? a.dist - b.dist : 0)),
    [db.dests, db.pkgs, type, me],
  );

  // What the popup button does depends on who is looking.
  const actionFor = (pkg) => {
    if (!pkg) return { label: "", run: () => {} };
    if (!user) return { label: "Log in to book", run: () => start("login") };
    if (user.role === "admin") return { label: "", run: () => {} };
    return { label: "Book a trip", run: () => pick(pkg.id) };
  };
  const actionRef = useRef(actionFor);
  useEffect(() => {
    actionRef.current = actionFor;
  });

  // Create the map once.
  useEffect(() => {
    const m = L.map(mapEl.current, { scrollWheelZoom: true }).setView(PH_CENTER, PH_ZOOM);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(m);
    map.current = m;
    const store = markers.current;
    return () => {
      m.remove();
      map.current = null;
      store.clear();
    };
  }, []);

  // Redraw pins when the filter or data changes.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    markers.current.forEach((mk) => mk.remove());
    markers.current.clear();
    places.forEach(({ d, pkg }) => {
      const mk = L.marker([d.lat, d.lng], { icon: pinIcon(false), title: d.name, alt: d.name }).addTo(m);
      mk.bindPopup(() => {
        const a = actionRef.current(pkg);
        return buildPopup(d, pkg, a.run, a.label);
      });
      mk.on("click", () => setSelected(d.id));
      markers.current.set(d.id, mk);
    });
    if (places.length && !meLayer.current) {
      m.fitBounds(L.latLngBounds(places.map(({ d }) => [d.lat, d.lng])), { padding: [40, 40], maxZoom: 9 });
    }
    setSelected((s) => (places.some(({ d }) => d.id === s) ? s : null));
  }, [places]);

  // Highlight the selected pin.
  useEffect(() => {
    markers.current.forEach((mk, id) => mk.setIcon(pinIcon(id === selected)));
  }, [selected, places]);

  // Show the visitor's own position.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    meLayer.current?.remove();
    meLayer.current = null;
    if (!me) return;
    meLayer.current = L.circleMarker(me, {
      radius: 8,
      color: "#fff",
      weight: 3,
      fillColor: "#2f7f86",
      fillOpacity: 1,
    })
      .bindTooltip("You are here", { permanent: false })
      .addTo(m);
  }, [me]);

  const focus = (d) => {
    setSelected(d.id);
    const m = map.current;
    const mk = markers.current.get(d.id);
    if (!m || !mk) return;
    m.flyTo([d.lat, d.lng], Math.max(m.getZoom(), 9), { duration: 0.8 });
    m.once("moveend", () => mk.openPopup());
    mapEl.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  const locate = () => {
    if (!navigator.geolocation) {
      setGeoMsg("Your browser can't share its location.");
      return;
    }
    setLocating(true);
    setGeoMsg("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const here = [pos.coords.latitude, pos.coords.longitude];
        setMe(here);
        const m = map.current;
        if (m && places.length) {
          m.fitBounds(L.latLngBounds([here, ...places.map(({ d }) => [d.lat, d.lng])]), {
            padding: [40, 40],
            maxZoom: 9,
          });
        }
      },
      (err) => {
        setLocating(false);
        setGeoMsg(
          err.code === 1
            ? "Location permission was denied. Allow it in your browser to see distances."
            : "We couldn't find your location. Try again.",
        );
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  };

  const noPins = db.dests.every((d) => typeof d.lat !== "number");

  return (
    <>
      <h2>Explore the map</h2>
      <div className="map-bar">
        <div className="tabs" role="group" aria-label="Filter by trip type">
          <button aria-current={type === ""} onClick={() => setType("")}>
            All
          </button>
          {types.map((t) => (
            <button key={t} aria-current={type === t} onClick={() => setType(t)}>
              {t}
            </button>
          ))}
        </div>
        <button className="btn sm" onClick={locate} disabled={locating}>
          {locating ? "Locating…" : me ? "Update my location" : "Show my location"}
        </button>
      </div>
      {geoMsg && <p className="err" role="alert">{geoMsg}</p>}
      {me && (
        <p className="mut">
          <small>Distances are straight-line from your current location.</small>
        </p>
      )}

      <div className="map-layout">
        <div
          ref={mapEl}
          className="map-canvas"
          role="region"
          aria-label="Map of Wanderlux destinations"
        />
        <ul className="map-list">
          {noPins && <li className="card">No destinations have a map location yet.</li>}
          {!noPins && !places.length && <li className="card">No destinations match this filter.</li>}
          {places.map(({ d, pkg, dist }) => (
            <li key={d.id}>
              <button
                className={`card map-item${selected === d.id ? " active" : ""}`}
                onClick={() => focus(d)}
                aria-label={`Show ${d.name} on the map`}
              >
                <Pic d={d} />
                <h3>{d.name}</h3>
                <small>
                  {d.type}
                  {pkg ? ` · ${pkg.days} days · from ${money(pkg.price)}` : ""}
                  {dist != null ? ` · ${km(dist)} away` : ""}
                </small>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <p className="mut">
        <small>
          Map data ©{" "}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
            OpenStreetMap
          </a>{" "}
          contributors.
        </small>
      </p>
      <p>
        <button className="btn alt" onClick={() => go(user ? (user.role === "admin" ? "admin" : "browse") : "home")}>
          {user ? (user.role === "admin" ? "Back to dashboard" : "Back to packages") : "Back home"}
        </button>
      </p>
    </>
  );
}
