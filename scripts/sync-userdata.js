// Sync this machine's dev config (server/.env + server/users.json) into the
// Electron app's userData directory so the packaged chiqo.ai.exe reuses
// the keys you already have. Safe to re-run.
//
// Usage:
//   node scripts/sync-userdata.js
//
// Why this exists: packaged Electron builds intentionally read their .env
// and users.json from app.getPath('userData') — NOT from server/.env — so
// the installer is shippable to other people. On your own machine that
// means you'd otherwise re-enter the same keys twice. This script
// shortcuts that.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const SERVER_DIR = path.join(ROOT, "server");

// Mirror Electron's `app.getPath('userData')` resolution. Electron picks
// the directory from package.json's `name` field by default, which is
// `chiqo-ai` for this app.
const APP_NAME = "chiqo-ai";
function userDataDir() {
  const home = os.homedir();
  switch (process.platform) {
    case "win32":
      return path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), APP_NAME);
    case "darwin":
      return path.join(home, "Library", "Application Support", APP_NAME);
    default:
      return path.join(process.env.XDG_CONFIG_HOME || path.join(home, ".config"), APP_NAME);
  }
}

const dst = userDataDir();
fs.mkdirSync(dst, { recursive: true });
fs.mkdirSync(path.join(dst, "logs"), { recursive: true });

const files = [".env", "users.json", ".session-secret"];

let copied = 0;
let skipped = 0;
for (const f of files) {
  const src = path.join(SERVER_DIR, f);
  if (!fs.existsSync(src)) {
    console.log(`  skipped (no source): ${f}`);
    skipped++;
    continue;
  }
  fs.copyFileSync(src, path.join(dst, f));
  console.log(`  copied: ${f}`);
  copied++;
}

console.log("");
console.log(`Synced ${copied} file${copied === 1 ? "" : "s"} into ${dst}`);
if (skipped > 0) {
  console.log(
    `(${skipped} source file${skipped === 1 ? "" : "s"} missing — that's fine if you haven't set those yet)`
  );
}
