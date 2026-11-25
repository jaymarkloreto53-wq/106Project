import { useState } from "react";
import { useApp } from "../AppContext.js";

function Verify() {
  const { reg, confirmEmail, busy, start } = useApp();
  return (
    <div className="box">
      <h2>Verify your email</h2>
      <p>
        We sent a confirmation link to <b>{reg.email}</b>. Open it to activate your account.
      </p>
      {reg.token ? (
        <>
          <button className="btn" onClick={confirmEmail} disabled={busy}>
            Open confirmation link
          </button>
          <p className="mut">
            <small>Demo mode: email sending is off, so this button stands in for the link.</small>
          </p>
        </>
      ) : (
        <button className="btn alt" onClick={() => start("login")}>
          Back to log in
        </button>
      )}
    </div>
  );
}

function Register() {
  const { err, register, start, busy } = useApp();
  const [u, setU] = useState("");
  const [e, setE] = useState("");
  const [p, setP] = useState("");

  const submit = (ev) => {
    ev.preventDefault();
    register(u.trim(), e.trim(), p);
  };

  return (
    <form className="box" onSubmit={submit} noValidate>
      <h2>Create your account</h2>
      <label htmlFor="ru">Username</label>
      <input id="ru" autoComplete="username" value={u} onChange={(ev) => setU(ev.target.value)} />
      <label htmlFor="re">Email</label>
      <input id="re" type="email" autoComplete="email" value={e} onChange={(ev) => setE(ev.target.value)} />
      <label htmlFor="rp">Password (8+ characters)</label>
      <input id="rp" type="password" autoComplete="new-password" value={p} onChange={(ev) => setP(ev.target.value)} />
      <p className="err" role="alert">{err}</p>
      <button className="btn" type="submit" disabled={busy}>
        Send confirmation link
      </button>{" "}
      <button className="btn alt" type="button" onClick={() => start("login")}>
        I have an account
      </button>
    </form>
  );
}

function Login() {
  const { err, login, start, busy } = useApp();
  const [u, setU] = useState("");
  const [p, setP] = useState("");

  const submit = (ev) => {
    ev.preventDefault();
    login(u.trim(), p);
  };

  return (
    <form className="box" onSubmit={submit}>
      <h2>Log in</h2>
      <label htmlFor="lu">Username</label>
      <input id="lu" autoComplete="username" value={u} onChange={(ev) => setU(ev.target.value)} />
      <label htmlFor="lp">Password</label>
      <input
        id="lp"
        type="password"
        autoComplete="current-password"
        value={p}
        onChange={(ev) => setP(ev.target.value)}
      />
      <p className="err" role="alert">{err}</p>
      <button className="btn" type="submit" disabled={busy}>
        Log in
      </button>{" "}
      <button className="btn alt" type="button" onClick={() => start("register")}>
        Create account
      </button>
      <p className="mut">
        <small>Demo: guest / guest123 (customer), admin / admin123 (admin)</small>
      </p>
    </form>
  );
}

export default function Auth() {
  const { mode, reg } = useApp();
  if (mode === "verify" && reg) return <Verify />;
  if (mode === "register") return <Register />;
  return <Login />;
}
