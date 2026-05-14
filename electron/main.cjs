// chiqo.ai — Electron main process.
//
// As of Phase 2.7 there is no Express server. The renderer is loaded
// directly from the built client bundle via a custom `chiqo://` protocol,
// and every privileged operation (vault, keys, Anthropic, Groq, Apify,
// parse) goes through typed IPC handlers registered in
// electron/ipc/index.cjs.
//
// State files live in userData so the install dir can stay read-only
// (macOS .app inside /Applications, Program Files on Windows) and
// upgrades don't blow away the user's vault:
//
//   const userData = app.getPath('userData');
//
//   Windows:  %APPDATA%\chiqo.ai\
//   macOS:    ~/Library/Application Support/chiqo.ai/
//   Linux:    ~/.config/chiqo.ai/

const {
  app,
  BrowserWindow,
  dialog,
  shell,
  Menu,
  session,
  protocol,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const url = require("node:url");

const ipcRegistry = require("./ipc/index.cjs");

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

// Client dist directory — built by `npm run build` in client/.
const CLIENT_DIST = resolveBundled(path.join("client", "dist"));

// State paths (per-user, writable). Created on first launch.
let USER_DATA_DIR;
let USER_LOG_DIR;

function initUserPaths() {
  USER_DATA_DIR = app.getPath("userData");
  USER_LOG_DIR = path.join(USER_DATA_DIR, "logs");
  fs.mkdirSync(USER_LOG_DIR, { recursive: true });
}

// --- Content-Security-Policy -----------------------------------------------
//
// Strict CSP installed on the default session BEFORE any window loads.
// All renderer responses get these headers.
//
// As of Phase 2.7 there is no localhost server to whitelist — every
// privileged call goes through IPC. The only outbound destinations
// allowed are img-src (CDN thumbnails) and font-src (Inter via Bunny).
function installCsp() {
  const csp = [
    "default-src 'self' chiqo:",
    "script-src 'self' chiqo:",
    // Recharts + some Phosphor icons inject inline styles; CSP can't see
    // them through React. Accept 'unsafe-inline' for styles only — scripts
    // stay locked down.
    "style-src 'self' chiqo: 'unsafe-inline'",
    // No remote network from the renderer. All provider calls happen in
    // main via IPC.
    "connect-src 'self' chiqo:",
    "img-src 'self' chiqo: data: https:",
    "font-src 'self' chiqo: data:",
    "worker-src 'self' chiqo: blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join("; ");

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders };
    for (const k of Object.keys(headers)) {
      if (/^content-security-policy/i.test(k)) delete headers[k];
    }
    headers["Content-Security-Policy"] = [csp];
    callback({ responseHeaders: headers });
  });
}

// --- Custom protocol: chiqo:// ---------------------------------------------
//
// We serve the React bundle through a custom protocol instead of
// `file://`. Reasons:
//   - Modern web platform APIs (fetch, Service Worker, dynamic import)
//     have well-known sharp edges on `file://` URLs — they reject CORS,
//     blow up on relative imports, get a `null` origin that breaks
//     storage. `chiqo://` is treated as a proper standard origin.
//   - One stable origin string for CSP (`chiqo://app/...`) rather than
//     paths that change per install.
//   - Lets us add asset-rewrite hooks later (e.g., bundle hot-reload)
//     without touching the renderer.

const PROTOCOL_SCHEME = "chiqo";
const APP_HOST = "app";

// Register before app is ready so the custom scheme participates as a
// proper standard origin (enables fetch / Service Worker semantics).
protocol.registerSchemesAsPrivileged([
  {
    scheme: PROTOCOL_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

function registerChiqoProtocol() {
  protocol.handle(PROTOCOL_SCHEME, async (req) => {
    const parsed = new URL(req.url);
    // chiqo://app/<path> — host fixed so we can extend later (chiqo://docs)
    if (parsed.host !== APP_HOST) {
      return new Response("Not Found", { status: 404 });
    }
    let pathname = decodeURIComponent(parsed.pathname);
    if (pathname === "/" || pathname === "") pathname = "/index.html";
    // Defensive: resolve relative to CLIENT_DIST and refuse anything that
    // escapes the directory (path traversal via ../).
    const target = path.normalize(path.join(CLIENT_DIST, pathname));
    if (!target.startsWith(CLIENT_DIST)) {
      return new Response("Forbidden", { status: 403 });
    }
    try {
      const buf = await fs.promises.readFile(target);
      const ext = path.extname(target).toLowerCase();
      const mime =
        {
          ".html": "text/html; charset=utf-8",
          ".js": "application/javascript; charset=utf-8",
          ".mjs": "application/javascript; charset=utf-8",
          ".css": "text/css; charset=utf-8",
          ".json": "application/json; charset=utf-8",
          ".svg": "image/svg+xml",
          ".png": "image/png",
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".webp": "image/webp",
          ".woff": "font/woff",
          ".woff2": "font/woff2",
          ".ttf": "font/ttf",
          ".ico": "image/x-icon",
          ".map": "application/json",
        }[ext] || "application/octet-stream";
      return new Response(buf, { headers: { "Content-Type": mime } });
    } catch (e) {
      // SPA fallback — unknown route serves index.html so the React
      // router can take over.
      if (!pathname.endsWith(".html") && !path.extname(pathname)) {
        try {
          const buf = await fs.promises.readFile(
            path.join(CLIENT_DIST, "index.html")
          );
          return new Response(buf, {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        } catch {}
      }
      return new Response("Not Found", { status: 404 });
    }
  });
}

// --- Windowing -------------------------------------------------------------

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 640,
    title: "chiqo.ai",
    backgroundColor: "#14151a",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  // External links open in the user's default browser, not inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url: extUrl }) => {
    shell.openExternal(extUrl);
    return { action: "deny" };
  });

  mainWindow.loadURL(`${PROTOCOL_SCHEME}://${APP_HOST}/index.html`);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// --- Lifecycle -------------------------------------------------------------

app.isQuitting = false;

// Crash diagnostics (Phase 5).
//
// An uncaught exception inside the main process today silently terminates
// the whole app and orphans the renderer. We can't recover the crashed
// state, but we CAN: (a) write a diagnostic file the user can attach to
// a bug report, and (b) forward a single toast to the renderer before
// exit so the user knows what happened.
function reportCrash(kind, err) {
  const stamp = new Date().toISOString();
  const detail = err?.stack || err?.message || String(err);
  // eslint-disable-next-line no-console
  console.error(`[main ${kind}] ${stamp}\n${detail}`);
  try {
    if (USER_LOG_DIR && fs.existsSync(USER_LOG_DIR)) {
      const file = path.join(USER_LOG_DIR, "crash.log");
      fs.appendFileSync(
        file,
        `=== ${kind} @ ${stamp} ===\n${detail}\n\n`
      );
    }
  } catch {
    /* best-effort */
  }
  try {
    for (const w of BrowserWindow.getAllWindows()) {
      if (w.webContents && !w.webContents.isDestroyed()) {
        w.webContents.send("chiqo.app.crash", {
          kind,
          message: err?.message || String(err),
          when: stamp,
        });
      }
    }
  } catch {
    /* renderer may be gone */
  }
}
process.on("uncaughtException", (err) => reportCrash("uncaughtException", err));
process.on("unhandledRejection", (err) => reportCrash("unhandledRejection", err));

app.whenReady().then(async () => {
  if (Menu && typeof Menu.setApplicationMenu === "function") {
    Menu.setApplicationMenu(null);
  }
  initUserPaths();

  // CSP first — installed before the window loads so the first response
  // is already locked down.
  installCsp();
  registerChiqoProtocol();

  // Wire the IPC handler registry. Channels listed in
  // electron/ipc/channels.cjs but not yet implemented return a typed
  // `NOT_IMPLEMENTED` rejection — the renderer never hangs on a missing
  // handler.
  ipcRegistry.register({
    userDataDir: USER_DATA_DIR,
    appRoot: APP_ROOT,
  });

  if (!fs.existsSync(path.join(CLIENT_DIST, "index.html"))) {
    dialog.showErrorBox(
      "chiqo.ai client bundle missing",
      `Could not find client/dist/index.html at:\n${CLIENT_DIST}\n\n` +
        `Run 'npm run build' in client/ before launching.`
    );
    app.quit();
    return;
  }

  createWindow();
});

app.on("before-quit", () => {
  app.isQuitting = true;
});

app.on("window-all-closed", () => {
  // Single-window app — quit when the last window closes.
  app.quit();
});

app.on("activate", () => {
  // macOS: clicking the dock icon with no windows open re-launches.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
