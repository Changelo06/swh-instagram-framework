// Main-process IPC registry.
//
// Wires every channel exposed by electron/preload.cjs to a concrete
// handler. Channels that haven't been implemented yet still get
// registered with a fallback so the renderer gets a fast, typed error
// instead of an indefinite hang on `ipcRenderer.invoke`.
//
// Each handler is wrapped so thrown errors become `{ message, code }`
// over the wire (Electron's default error serialization loses extra
// properties).

const { ipcMain, shell, app } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const CHANNELS = require("./channels.cjs");
const vaultSession = require("../vault/session.cjs");
const runs = require("../runs/index.cjs");
const anthropicProvider = require("../providers/anthropic.cjs");
const groqProvider = require("../providers/groq.cjs");
const apifyProvider = require("../providers/apify.cjs");
const parseProvider = require("../providers/parse.cjs");

// Wraps a handler so errors travel back to the renderer with the
// `code` field intact. Anything thrown becomes:
//   { message: string, code?: string, channel: string }
function safeHandle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await fn(event, ...args);
    } catch (err) {
      const wire = {
        message: err?.message || String(err),
        channel,
      };
      if (err?.code) wire.code = err.code;
      throw wire;
    }
  });
}

// Registry — declared as a closure so we can lazily add handlers from
// later phases without rewriting this file's shape.
function register({ userDataDir, appRoot }) {
  // Hand the vault session its userData dir so it knows where to read /
  // write `vault-meta.json` and `vault.db`.
  vaultSession.setUserDataDir(userDataDir);

  // The runs domain wants the same userDataDir for usage-log writes.
  // Anthropic provider needs the appRoot to locate the system prompt.
  runs.setUserDataDir(userDataDir);
  anthropicProvider.setAppRoot(appRoot);

  // ---- Vault handlers (Phase 1.3) ----------------------------------
  // status is read-only and works whether or not a vault exists. The
  // others either require an existing vault, or require unlock — they
  // throw typed errors the renderer maps to UI states.

  safeHandle("chiqo.vault.status", () => vaultSession.status());

  safeHandle("chiqo.vault.create", async (_e, password, opts) =>
    vaultSession.create(password, opts || {})
  );

  safeHandle("chiqo.vault.unlock", async (_e, password) =>
    vaultSession.unlock(password)
  );

  safeHandle("chiqo.vault.lock", () => vaultSession.lock());

  safeHandle("chiqo.vault.getHint", () => ({ hint: vaultSession.getHint() }));

  safeHandle("chiqo.vault.setHint", (_e, hint) => vaultSession.setHint(hint));

  safeHandle(
    "chiqo.vault.changePassword",
    async (_e, oldPw, newPw) => vaultSession.changePassword(oldPw, newPw)
  );

  safeHandle("chiqo.vault.wipe", (_e, confirmText) =>
    vaultSession.wipe(confirmText)
  );

  // ---- Provider API keys (Phase 2.5) -------------------------------
  // All three require an unlocked vault. SECURITY INVARIANT: the
  // renderer never receives the plaintext key value back across IPC.
  // listKeys/setKey return public-safe metadata (provider, fingerprint,
  // last4, timestamps) only; the value sits inside the encrypted DB.

  safeHandle("chiqo.keys.list", () => vaultSession.listApiKeys());

  safeHandle("chiqo.keys.set", (_e, provider, value) =>
    vaultSession.setApiKey(provider, value)
  );

  safeHandle("chiqo.keys.delete", (_e, provider) =>
    vaultSession.deleteApiKey(provider)
  );

  // ---- Anthropic streaming + runs (Phase 2.6) -----------------------
  // chiqo.anthropic.analyze accepts the same payload shape the old
  // /api/analyze endpoint did (rows, mode, filename, scriptCount, dna,
  // dnaFilename). Returns { runId } synchronously; the renderer
  // subscribes via chiqo.runs.subscribe(runId, callback) to receive
  // streamed deltas + the final done/error event.
  //
  // The API key is pulled from the unlocked vault — never from env,
  // never from the IPC payload. If the vault is locked, getApiKey
  // throws LOCKED; if no key is set for Anthropic, providers/anthropic
  // throws NO_API_KEY. Both surface cleanly on the renderer side.

  safeHandle("chiqo.anthropic.analyze", (event, payload) =>
    anthropicProvider.startAnalyzeRun({
      payload: payload || {},
      getApiKey: () => {
        const key = vaultSession.getApiKey("anthropic");
        if (!key) {
          const e = new Error(
            "Anthropic key is not configured. Open Settings → API keys to add one."
          );
          e.code = "NO_API_KEY";
          throw e;
        }
        return key;
      },
      sender: event.sender,
    })
  );

  safeHandle("chiqo.anthropic.stop", (_e, runId) => runs.stop(runId));

  // ---- Groq Whisper (Phase 2.7) -------------------------------------
  // Same lifecycle envelope as Anthropic — chiqo.groq.transcribe returns
  // a runId synchronously, then streams `event:start` + `event:progress`
  // events on chiqo.runs.delta.<runId> and ends with `done` carrying the
  // enriched rows.
  safeHandle("chiqo.groq.transcribe", (event, payload) =>
    groqProvider.startTranscribeRun({
      payload: payload || {},
      getApiKey: () => {
        const key = vaultSession.getApiKey("groq");
        if (!key) {
          const e = new Error(
            "Groq key is not configured. Open Settings → API keys to add one."
          );
          e.code = "NO_API_KEY";
          throw e;
        }
        return key;
      },
      sender: event.sender,
    })
  );
  safeHandle("chiqo.groq.stop", (_e, runId) => runs.stop(runId));

  // ---- Apify scrape + account (Phase 2.7) ---------------------------
  safeHandle("chiqo.apify.scrape", (event, payload) =>
    apifyProvider.startScrapeRun({
      payload: payload || {},
      getApiKey: () => {
        const key = vaultSession.getApiKey("apify");
        if (!key) {
          const e = new Error(
            "Apify token is not configured. Open Settings → API keys to add one."
          );
          e.code = "NO_API_KEY";
          throw e;
        }
        return key;
      },
      // Optional — scrape can run without a Groq key (transcripts are
      // skipped with a `warn` event). DO NOT throw NO_API_KEY here.
      getGroqApiKey: () => vaultSession.getApiKey("groq") || "",
      sender: event.sender,
    })
  );
  safeHandle("chiqo.apify.stop", (_e, runId) => runs.stop(runId));
  safeHandle("chiqo.apify.account", () => {
    const token = vaultSession.getApiKey("apify");
    if (!token) {
      const e = new Error(
        "Apify token is not configured. Open Settings → API keys to add one."
      );
      e.code = "NO_API_KEY";
      throw e;
    }
    return apifyProvider.fetchAccount({ token });
  });

  // ---- Dataset parse (Phase 2.7) ------------------------------------
  // The renderer hands us an ArrayBuffer + filename. We coerce to a Node
  // Buffer and run the same pickFields/summarize pipeline the scrape
  // path uses, so an uploaded CSV and an Apify scrape produce
  // structurally identical rows.
  safeHandle("chiqo.parse.file", (_e, buffer, filename) =>
    parseProvider.parseBuffer({ buffer, filename })
  );

  // Token estimation lands in Phase 4 alongside the cost preview UI.
  // Stub it for now so the channel exists (returns a rough character-
  // based estimate the renderer can ignore).
  safeHandle("chiqo.anthropic.countTokens", (_e, payload) => {
    const text =
      typeof payload === "string"
        ? payload
        : JSON.stringify(payload?.rows || payload || "");
    // ~4 chars per token is the long-standing English rule of thumb.
    return { tokens: Math.ceil(text.length / 4), method: "char-based-estimate" };
  });

  // Runs read-only queries. List + get expose the in-memory view; a
  // delete is allowed for finished runs (in-flight rejects with
  // IN_FLIGHT).
  safeHandle("chiqo.runs.list", () => runs.list());
  safeHandle("chiqo.runs.get", (_e, runId) => runs.get(runId));
  safeHandle("chiqo.runs.delete", (_e, runId) => runs.remove(runId));


  // -------------------------------------------------------------------
  // Liveness check.
  //
  // Used by the renderer on boot to confirm the preload bridge works
  // end-to-end before it tries to do anything real.
  // -------------------------------------------------------------------
  safeHandle("chiqo.ping", () => ({
    pong: true,
    version: app.getVersion(),
    electron: process.versions.electron,
    node: process.versions.node,
    pid: process.pid,
    ts: Date.now(),
  }));

  // -------------------------------------------------------------------
  // App utility.
  //
  // Read-only or safe-side-effect calls. No data access, no secrets.
  // Available before the vault is unlocked.
  // -------------------------------------------------------------------
  safeHandle("chiqo.app.getPaths", () => ({
    userData: userDataDir,
    appRoot,
    packaged: app.isPackaged,
    resourcesPath: app.isPackaged ? process.resourcesPath : null,
  }));

  safeHandle("chiqo.app.getVersion", () => app.getVersion());

  safeHandle("chiqo.app.showInFolder", (_e, filePath) => {
    if (typeof filePath !== "string") {
      const err = new Error("showInFolder requires a string path");
      err.code = "BAD_ARG";
      throw err;
    }
    // Only allow paths inside userData. Prevents the renderer from
    // peeking into arbitrary places on disk via this channel.
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(userDataDir))) {
      const err = new Error(
        "showInFolder is restricted to paths inside the chiqo userData directory"
      );
      err.code = "PATH_OUT_OF_BOUNDS";
      throw err;
    }
    if (!fs.existsSync(resolved)) {
      const err = new Error(`No such path: ${resolved}`);
      err.code = "ENOENT";
      throw err;
    }
    shell.showItemInFolder(resolved);
    return { ok: true };
  });

  safeHandle("chiqo.app.openExternal", (_e, url) => {
    if (typeof url !== "string" || !/^https?:\/\//.test(url)) {
      const err = new Error("openExternal accepts http(s) URLs only");
      err.code = "BAD_ARG";
      throw err;
    }
    shell.openExternal(url);
    return { ok: true };
  });

  // -------------------------------------------------------------------
  // Fallback registrar for not-yet-implemented channels.
  //
  // Every channel listed in CHANNELS.UNIMPLEMENTED gets a stub that
  // rejects with `NOT_IMPLEMENTED` and a phase hint. As phases land,
  // each channel moves out of CHANNELS.UNIMPLEMENTED and into a real
  // handler.
  // -------------------------------------------------------------------
  for (const { channel, phase } of CHANNELS.UNIMPLEMENTED) {
    if (ipcMain.eventNames().includes(channel)) continue; // already wired
    safeHandle(channel, () => {
      const err = new Error(
        `${channel} is not implemented yet (lands in Phase ${phase})`
      );
      err.code = "NOT_IMPLEMENTED";
      throw err;
    });
  }
}

module.exports = { register };
