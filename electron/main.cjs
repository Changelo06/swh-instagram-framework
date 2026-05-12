// chiqo.ai — Electron main process.
//
// Architecture: spawn the existing Express server as a child process and
// load it inside a BrowserWindow once /api/health returns 200. State files
// (.env, users.json, .session-secret, .chiqo logs) live in userData so the
// install dir can stay read-only (macOS .app inside /Applications) and
// upgrades don't blow away the user's config.
//
//   const userData = app.getPath('userData');
//
//   On Windows (per-user install):
//     %APPDATA%\chiqo.ai\
//   On macOS:
//     ~/Library/Application Support/chiqo.ai/
//   On Linux:
//     ~/.config/chiqo.ai/

const { app, BrowserWindow, dialog, shell, Menu } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const { spawn } = require("node:child_process");

// --- Paths -----------------------------------------------------------------

// app.isPackaged === true when running from a built installer; false in
// `electron:dev`. Resource roots differ in the two modes:
//   - dev  : __dirname is .../electron/, app sources are siblings
//   - prod : files marked extraResources land in process.resourcesPath
const APP_ROOT = path.resolve(__dirname, "..");

function resolveBundled(rel) {
  if (app.isPackaged) {
    // electron-builder unpacks `extraResources` to process.resourcesPath
    return path.join(process.resourcesPath, rel);
  }
  return path.join(APP_ROOT, rel);
}

// State paths (per-user, writable). Created on first launch.
let USER_DATA_DIR;
let USER_ENV_PATH;
let USER_USERS_JSON;
let USER_SESSION_SECRET;
let USER_LOG_DIR;

function initUserPaths() {
  USER_DATA_DIR = app.getPath("userData");
  USER_ENV_PATH = path.join(USER_DATA_DIR, ".env");
  USER_USERS_JSON = path.join(USER_DATA_DIR, "users.json");
  USER_SESSION_SECRET = path.join(USER_DATA_DIR, ".session-secret");
  USER_LOG_DIR = path.join(USER_DATA_DIR, "logs");
  fs.mkdirSync(USER_LOG_DIR, { recursive: true });
}

// Open a file in a sensible plain-text editor. `shell.openPath()` is
// unreliable for files without a registered handler (a fresh Windows box
// has no app associated with the .env extension and pops "Windows cannot
// access the specified device, path, or file"). This routes to the
// platform's known-good text editor instead, with a folder-reveal fallback.
function openInEditor(filePath) {
  try {
    if (process.platform === "win32") {
      // notepad.exe is on every Windows install.
      spawn("notepad.exe", [filePath], { detached: true, stdio: "ignore" }).unref();
      return true;
    }
    if (process.platform === "darwin") {
      // `open -e` forces TextEdit, which is on every macOS install.
      spawn("open", ["-e", filePath], { detached: true, stdio: "ignore" }).unref();
      return true;
    }
    // Linux: xdg-open uses the user's default text editor.
    spawn("xdg-open", [filePath], { detached: true, stdio: "ignore" }).unref();
    return true;
  } catch (e) {
    return false;
  }
}

function revealInFolder(filePath) {
  try {
    shell.showItemInFolder(filePath);
  } catch {}
}

// If the build bundled a users.json.default (used when shipping pre-
// provisioned to a specific client), copy it to userData on first
// launch so the client doesn't have to set up their own login.
//
// The defaults file is shipped at resources/server/users.json.default —
// scripts/pack-for-client.js drops it there before each `electron:build`.
function seedUsersIfMissing() {
  if (fs.existsSync(USER_USERS_JSON)) return;
  const tmpl = resolveBundled(path.join("server", "users.json.default"));
  if (!fs.existsSync(tmpl)) return;
  fs.copyFileSync(tmpl, USER_USERS_JSON);
}

// Bundled .env.example template — copy on first run if no user .env exists.
function seedEnvIfMissing() {
  if (fs.existsSync(USER_ENV_PATH)) return false;
  const tmpl = resolveBundled(path.join("server", ".env.example"));
  if (fs.existsSync(tmpl)) {
    fs.copyFileSync(tmpl, USER_ENV_PATH);
  } else {
    // Fallback: write a minimal template ourselves so we never leave the
    // user without a starter file.
    fs.writeFileSync(
      USER_ENV_PATH,
      [
        "# chiqo.ai — paste your real keys, then restart the app.",
        "ANTHROPIC_API_KEY=",
        "GROQ_API_KEY=",
        "APIFY_TOKEN=",
        "CLAUDE_MODEL=claude-sonnet-4-6",
        "PORT=",
        "",
      ].join("\n")
    );
  }
  return true;
}

// --- Server spawn ----------------------------------------------------------

let serverChild = null;
let serverPort = null;

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function readEnvFile(envPath) {
  // Tiny dotenv reader so the main process can pass the user's PORT (if
  // they set one) and surface missing-key dialogs before spawning anything.
  const out = {};
  if (!fs.existsSync(envPath)) return out;
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const k = trimmed.slice(0, eq).trim();
    let v = trimmed.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (k) out[k] = v;
  }
  return out;
}

async function spawnServer() {
  const env = readEnvFile(USER_ENV_PATH);
  const userPort = Number(env.PORT);
  serverPort = Number.isFinite(userPort) && userPort > 0
    ? userPort
    : await findFreePort();

  const serverIndex = resolveBundled(path.join("server", "index.js"));
  if (!fs.existsSync(serverIndex)) {
    throw new Error(`Server entry not found at ${serverIndex}`);
  }

  // Pipe child stdio to a rolling log so the operator can debug without
  // running from a terminal. Truncate-on-launch so growth is bounded.
  const logPath = path.join(USER_LOG_DIR, "server.log");
  const out = fs.createWriteStream(logPath, { flags: "w" });
  out.write(
    `=== chiqo.ai server @ ${new Date().toISOString()} ===\n` +
      `port: ${serverPort}\n` +
      `userData: ${USER_DATA_DIR}\n\n`
  );

  // CHIQO_DATA_DIR is read by server/auth.js (added in this same patch) so
  // users.json + .session-secret live in userData rather than next to the
  // bundled server/ folder. Also hand the server its own .env path so
  // dotenv loads the user's file regardless of cwd.
  const childEnv = {
    ...process.env,
    ...env,
    NODE_ENV: "production",
    SERVE_CLIENT: "1",
    PORT: String(serverPort),
    CHIQO_DATA_DIR: USER_DATA_DIR,
    DOTENV_CONFIG_PATH: USER_ENV_PATH,
    // Electron's binary contains Node. Without this flag the spawned exec
    // would try to launch a second Electron app instead of running our
    // server script as a plain Node process.
    ELECTRON_RUN_AS_NODE: "1",
  };

  serverChild = spawn(process.execPath, [serverIndex], {
    cwd: path.dirname(serverIndex),
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  serverChild.stdout.pipe(out, { end: false });
  serverChild.stderr.pipe(out, { end: false });

  serverChild.on("exit", (code) => {
    serverChild = null;
    if (!app.isQuitting) {
      // Server died unexpectedly — surface a dialog instead of failing
      // silently.
      dialog.showErrorBox(
        "chiqo.ai stopped unexpectedly",
        `Server exited with code ${code}.\n\n` +
          `Check the log at:\n${logPath}`
      );
      app.quit();
    }
  });

  return { port: serverPort, logPath };
}

function pingHealth(port) {
  return new Promise((resolve) => {
    const req = http.get(
      {
        host: "127.0.0.1",
        port,
        path: "/api/health",
        timeout: 1000,
      },
      (res) => {
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

async function waitForServer(port, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!serverChild) return false;
    if (await pingHealth(port)) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

// --- Windowing -------------------------------------------------------------

let mainWindow = null;

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 640,
    title: "chiqo.ai",
    backgroundColor: "#080a0a",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // External links (e.g., "Get token" → console.apify.com) open in the
  // user's default browser instead of inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url: extUrl }) => {
    shell.openExternal(extUrl);
    return { action: "deny" };
  });

  mainWindow.loadURL(url);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// --- Lifecycle -------------------------------------------------------------

app.isQuitting = false;

app.whenReady().then(async () => {
  // Strip the default menu bar — chiqo doesn't use it. (Must wait until
  // the Electron app is ready; calling Menu APIs at module scope crashes
  // on some Electron 42+ builds.)
  if (Menu && typeof Menu.setApplicationMenu === "function") {
    Menu.setApplicationMenu(null);
  }
  initUserPaths();
  seedUsersIfMissing();
  const seeded = seedEnvIfMissing();

  if (seeded) {
    // First launch: open the .env in the user's default editor and tell
    // them what to fill in. Server doesn't start yet because we expect
    // ANTHROPIC_API_KEY to be missing.
    const choice = dialog.showMessageBoxSync({
      type: "info",
      title: "Welcome to chiqo.ai",
      message: "Set up your API keys",
      detail:
        `chiqo.ai needs your API keys before it can run.\n\n` +
        `A starter file has been created here:\n${USER_ENV_PATH}\n\n` +
        `Open it, paste your keys (ANTHROPIC_API_KEY is required), save it, ` +
        `then re-open chiqo.ai.`,
      buttons: ["Open in editor", "Show in folder", "Quit"],
      defaultId: 0,
      cancelId: 2,
    });
    if (choice === 0) {
      if (!openInEditor(USER_ENV_PATH)) revealInFolder(USER_ENV_PATH);
    } else if (choice === 1) {
      revealInFolder(USER_ENV_PATH);
    }
    app.quit();
    return;
  }

  // Sanity-check ANTHROPIC_API_KEY before bothering to spawn the server.
  const env = readEnvFile(USER_ENV_PATH);
  if (!env.ANTHROPIC_API_KEY || !env.ANTHROPIC_API_KEY.trim()) {
    const choice = dialog.showMessageBoxSync({
      type: "warning",
      title: "ANTHROPIC_API_KEY missing",
      message: "chiqo.ai needs your Anthropic key before it can run.",
      detail:
        `Open this file and paste a key on the ANTHROPIC_API_KEY line:\n\n` +
        `${USER_ENV_PATH}`,
      buttons: ["Open in editor", "Show in folder", "Quit"],
      defaultId: 0,
      cancelId: 2,
    });
    if (choice === 0) {
      if (!openInEditor(USER_ENV_PATH)) revealInFolder(USER_ENV_PATH);
    } else if (choice === 1) {
      revealInFolder(USER_ENV_PATH);
    }
    app.quit();
    return;
  }

  let started;
  try {
    started = await spawnServer();
  } catch (e) {
    dialog.showErrorBox(
      "chiqo.ai failed to start",
      e?.stack || e?.message || String(e)
    );
    app.quit();
    return;
  }

  const ready = await waitForServer(started.port);
  if (!ready) {
    dialog.showErrorBox(
      "chiqo.ai server didn't become ready",
      `Health check at http://127.0.0.1:${started.port}/api/health timed out.\n\n` +
        `Check the log at:\n${started.logPath}`
    );
    app.quit();
    return;
  }

  createWindow(`http://127.0.0.1:${started.port}/`);
});

app.on("before-quit", () => {
  app.isQuitting = true;
  if (serverChild) {
    try {
      serverChild.kill();
    } catch {}
  }
});

app.on("window-all-closed", () => {
  // Standard mac convention is to keep the dock icon active; chiqo is a
  // single-window app so we just quit.
  app.quit();
});

app.on("activate", () => {
  // macOS: clicking dock icon with no windows open should re-launch.
  if (BrowserWindow.getAllWindows().length === 0 && serverPort) {
    createWindow(`http://127.0.0.1:${serverPort}/`);
  }
});
