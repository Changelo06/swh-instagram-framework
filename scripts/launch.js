// chiqo.ai single-click launcher.
//
// Run via:
//   chiqo-ai.cmd        (Windows double-click)
//   chiqo-ai.command    (macOS double-click)
//   npm start           (any platform, terminal)
//   node scripts/launch.js [--dry-run]
//
// Flow:
//   1. emerald banner
//   2. Node version check (>=18)
//   3. dependency install in server/ and client/ if missing (logged to .chiqo/install.log)
//   4. client build if dist/ missing                      (logged to .chiqo/build.log)
//   5. .env validation
//   6. spawn server in NODE_ENV=production
//   7. poll /api/health until ready
//   8. open default browser
//   9. clean status block + Ctrl+C shutdown handler

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { printBanner, ok, fail, dim, accent } from "./lib/banner.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const PORT = Number(process.env.PORT || 3001);
const URL = `http://localhost:${PORT}`;
const HEALTH_PATH = "/api/health";
const HEALTH_TIMEOUT_MS = 30_000;

const DRY_RUN = process.argv.includes("--dry-run");
const NPM_CMD = process.platform === "win32" ? "npm.cmd" : "npm";

const CHIQO_DIR = path.join(ROOT, ".chiqo");
const INSTALL_LOG = path.join(CHIQO_DIR, "install.log");
const BUILD_LOG = path.join(CHIQO_DIR, "build.log");
const SERVER_LOG = path.join(CHIQO_DIR, "server.log");

function ensureChiqoDir() {
  if (!fs.existsSync(CHIQO_DIR)) fs.mkdirSync(CHIQO_DIR, { recursive: true });
}

function ind(line) {
  process.stdout.write(`  ${line}\n`);
}

// Pretty-die: print a friendly multi-line error block then exit non-zero.
function die(title, ...details) {
  process.stdout.write("\n");
  ind(fail(title));
  for (const d of details) {
    if (d) ind(`  ${dim(d)}`);
  }
  process.stdout.write("\n");
  process.exit(1);
}

// 1. Node version check ------------------------------------------------------

function checkNode() {
  const major = Number(process.versions.node.split(".")[0]);
  if (Number.isNaN(major) || major < 18) {
    die(
      `Node.js 18 or newer is required (you have v${process.versions.node}).`,
      "Install the LTS build from https://nodejs.org and double-click the launcher again."
    );
  }
  ind(ok(`Node.js detected (v${process.versions.node})`));
}

// 3 & 4. Run a child process, stream its output to a log file, and surface a
// short status line to the operator. Returns a Promise that rejects on
// non-zero exit. We use this for npm install and the client build so the
// terminal stays calm.
function runQuiet(cmd, args, opts, logPath, label) {
  return new Promise((resolve, reject) => {
    ensureChiqoDir();
    // Truncate the log on each run so growth is bounded.
    const out = fs.createWriteStream(logPath, { flags: "w" });
    out.write(
      `\n=== ${label} @ ${new Date().toISOString()} ===\n` +
        `> ${cmd} ${args.join(" ")}\n` +
        `cwd: ${opts.cwd}\n\n`
    );
    const child = spawn(cmd, args, {
      ...opts,
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    });
    child.stdout.pipe(out, { end: false });
    child.stderr.pipe(out, { end: false });
    child.on("error", (err) => {
      out.end();
      reject(err);
    });
    child.on("exit", (code) => {
      out.end();
      if (code === 0) resolve();
      else reject(new Error(`${label} exited with code ${code}`));
    });
  });
}

// 3. Dependencies ------------------------------------------------------------

async function ensureDependencies() {
  const targets = [
    { dir: path.join(ROOT, "server"), name: "server" },
    { dir: path.join(ROOT, "client"), name: "client" },
  ];
  const missing = targets.filter(
    (t) => !fs.existsSync(path.join(t.dir, "node_modules"))
  );
  if (missing.length === 0) {
    ind(ok("Dependencies ready"));
    return;
  }
  ind(dim("Installing dependencies (first run only)..."));
  for (const t of missing) {
    try {
      await runQuiet(
        NPM_CMD,
        ["install", "--no-audit", "--no-fund"],
        { cwd: t.dir },
        INSTALL_LOG,
        `npm install (${t.name})`
      );
    } catch (e) {
      die(
        `npm install failed in ${t.name}/`,
        `See ${path.relative(ROOT, INSTALL_LOG)} for the full log.`,
        e.message
      );
    }
  }
  ind(ok("Dependencies ready"));
}

// 4. Client build ------------------------------------------------------------

async function ensureClientBuild() {
  const dist = path.join(ROOT, "client", "dist", "index.html");
  if (fs.existsSync(dist)) {
    ind(ok("Client build ready"));
    return;
  }
  ind(dim("Building the UI (first run only)..."));
  try {
    await runQuiet(
      NPM_CMD,
      ["run", "build"],
      { cwd: path.join(ROOT, "client") },
      BUILD_LOG,
      "client build"
    );
  } catch (e) {
    die(
      "Client build failed.",
      `See ${path.relative(ROOT, BUILD_LOG)} for the full log.`,
      e.message
    );
  }
  ind(ok("Client build ready"));
}

// 5. .env validation ---------------------------------------------------------

function ensureEnv() {
  const envPath = path.join(ROOT, "server", ".env");
  const examplePath = path.join(ROOT, "server", ".env.example");
  if (!fs.existsSync(envPath)) {
    if (fs.existsSync(examplePath)) {
      fs.copyFileSync(examplePath, envPath);
      die(
        "server/.env was missing. A template has been created from .env.example.",
        "Open server/.env, paste your real keys, then run the launcher again.",
        "Required: ANTHROPIC_API_KEY"
      );
    }
    die("Missing config: server/.env and no .env.example to copy from.");
  }
  const raw = fs.readFileSync(envPath, "utf8");
  const hasAnthropic = /^\s*ANTHROPIC_API_KEY\s*=\s*\S+/m.test(raw);
  if (!hasAnthropic) {
    die(
      "ANTHROPIC_API_KEY is empty in server/.env.",
      "Open server/.env, paste your key, then run the launcher again."
    );
  }
  ind(ok("Config loaded"));
}

// 6 & 7. Server spawn + health poll -----------------------------------------

function spawnServer() {
  ensureChiqoDir();
  const out = fs.createWriteStream(SERVER_LOG, { flags: "w" });
  out.write(
    `\n=== chiqo.ai server @ ${new Date().toISOString()} ===\n` +
      `port: ${PORT}\n\n`
  );
  const child = spawn(process.execPath, ["index.js"], {
    cwd: path.join(ROOT, "server"),
    env: {
      ...process.env,
      NODE_ENV: "production",
      SERVE_CLIENT: "1",
      PORT: String(PORT),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.pipe(out, { end: false });
  child.stderr.pipe(out, { end: false });
  return child;
}

function pingHealth() {
  return new Promise((resolve) => {
    const req = http.get(
      { host: "127.0.0.1", port: PORT, path: HEALTH_PATH, timeout: 1000 },
      (res) => {
        // Drain body so the socket can be reused / closed cleanly.
        res.resume();
        resolve(res.statusCode === 200);
      }
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForReady(child) {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode != null) {
      die(
        `Server exited before becoming ready (code ${child.exitCode}).`,
        `See ${path.relative(ROOT, SERVER_LOG)} for the full log.`
      );
    }
    if (await pingHealth()) return;
    await delay(250);
  }
  die(
    `Server did not respond at ${URL}${HEALTH_PATH} within ${HEALTH_TIMEOUT_MS / 1000}s.`,
    `See ${path.relative(ROOT, SERVER_LOG)} for the full log.`
  );
}

// 8. Browser open ------------------------------------------------------------

function openBrowser(url) {
  const platform = process.platform;
  let cmd;
  let args;
  if (platform === "win32") {
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
  } catch {
    // non-fatal — the URL is printed in the status block, the user can copy it
  }
}

// 9 + 10. Status block + Ctrl+C handler -------------------------------------

function statusBlock() {
  process.stdout.write("\n");
  ind("Starting your local creator intelligence workspace...");
  process.stdout.write("\n");
  ind(`${dim("Local URL")}   ${URL}`);
  ind(`${dim("Status")}      ${accent("running")}`);
  ind(`${dim("Logs")}        ${path.relative(ROOT, SERVER_LOG)}`);
  process.stdout.write("\n");
  ind(dim("Close this window or press Ctrl+C to stop chiqo.ai."));
  process.stdout.write("\n");
}

function attachShutdown(child) {
  let stopping = false;
  const stop = (signal) => {
    if (stopping) return;
    stopping = true;
    try {
      child.kill(signal || "SIGINT");
    } catch {}
  };
  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));
  child.on("exit", (code) => {
    process.stdout.write("\n");
    if (code === 0 || code === null) ind(accent("chiqo.ai stopped."));
    else ind(fail(`chiqo.ai stopped (exit ${code}).`));
    process.stdout.write("\n");
    process.exit(code ?? 0);
  });
}

// Entry point ---------------------------------------------------------------

async function main() {
  printBanner();
  checkNode();
  await ensureDependencies();
  await ensureClientBuild();
  ensureEnv();

  if (DRY_RUN) {
    process.stdout.write("\n");
    ind(dim("--dry-run set; skipping server spawn + browser open."));
    process.stdout.write("\n");
    return;
  }

  const server = spawnServer();
  attachShutdown(server);
  await waitForReady(server);
  openBrowser(URL);
  statusBlock();
}

main().catch((err) => {
  die("Launcher crashed unexpectedly.", err?.stack || err?.message || String(err));
});
