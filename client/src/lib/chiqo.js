// Renderer-side wrapper around `window.chiqo` (the contextBridge surface
// exposed by electron/preload.cjs).
//
// Why this file exists:
//   - `window.chiqo` is undefined in browser dev mode (npm run dev:client
//     hits Vite on :5173 without Electron). Touching `.vault.status()`
//     directly would throw "Cannot read properties of undefined". This
//     module centralizes the "are we even inside Electron?" check.
//   - Components import named helpers (`vaultStatus`, `vaultUnlock`)
//     instead of reaching through three levels of frozen objects, which
//     keeps callsites readable.
//   - Single place to layer in defaults / error normalization.
//
// If `window.chiqo` isn't available, every call rejects with a typed
// error (`code: "NO_BRIDGE"`) so React components can show a helpful
// "open in the chiqo.ai desktop app" placeholder instead of crashing.

const noBridgeError = () => {
  const e = new Error(
    "chiqo.ai bridge unavailable — open this app via the chiqo.ai desktop launcher, not a plain browser."
  );
  e.code = "NO_BRIDGE";
  return e;
};

function bridge() {
  if (typeof window === "undefined" || !window.chiqo) return null;
  return window.chiqo;
}

export function hasBridge() {
  return bridge() !== null;
}

// --- Liveness ---------------------------------------------------------------

export async function ping() {
  const c = bridge();
  if (!c) throw noBridgeError();
  return c.ping();
}

// --- Vault -----------------------------------------------------------------

export async function vaultStatus() {
  const c = bridge();
  if (!c) throw noBridgeError();
  return c.vault.status();
}

export async function vaultCreate(password, opts) {
  const c = bridge();
  if (!c) throw noBridgeError();
  return c.vault.create(password, opts);
}

export async function vaultUnlock(password) {
  const c = bridge();
  if (!c) throw noBridgeError();
  return c.vault.unlock(password);
}

export async function vaultLock() {
  const c = bridge();
  if (!c) throw noBridgeError();
  return c.vault.lock();
}

export async function vaultGetHint() {
  const c = bridge();
  if (!c) throw noBridgeError();
  return c.vault.getHint();
}

export async function vaultSetHint(hint) {
  const c = bridge();
  if (!c) throw noBridgeError();
  return c.vault.setHint(hint);
}

export async function vaultChangePassword(oldPw, newPw) {
  const c = bridge();
  if (!c) throw noBridgeError();
  return c.vault.changePassword(oldPw, newPw);
}

export async function vaultWipe(confirmText) {
  const c = bridge();
  if (!c) throw noBridgeError();
  return c.vault.wipe(confirmText);
}

// --- Provider keys ---------------------------------------------------------
//
// These all require an unlocked vault. The renderer NEVER receives the
// plaintext key value back — `keysList` returns only provider +
// fingerprint + last4. The actual value goes into the encrypted vault
// DB and stays there.

export async function keysList() {
  const c = bridge();
  if (!c) throw noBridgeError();
  return c.keys.list();
}

export async function keysSet(provider, value) {
  const c = bridge();
  if (!c) throw noBridgeError();
  return c.keys.set(provider, value);
}

export async function keysDelete(provider) {
  const c = bridge();
  if (!c) throw noBridgeError();
  return c.keys.delete(provider);
}

// --- App utility ------------------------------------------------------------

export async function appGetPaths() {
  const c = bridge();
  if (!c) throw noBridgeError();
  return c.app.getPaths();
}

export async function appOpenExternal(url) {
  const c = bridge();
  if (!c) throw noBridgeError();
  return c.app.openExternal(url);
}
