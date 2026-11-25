import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// The site is served from /wanderlux/ (WAMP: C:\wamp64\www\wanderlux). Override with VITE_BASE if you
// deploy somewhere else, e.g. VITE_BASE=/ for a site at the domain root (the PHP API must then be at /api).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const base = env.VITE_BASE || "/wanderlux/";
  const target = env.VITE_API_TARGET || "http://localhost"; // where WAMP's Apache listens

  // The PHP API only accepts same-site writes, so rewrite Origin to the target while proxying.
  const toWamp = {
    target,
    changeOrigin: true,
    configure: (proxy) => proxy.on("proxyReq", (req) => req.setHeader("origin", target)),
  };

  return {
    base,
    plugins: [react()],
    server: {
      proxy: {
        [`${base}api`]: toWamp,
        [`${base}uploads`]: toWamp,
      },
    },
  };
});
