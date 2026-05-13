// Run the vault test suite under Electron's bundled Node.
//
// Why not plain `node`: the better-sqlite3 native binding is compiled
// for a specific Node ABI. After `postinstall` fetches the
// Electron-ABI prebuild, plain Node can no longer dlopen it (Node 22's
// NMV doesn't match Electron's NMV). Running tests under Electron's
// bundled Node uses the exact ABI that ships, so the tests exercise
// the same binary that production runs.
//
// `ELECTRON_RUN_AS_NODE=1` makes the Electron binary behave as plain
// Node — no BrowserWindow, no main-process API, just a Node runtime
// that happens to live inside the Electron .exe.

const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

const ROOT = path.resolve(__dirname, "..");
const ELECTRON_BIN = path.join(
  ROOT,
  "node_modules",
  "electron",
  "dist",
  process.platform === "win32" ? "electron.exe" : "electron"
);

if (!fs.existsSync(ELECTRON_BIN)) {
  console.error(
    `[test-vault] electron binary not found at ${ELECTRON_BIN} — did npm install run?`
  );
  process.exit(2);
}

const TEST_FILES = [
  "electron/vault/crypto.test.cjs",
  "electron/vault/db.test.cjs",
  "electron/vault/session.test.cjs",
  "electron/vault/keys.test.cjs",
  "electron/runs/runs.test.cjs",
];

let totalFailures = 0;

async function runOne(file) {
  return new Promise((resolve) => {
    const child = spawn(ELECTRON_BIN, [file], {
      cwd: ROOT,
      stdio: "inherit",
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    });
    child.on("exit", (code) => {
      if (code !== 0) totalFailures++;
      resolve();
    });
  });
}

(async () => {
  for (const f of TEST_FILES) {
    await runOne(f);
  }
  process.exit(totalFailures === 0 ? 0 : 1);
})();
