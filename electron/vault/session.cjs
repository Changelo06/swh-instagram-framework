// Vault session state — main-process module-level singleton.
//
// Holds the unlocked DEK and the open SQLCipher handle while the vault
// is unlocked. Everything except `status()` requires the vault to be
// unlocked; calling them locked throws { code: LOCKED }.
//
// Idle-lock plumbing is scaffolded here (resetIdleTimer / configureIdle)
// but the actual timer-fired auto-lock UI is wired in Phase 4. For now
// callers can drive lock() manually.

const path = require("node:path");
const fs = require("node:fs");

const crypto = require("./crypto.cjs");
const meta = require("./meta.cjs");
const db = require("./db.cjs");
const keys = require("./keys.cjs");

// State.
//
// `locked` is the default. `unlocked` carries the DEK and the open DB
// handle. We deliberately avoid stashing the master password — once
// the KEK is derived and the DEK is unwrapped, we zeroize both KEK
// and the password buffer (the password itself comes in as a string
// from IPC; we can't reliably zeroize JS strings, but we don't hold
// references to it past unwrap).
let state = { kind: "locked" };

function userDataDir() {
  // Set by setUserDataDir before any vault op. Avoids importing
  // electron/app from this module (keeps it unit-testable).
  if (!_userDataDir) {
    throw new Error("session: userDataDir not configured");
  }
  return _userDataDir;
}

let _userDataDir = null;
function setUserDataDir(dir) {
  _userDataDir = dir;
}

function isUnlocked() {
  return state.kind === "unlocked";
}

function requireUnlocked() {
  if (state.kind !== "unlocked") {
    const e = new Error("vault is locked");
    e.code = "LOCKED";
    throw e;
  }
  return state;
}

function status() {
  if (!meta.exists(userDataDir())) {
    return { exists: false, locked: true, name: null, hint: null };
  }
  // We can show the public view of the meta without unlocking. If the
  // meta is corrupt we surface exists:false so the UI offers a wipe.
  let m;
  try {
    m = meta.read(userDataDir());
  } catch {
    return { exists: false, locked: true, name: null, hint: null, corrupt: true };
  }
  return {
    exists: true,
    locked: state.kind !== "unlocked",
    name: m.name,
    hint: m.hint || null,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

async function create(password, { name, hint } = {}) {
  if (typeof password !== "string" || password.length === 0) {
    const e = new Error("create: password must be a non-empty string");
    e.code = "BAD_INPUT";
    throw e;
  }
  if (meta.exists(userDataDir())) {
    const e = new Error("create: a vault already exists at this userData dir");
    e.code = "ALREADY_EXISTS";
    throw e;
  }
  const salt = crypto.randomSalt();
  let kek;
  let dek = crypto.randomDek();
  try {
    kek = await crypto.deriveKey(password, salt);
    const wrapped = crypto.wrapDek(kek, dek);
    const m = meta.buildMeta({
      name: name || "My chiqo vault",
      hint: hint || "",
      saltBuf: salt,
      wrappedDekBuf: wrapped,
      kdfParams: crypto.KDF_PARAMS_DEFAULT,
    });
    meta.write(userDataDir(), m);

    // Create the DB file immediately so a follow-up unlock doesn't see
    // a half-built vault if the user backgrounds the app.
    const handle = db.openDb(userDataDir(), dek, { create: true });
    state = { kind: "unlocked", dek, db: handle, unlockedAt: Date.now() };
    // dek ownership transferred into state; don't zeroize.
    dek = null;
  } finally {
    if (kek) crypto.zeroize(kek);
    // If something blew up before state took ownership of dek, zero it.
    if (dek) crypto.zeroize(dek);
  }
  return status();
}

async function unlock(password) {
  if (state.kind === "unlocked") {
    return status(); // idempotent — already unlocked
  }
  if (typeof password !== "string" || password.length === 0) {
    const e = new Error("unlock: password required");
    e.code = "BAD_INPUT";
    throw e;
  }
  if (!meta.exists(userDataDir())) {
    const e = new Error("unlock: no vault exists at this userData dir");
    e.code = "NO_VAULT";
    throw e;
  }
  const m = meta.read(userDataDir());
  let kek;
  let dek;
  try {
    kek = await crypto.deriveKey(
      password,
      meta.getSaltBuf(m),
      meta.getKdfParams(m)
    );
    try {
      dek = crypto.unwrapDek(kek, meta.getWrappedDekBuf(m));
    } catch (e) {
      // BAD_AUTH_TAG → wrong password. Rebrand for the renderer.
      if (e.code === "BAD_AUTH_TAG") {
        const err = new Error("unlock: incorrect password");
        err.code = "BAD_PASSWORD";
        throw err;
      }
      throw e;
    }
    const handle = db.openDb(userDataDir(), dek);
    state = { kind: "unlocked", dek, db: handle, unlockedAt: Date.now() };
    dek = null; // ownership transferred
  } finally {
    if (kek) crypto.zeroize(kek);
    if (dek) crypto.zeroize(dek);
  }
  return status();
}

function lock() {
  if (state.kind === "unlocked") {
    // Seal the plaintext working file back into vault.db.enc before
    // dropping the DEK. If sealing throws (e.g., disk full), we still
    // zeroize and lock — leaving the plaintext file in place — so the
    // next unlock can recover.
    try {
      db.closeAndSeal(state.db, userDataDir(), state.dek);
    } catch (e) {
      // Best-effort fallback close.
      try {
        db.closeDb(state.db);
      } catch {}
    }
    crypto.zeroize(state.dek);
  }
  state = { kind: "locked" };
  return status();
}

function getHint() {
  if (!meta.exists(userDataDir())) return null;
  try {
    const m = meta.read(userDataDir());
    return m.hint || null;
  } catch {
    return null;
  }
}

function setHint(hint) {
  requireUnlocked();
  if (typeof hint !== "string") {
    const e = new Error("setHint: hint must be a string");
    e.code = "BAD_INPUT";
    throw e;
  }
  const m = meta.read(userDataDir());
  m.hint = hint;
  m.updatedAt = new Date().toISOString();
  meta.write(userDataDir(), m);
  return status();
}

async function changePassword(oldPassword, newPassword) {
  const s = requireUnlocked();
  if (typeof newPassword !== "string" || newPassword.length === 0) {
    const e = new Error("changePassword: newPassword required");
    e.code = "BAD_INPUT";
    throw e;
  }
  // Re-derive the OLD KEK to verify the user actually knows the
  // current password (defense in depth — even though we have an
  // unlocked session, we don't want an attacker who hijacked the
  // unlocked state to silently rotate the password).
  const m = meta.read(userDataDir());
  let oldKek;
  try {
    oldKek = await crypto.deriveKey(
      oldPassword,
      meta.getSaltBuf(m),
      meta.getKdfParams(m)
    );
    try {
      crypto.unwrapDek(oldKek, meta.getWrappedDekBuf(m));
    } catch {
      const e = new Error("changePassword: current password is incorrect");
      e.code = "BAD_PASSWORD";
      throw e;
    }
  } finally {
    if (oldKek) crypto.zeroize(oldKek);
  }

  // Re-derive a new KEK against a FRESH salt and re-wrap the existing
  // DEK with it. The DB itself doesn't need re-encrypting — the DEK is
  // unchanged.
  const newSalt = crypto.randomSalt();
  let newKek;
  try {
    newKek = await crypto.deriveKey(newPassword, newSalt);
    const newWrapped = crypto.wrapDek(newKek, s.dek);
    const updated = {
      ...m,
      kdf: {
        ...m.kdf,
        salt: newSalt.toString("hex"),
      },
      wrappedDek: newWrapped.toString("hex"),
      updatedAt: new Date().toISOString(),
    };
    meta.write(userDataDir(), updated);
  } finally {
    if (newKek) crypto.zeroize(newKek);
  }
  return status();
}

// Destroy the vault — irrecoverable. Caller MUST gate this behind a
// typed "WIPE" confirmation in the UI; we re-check here too.
function wipe(confirmText) {
  if (confirmText !== "WIPE") {
    const e = new Error('wipe: confirmText must be exactly "WIPE"');
    e.code = "BAD_CONFIRM";
    throw e;
  }
  const dir = userDataDir();
  // If unlocked, close the DB handle directly (no need to seal — we're
  // about to delete everything anyway). Then zeroize and lock state.
  if (state.kind === "unlocked") {
    try {
      db.closeDb(state.db);
    } catch {}
    crypto.zeroize(state.dek);
    state = { kind: "locked" };
  }
  // Delete every vault-related file.
  db.deleteAll(dir);
  const metaPath = meta.metaPathFor(dir);
  if (fs.existsSync(metaPath)) {
    try {
      fs.unlinkSync(metaPath);
    } catch {}
  }
  return { wiped: true };
}

// Exposed so IPC handlers in non-test contexts can run DB queries
// inside the unlocked session. Returns the better-sqlite3 handle.
function getDb() {
  return requireUnlocked().db;
}

// --- API key passthroughs ------------------------------------------------
//
// Thin wrappers that gate keys.cjs operations on the vault being
// unlocked. The IPC handlers in electron/ipc/index.cjs route through
// these so vault state semantics (LOCKED error) live in one place.

function listApiKeys() {
  return keys.listKeys(requireUnlocked().db);
}

function setApiKey(provider, value) {
  return keys.setKey(requireUnlocked().db, provider, value);
}

function deleteApiKey(provider) {
  return keys.deleteKey(requireUnlocked().db, provider);
}

// Main-process-only. Returns the plaintext key. Used by Phase 2.6's
// provider-call code (Anthropic SDK, Groq fetch, Apify fetch) — NEVER
// expose this through IPC.
function getApiKey(provider) {
  return keys.getKey(requireUnlocked().db, provider);
}

module.exports = {
  setUserDataDir,
  isUnlocked,
  status,
  create,
  unlock,
  lock,
  getHint,
  setHint,
  changePassword,
  wipe,
  getDb,
  // API keys (provider keys live encrypted in the vault DB)
  listApiKeys,
  setApiKey,
  deleteApiKey,
  getApiKey, // main-process-only; never expose through IPC
  // Test seam — reset to clean locked state without touching disk.
  // Skips the seal step on purpose; tests want to start fresh, not
  // preserve session-y disk artifacts.
  __resetForTests() {
    if (state.kind === "unlocked") {
      try {
        db.closeDb(state.db);
      } catch {}
      crypto.zeroize(state.dek);
    }
    state = { kind: "locked" };
    _userDataDir = null;
  },
};
