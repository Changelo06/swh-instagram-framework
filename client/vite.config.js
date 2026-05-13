import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `base: './'` produces a build where every asset import is relative
// (assets/foo.js instead of /assets/foo.js). The Electron build serves
// the bundle via a custom protocol (chiqo://app/...) so the absolute
// root paths Vite emits by default would resolve to chiqo://app/assets/
// regardless of which route we're on — which still works, but relative
// is the more portable shape if we ever ship a static demo build too.
//
// The `/api` dev-server proxy is retained as a no-op safety net for any
// stray dev runs against the (now deleted) Express server. The proxy
// target simply has nothing listening — Phase 2.7 deleted the server.
export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    port: 5173,
  },
});
