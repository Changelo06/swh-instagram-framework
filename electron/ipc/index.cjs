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
