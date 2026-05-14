// chiqo.ai preload bridge.
//
// This file runs in a "preload" context that has access to a limited Node
// API (the `require()` here only resolves Electron's allowed list). It
// exposes a frozen `window.chiqo` object to the renderer via contextBridge.
// The renderer NEVER imports Node modules. NEVER accesses fs / process /
// crypto / network directly. Every privileged operation goes through this
// bridge, and every method on this bridge maps 1:1 to an `ipcMain.handle`
// in electron/ipc/.
//
// Surface design:
//   - Namespaces are stable contracts (vault, keys, anthropic, groq,
//     apify, runs, usage, app). Adding methods doesn't break the renderer;
//     renaming or removing methods does.
//   - Method names match the IPC channel (e.g., `chiqo.vault.unlock` →
//     `'chiqo.vault.unlock'`). One source of truth.
//   - Methods that aren't wired in main yet still appear here. They'll
//     reject with "not implemented yet (Phase N)" thanks to the
//     fallback registrar in electron/ipc/index.cjs.
//   - Streaming (Claude deltas, Apify scrape state) uses `subscribe(...)`
//     methods that return an unsubscribe function. Under the hood it's
//     `ipcRenderer.on(channel, ...)`.

const { contextBridge, ipcRenderer } = require("electron");

// Tiny wrapper: every invoke call gets the same shape so the renderer
// can rely on errors being real Error objects (not the awkward Electron
// `{ message }` wire format). Wraps `Error` instances coming back with
// a string-named `code` property so renderer-side switch statements
// stay readable.
function invoke(channel, ...args) {
  return ipcRenderer.invoke(channel, ...args).catch((err) => {
    const e = new Error(err?.message || String(err));
    if (err?.code) e.code = err.code;
    if (err?.channel) e.channel = err.channel;
    throw e;
  });
}

// Subscribe to a server-streamed channel. Returns an unsubscribe function.
// Used for run deltas (Claude's `messages.stream()` chunks, Apify polling
// state transitions, etc.).
function subscribe(channel, callback) {
  if (typeof callback !== "function") {
    throw new Error(`subscribe(${channel}) requires a callback function`);
  }
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const chiqo = Object.freeze({
  // --- Liveness check ----------------------------------------------------
  // Verifies the bridge is wired up. Called once on app boot.
  ping: () => invoke("chiqo.ping"),

  // --- Vault (Phase 1.2 / 1.3) ------------------------------------------
  vault: Object.freeze({
    status: () => invoke("chiqo.vault.status"),
    create: (password, opts) => invoke("chiqo.vault.create", password, opts),
    unlock: (password) => invoke("chiqo.vault.unlock", password),
    lock: () => invoke("chiqo.vault.lock"),
    setHint: (hint) => invoke("chiqo.vault.setHint", hint),
    getHint: () => invoke("chiqo.vault.getHint"),
    changePassword: (oldPw, newPw) =>
      invoke("chiqo.vault.changePassword", oldPw, newPw),
    wipe: (confirmText) => invoke("chiqo.vault.wipe", confirmText),
  }),

  // --- Provider API keys (Phase 2.5) ------------------------------------
  // Keys live encrypted in the vault. The renderer can list them (gets
  // last-4 + fingerprint only), add, and delete. There is NO method to
  // read a full key back out — keys leave the main process only to call
  // their respective providers.
  keys: Object.freeze({
    list: () => invoke("chiqo.keys.list"),
    set: (provider, value) => invoke("chiqo.keys.set", provider, value),
    delete: (provider) => invoke("chiqo.keys.delete", provider),
  }),

  // --- Anthropic (Phase 2.6) --------------------------------------------
  anthropic: Object.freeze({
    // Returns { runId } immediately. Renderer subscribes via
    // chiqo.runs.subscribe(runId, callback) for streamed deltas.
    analyze: (payload) => invoke("chiqo.anthropic.analyze", payload),
    countTokens: (payload) =>
      invoke("chiqo.anthropic.countTokens", payload),
    stop: (runId) => invoke("chiqo.anthropic.stop", runId),
  }),

  // --- Groq Whisper (Phase 2.7) -----------------------------------------
  groq: Object.freeze({
    transcribe: (payload) => invoke("chiqo.groq.transcribe", payload),
    stop: (runId) => invoke("chiqo.groq.stop", runId),
  }),

  // --- Apify (Phase 2.7) ------------------------------------------------
  apify: Object.freeze({
    scrape: (payload) => invoke("chiqo.apify.scrape", payload),
    account: () => invoke("chiqo.apify.account"),
    stop: (runId) => invoke("chiqo.apify.stop", runId),
  }),

  // --- Dataset parse (Phase 2.7) ---------------------------------------
  // Parses an uploaded CSV or JSON dataset on the main side. The renderer
  // hands us an ArrayBuffer + filename; we hand back {rows, summary, filename}.
  // No streaming — synchronous over IPC.
  parse: Object.freeze({
    file: (buffer, filename) => invoke("chiqo.parse.file", buffer, filename),
  }),

  // --- Runs (Phase 3) ---------------------------------------------------
  runs: Object.freeze({
    list: (filter) => invoke("chiqo.runs.list", filter),
    get: (id) => invoke("chiqo.runs.get", id),
    delete: (id) => invoke("chiqo.runs.delete", id),
    // Subscribe to streamed deltas for a specific run. Callback receives
    // `{ type: 'delta' | 'state' | 'done' | 'error', ... }`.
    subscribe: (runId, callback) =>
      subscribe(`chiqo.runs.delta.${runId}`, callback),
  }),

  // --- Usage / cost (Phase 4) -------------------------------------------
  usage: Object.freeze({
    summary: (range) => invoke("chiqo.usage.summary", range),
    list: (filter) => invoke("chiqo.usage.list", filter),
    daily: (opts) => invoke("chiqo.usage.daily", opts),
  }),

  // --- App utility (always-available) -----------------------------------
  app: Object.freeze({
    getPaths: () => invoke("chiqo.app.getPaths"),
    showInFolder: (filePath) => invoke("chiqo.app.showInFolder", filePath),
    openExternal: (url) => invoke("chiqo.app.openExternal", url),
    getVersion: () => invoke("chiqo.app.getVersion"),
  }),
});

contextBridge.exposeInMainWorld("chiqo", chiqo);
