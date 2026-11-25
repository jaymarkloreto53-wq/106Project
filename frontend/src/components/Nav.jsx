import { useApp } from "../AppContext.js";

export default function Nav() {
  const { user, view, mode, go, start, logout } = useApp();

  // Hide the link for the screen that is already open (login / sign up).
  const onAuth = view === "auth";
  const showLogin = !(onAuth && mode === "login");
  const showSignup = !(onAuth && (mode === "register" || mode === "verify"));

  // `views` = the screens that belong to this link, so it stays highlighted inside the booking flow.
  const link = (label, action, views = []) => (
    <a
      href="#"
      aria-current={views.includes(view) ? "page" : undefined}
      onClick={(e) => {
        e.preventDefault();
        action();
      }}
    >
      {label}
    </a>
  );

  return (
    <nav id="nav" aria-label="Main">
      <a
        className="brand"
        href="#"
        aria-label="Wanderlux home"
        onClick={(e) => {
          e.preventDefault();
          go("home");
        }}
      >
        Wanderlux
      </a>
      <div>
        {user ? (
          <>
            {link("Home", () => go("home"), ["home"])}
            {user.role === "admin" ? (
              <>
                {link("Dashboard", () => go("admin"), ["admin"])}
                {link("Map", () => go("map"), ["map"])}
              </>
            ) : (
              <>
                {link("Packages", () => go("browse"), ["browse", "book", "pay"])}
                {link("Map", () => go("map"), ["map"])}
                {link("My bookings", () => go("mine"), ["mine", "done"])}
              </>
            )}
            {link(`Log out (${user.u})`, logout)}
          </>
        ) : (
          <>
            {showLogin && link("Log in", () => start("login"))}
            {showSignup && link("Sign up", () => start("register"))}
          </>
        )}
      </div>
    </nav>
  );
}
