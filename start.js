// One-click launcher entry point.
//
// Boots the express server in production mode (so it serves the built React
// app from client/dist) and opens the user's default browser to it.
//
// Run via:
//   npm start          (does setup + build + this launcher)
//   npm run start:fast (skips setup/build — assumes deps + dist already exist)
//   node start.js      (same as :fast)

import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3001;
const URL = `http://localhost:${PORT}/`;

// --- sanity checks ---------------------------------------------------------

const distIndex = path.join(__dirname, "client", "dist", "index.html");
if (!fs.existsSync(distIndex)) {
  console.error(
    "\n[launcher] client/dist/index.html is missing — the React app hasn't been built yet."
  );
  console.error("           Run `npm run build` first, or use `npm start` to do it for you.\n");
  process.exit(1);
}

const envPath = path.join(__dirname, "server", ".env");
if (!fs.existsSync(envPath)) {
  const examplePath = path.join(__dirname, "server", ".env.example");
  if (fs.existsSync(examplePath)) {
    console.warn(
      "\n[launcher] server/.env not found — copying server/.env.example as a starter."
    );
    console.warn(
      "           Open server/.env and replace ANTHROPIC_API_KEY (required) and GROQ_API_KEY (optional) with your real keys.\n"
    );
    fs.copyFileSync(examplePath, envPath);
  } else {
    console.warn("\n[launcher] server/.env not found and no .env.example to copy from.\n");
  }
}

// --- spawn the server ------------------------------------------------------

console.log(`[launcher] Starting SWH Instagram Framework Builder on ${URL}`);

const server = spawn(
  process.execPath, // current node binary
  ["index.js"],
  {
    cwd: path.join(__dirname, "server"),
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "production", SERVE_CLIENT: "1", PORT: String(PORT) },
  }
);

server.on("exit", (code) => {
  console.log(`[launcher] Server exited with code ${code}.`);
  process.exit(code ?? 0);
});

// --- open the browser ------------------------------------------------------

(async () => {
  // Give the server a moment to bind the port.
  await delay(1500);
  openBrowser(URL);
})();

// Forward Ctrl+C to the server child.
process.on("SIGINT", () => server.kill("SIGINT"));
process.on("SIGTERM", () => server.kill("SIGTERM"));

function openBrowser(url) {
  const platform = process.platform;
  let cmd;
  let args;
  if (platform === "win32") {
    // `start` is a cmd-builtin, so we call cmd with /c.
    cmd = "cmd";
    args = ["/c", "start", "", url];
  } else if (platform === "darwin") {
    cmd = "open";
    args = [url];
  } else {
    cmd = "xdg-open";
    args = [url];
  }
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
  } catch (e) {
    console.warn(`[launcher] Could not auto-open the browser: ${e.message}`);
    console.warn(`[launcher] Open ${url} manually.`);
  }
}
