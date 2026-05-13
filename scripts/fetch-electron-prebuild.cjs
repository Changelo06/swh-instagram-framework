// Postinstall helper: fetch the Electron-ABI prebuild of better-sqlite3.
//
// Why this exists: better-sqlite3 ships prebuilds for plain Node ABIs
// (which npm installs by default), AND for Electron-specific ABIs (which
// have to be fetched explicitly via prebuild-install with --runtime).
// Without this step, `npm install` leaves us with a binding that loads
// under `node` but throws ABI-mismatch errors under `electron`.
//
// This script is wired as `postinstall` in root package.json. It:
//   1. Detects whether `electron` is installed (skips silently if not —
//      that means we're being installed in a non-Electron context, e.g.,
//      CI for just the server/client subprojects)
//   2. Reads Electron's version from node_modules/electron/package.json
//   3. Invokes node_modules/better-sqlite3's prebuild-install with
//      --runtime=electron --target=<version>
//
// Safe to re-run. No effect if prebuild-install can't find a matching
// Electron prebuild — falls back to the existing Node prebuild, which
// works for `npm run test:vault`.

const path = require("node:path");
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const ELECTRON_PKG = path.join(ROOT, "node_modules", "electron", "package.json");
const BSQ_DIR = path.join(ROOT, "node_modules", "better-sqlite3");

function log(msg) {
  process.stdout.write(`  [fetch-electron-prebuild] ${msg}\n`);
}

if (!fs.existsSync(ELECTRON_PKG)) {
  // No Electron installed — nothing to do. Don't break a plain Node-only
  // install context.
  log("skipped (electron not installed)");
  process.exit(0);
}

if (!fs.existsSync(BSQ_DIR)) {
  log("skipped (better-sqlite3 not installed)");
  process.exit(0);
}

let electronVersion;
try {
  electronVersion = JSON.parse(fs.readFileSync(ELECTRON_PKG, "utf8")).version;
} catch (e) {
  log(`could not read electron version: ${e.message}`);
  process.exit(0);
}

const prebuildBin = path.join(
  ROOT,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "prebuild-install.cmd" : "prebuild-install"
);

if (!fs.existsSync(prebuildBin)) {
  log("skipped (prebuild-install not on PATH inside node_modules/.bin)");
  process.exit(0);
}

log(`fetching better-sqlite3 prebuild for electron@${electronVersion}...`);
const r = spawnSync(
  prebuildBin,
  ["--runtime=electron", `--target=${electronVersion}`],
  {
    cwd: BSQ_DIR,
    stdio: "inherit",
    shell: process.platform === "win32",
  }
);

if (r.status !== 0) {
  log(
    `prebuild-install exited ${r.status} — the Node-ABI prebuild is still in place; ` +
      `the binding will work under plain Node but may need a manual rebuild for Electron`
  );
  // Don't fail the install on this. The Node-ABI build works for plain
  // Node tests, and an Electron-load error would only show up later at
  // runtime, where it can be diagnosed.
  process.exit(0);
}

log("done");
