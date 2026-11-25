import { useCallback, useEffect, useRef, useState } from "react";
import { AppContext } from "./AppContext.js";
import { api, ApiError } from "./api.js";
import { normalizeCatalog } from "./data.js";
import Nav from "./components/Nav.jsx";
import Home from "./components/Home.jsx";
import Auth from "./components/Auth.jsx";
import Browse from "./components/Browse.jsx";
import Book from "./components/Book.jsx";
import Pay from "./components/Pay.jsx";
import Done from "./components/Done.jsx";
import MyBookings from "./components/MyBookings.jsx";
import Admin from "./components/Admin.jsx";
import LoggedOut from "./components/LoggedOut.jsx";
import MapView from "./components/MapView.jsx";

const VIEWS = {
  home: Home,
  auth: Auth,
  browse: Browse,
  book: Book,
  pay: Pay,
  done: Done,
  mine: MyBookings,
  admin: Admin,
  end: LoggedOut,
  map: MapView,
};

// Who may open which screen. Everything else is public. (The server enforces this again.)
const ROLE_ONLY = { browse: "customer", book: "customer", pay: "customer", done: "customer", mine: "customer", admin: "admin" };
// Screens any logged-in user (customer or admin) may open; guests are sent to the login screen.
const LOGIN_ONLY = new Set(["map"]);
// Screens that show live slot counts: refresh the catalogue whenever they open.
const FRESH_DATA = new Set(["home", "browse", "book", "map"]);

const toUser = (u) => (u ? { id: u.id, u: u.username, email: u.email, role: u.role } : null);

export default function App() {
  const [catalog, setCatalog] = useState({ dests: [], pkgs: [] });
  const [boot, setBoot] = useState({ ready: false, error: "" });
  const [user, setUser] = useState(null);

  const [view, setView] = useState("home");
  const [mode, setMode] = useState("login");
  const [filters, setFilters] = useState({ date: "", budget: "", type: "" });
  const [pkgId, setPkgId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [tab, setTab] = useState("Destinations");
  const [err, setErr] = useState("");
  const [reg, setReg] = useState(null); // { email, token } while waiting for email confirmation
  const [last, setLast] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const toastTimer = useRef(null);

  const dest = (id) => catalog.dests.find((d) => d.id == id);
  const pk = (id) => catalog.pkgs.find((p) => p.id == id);

  /* ---- small helpers ---- */
  const toast = useCallback((m) => {
    setToastMsg(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(""), 3200);
  }, []);

  const refreshCatalog = useCallback(async () => {
    try {
      setCatalog(normalizeCatalog(await api.get("catalog")));
    } catch {
      // Keep showing the last known data; the next action will report a real problem.
    }
  }, []);

  const go = useCallback(
    (v, e = "") => {
      setView(v);
      setErr(e);
      window.scrollTo(0, 0);
      if (FRESH_DATA.has(v)) refreshCatalog();
    },
    [refreshCatalog],
  );

  const start = (m) => {
    setMode(m);
    go("auth");
  };

  // Run an API action: disables buttons while it runs, shows errors as a toast, signs out on an
  // expired session. Returns the result, or undefined if it failed.
  const run = async (fn, successMsg) => {
    setBusy(true);
    try {
      const result = await fn();
      if (successMsg) toast(successMsg);
      return result;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401 && user) {
        setUser(null);
        setMode("login");
        go("auth", "Your session expired. Please log in again.");
      } else {
        toast(e.message);
      }
      return undefined;
    } finally {
      setBusy(false);
    }
  };

  /* ---- startup: catalogue + existing session + email confirmation link ---- */
  const startup = useCallback(async () => {
    try {
      const token = new URLSearchParams(window.location.search).get("verify");
      const [cat, me] = await Promise.all([api.get("catalog"), api.get("auth/me")]);
      setCatalog(normalizeCatalog(cat));
      setUser(toUser(me.user));
      if (token) {
        window.history.replaceState({}, "", window.location.pathname);
        try {
          const v = await api.post("auth/verify", { token });
          setUser(toUser(v.user));
          setView("home");
          setToastMsg("Email confirmed. Welcome, " + v.user.username);
        } catch (e) {
          setMode("login");
          setView("auth");
          setErr(e.message);
        }
      }
      setBoot({ ready: true, error: "" });
    } catch (e) {
      setBoot({ ready: false, error: e.message });
    }
  }, []);

  useEffect(() => {
    // Loads data from the server once on open; the state updates happen after the awaits.
    // oxlint-disable-next-line react/set-state-in-effect
    startup();
  }, [startup]);

  const retryStartup = () => {
    setBoot({ ready: false, error: "" });
    startup();
  };

  /* ---- auth ---- */
  const login = async (username, password) => {
    setBusy(true);
    setErr("");
    try {
      const r = await api.post("auth/login", { username, password });
      setUser(toUser(r.user));
      toast("Welcome, " + r.user.username);
      go("home");
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const register = async (username, email, password) => {
    setBusy(true);
    setErr("");
    try {
      const r = await api.post("auth/register", { username, email, password });
      setReg({ email, token: r.demoToken || null });
      setMode("verify");
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const confirmEmail = async () => {
    if (!reg?.token) return;
    setBusy(true);
    try {
      const r = await api.post("auth/verify", { token: reg.token });
      setUser(toUser(r.user));
      setReg(null);
      toast("Account created");
      go("home");
    } catch (e) {
      setMode("register");
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    if (!window.confirm("Are you sure you want to log out?")) return;
    try {
      await api.post("auth/logout");
    } catch {
      // Even if the server can't be reached, forget the user on this screen.
    }
    setUser(null);
    setPkgId(null);
    setDraft(null);
    go("end");
    toast("Logged out");
  };

  /* ---- booking flow ---- */
  const pick = (id) => {
    setPkgId(id);
    setDraft({ n: 1, name: user.u, phone: "", ok: false });
    go("book");
  };

  const checkSlots = ({ n, name, phone }) => {
    const p = pk(pkgId);
    const next = { n: Math.max(1, Math.floor(+n) || 1), name: name.trim(), phone: phone.trim(), ok: false };
    if (!next.name) {
      setDraft(next);
      return go("book", "Enter the lead traveler name.");
    }
    if (next.n > p.slots) {
      setDraft(next);
      return go(
        "book",
        `Only ${p.slots} slot${p.slots === 1 ? "" : "s"} left. Lower the number of travelers or choose another package.`,
      );
    }
    setDraft({ ...next, ok: true });
    go("book");
  };

  // Payment is simulated: only the last 4 digits of a card are ever sent to the server.
  const pay = async (method, card) => {
    const digits = card.replace(/\D/g, "");
    if (method === "Card" && digits.length < 12) return go("pay", "Enter a valid card number.");
    setBusy(true);
    setErr("");
    try {
      const b = await api.post("bookings", {
        packageId: pkgId,
        travelers: draft.n,
        leadName: draft.name,
        phone: draft.phone,
        paymentMethod: method,
        ...(method === "Card" ? { cardLast4: digits.slice(-4) } : {}),
      });
      setLast(b);
      refreshCatalog();
      go("done");
    } catch (e) {
      if (e.status === 409) {
        // Slots ran out while paying: send them back to change the booking.
        refreshCatalog();
        setDraft({ ...draft, ok: false });
        go("book", e.message);
      } else if (e.status === 401) {
        setUser(null);
        setMode("login");
        go("auth", "Your session expired. Please log in again.");
      } else {
        setErr(e.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const cancelPay = () => {
    go("browse");
    toast("Payment cancelled. No booking was saved.");
  };

  /* ---- guards: wrong role or logged out -> login screen ---- */
  let current = view;
  const need = ROLE_ONLY[view];
  if (need && (!user || user.role !== need)) {
    current = user ? "home" : "auth";
  } else if (LOGIN_ONLY.has(view) && !user) {
    current = "auth";
  }
  const View = VIEWS[current];

  const ctx = {
    db: catalog,
    user, dest, pk, busy, run,
    view: current, mode, setMode, err, setErr,
    filters, setFilters, pkgId, draft, setDraft, tab, setTab, reg, last,
    go, start, logout, toast, refreshCatalog,
    login, register, confirmEmail,
    pick, checkSlots, pay, cancelPay,
  };

  if (!boot.ready) {
    return (
      <main id="app">
        {boot.error ? (
          <div className="box">
            <h2>Can't load Wanderlux</h2>
            <p className="err" role="alert">{boot.error}</p>
            <button className="btn" onClick={retryStartup}>Try again</button>
          </div>
        ) : (
          <p role="status">Loading…</p>
        )}
      </main>
    );
  }

  return (
    <AppContext.Provider value={ctx}>
      <Nav />
      <main id="app">
        <View />
      </main>
      <div id="toast" role="status" hidden={!toastMsg}>
        {toastMsg}
      </div>
    </AppContext.Provider>
  );
}
