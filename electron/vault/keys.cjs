// Provider API key store — lives in the encrypted SQLite vault.
//
// Three providers: anthropic, groq, apify. Each can have at most one
// stored key (PRIMARY KEY on provider). Replacing = upsert.
//
// SECURITY INVARIANT: the `value` column is never returned to the
// renderer. Renderer-facing methods (publicView, listKeys, the IPC
// handlers) return only `fingerprint` (first 8 hex of sha-256(value))
// + `last4`. The raw value leaves this module ONLY through `getKey()`,
// which is called by provider-call code that runs in the Electron
// main process.
//
// Fingerprint vs last4 — they serve different UX purposes:
//   - fingerprint disambiguates two keys for the same provider
//     ("is this the right one?") and lets us detect re-uploads of
//     identical keys (idempotent set)
//   - last4 is visual recognition ("yeah that's the one ending in HZx")

const crypto = require("node:crypto");

// Providers we accept. Anything outside this list is rejected.
const KNOWN_PROVIDERS = new Set(["anthropic", "groq", "apify"]);

// Loose prefix hints — used only to warn the user, never to reject.
// Providers occasionally change formats; we'd rather store a key the
// user pasted than silently throw on "I think this looks wrong".
const KNOWN_PREFIXES = {
  anthropic: "sk-ant-",
  groq: "gsk_",
  apify: "apify_api_",
};

function fingerprintOf(value) {
  return crypto
    .createHash("sha256")
    .update(value, "utf8")
    .digest("hex")
    .slice(0, 8);
}

function last4Of(value) {
  return value.length >= 4 ? value.slice(-4) : value;
}

function looksLikeKnownFormat(provider, value) {
  const prefix = KNOWN_PREFIXES[provider];
  if (!prefix) return true;
  return value.startsWith(prefix);
}

// --- Validators ----------------------------------------------------------

function validateProvider(provider) {
  if (!KNOWN_PROVIDERS.has(provider)) {
    const e = new Error(
      `keys: unknown provider '${provider}' (expected one of: ${[
        ...KNOWN_PROVIDERS,
      ].join(", ")})`
    );
    e.code = "BAD_PROVIDER";
    throw e;
  }
}

function validateValue(value) {
  if (typeof value !== "string") {
    const e = new TypeError("keys: value must be a string");
    e.code = "BAD_INPUT";
    throw e;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    const e = new Error("keys: value cannot be empty");
    e.code = "BAD_INPUT";
    throw e;
  }
  // Reject obviously bogus values (whitespace inside is a red flag —
  // pasted keys never contain whitespace). But don't enforce length
  // upper bounds; providers might extend key formats.
  if (/\s/.test(trimmed)) {
    const e = new Error("keys: value contains whitespace");
    e.code = "BAD_INPUT";
    throw e;
  }
  return trimmed;
}

// --- Queries -------------------------------------------------------------

function listKeys(db) {
  const rows = db
    .prepare(
      `SELECT provider, fingerprint, last4, created_at AS createdAt, updated_at AS updatedAt
         FROM api_keys
         ORDER BY provider`
    )
    .all();
  // Make sure value never accidentally leaks in. Defense in depth — the
  // SQL doesn't select it, but if a future schema change adds it back,
  // this filter catches it.
  return rows.map((r) => ({
    provider: r.provider,
    fingerprint: r.fingerprint,
    last4: r.last4,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

function setKey(db, provider, value) {
  validateProvider(provider);
  const clean = validateValue(value);
  const now = new Date().toISOString();
  const fp = fingerprintOf(clean);
  const l4 = last4Of(clean);

  // Preserve created_at on replace.
  const existing = db
    .prepare("SELECT created_at FROM api_keys WHERE provider = ?")
    .get(provider);
  const createdAt = existing ? existing.created_at : now;

  db.prepare(
    `INSERT INTO api_keys (provider, value, fingerprint, last4, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(provider) DO UPDATE SET
         value        = excluded.value,
         fingerprint  = excluded.fingerprint,
         last4        = excluded.last4,
         updated_at   = excluded.updated_at`
  ).run(provider, clean, fp, l4, createdAt, now);

  return {
    provider,
    fingerprint: fp,
    last4: l4,
    createdAt,
    updatedAt: now,
    looksValid: looksLikeKnownFormat(provider, clean),
  };
}

function deleteKey(db, provider) {
  validateProvider(provider);
  const r = db.prepare("DELETE FROM api_keys WHERE provider = ?").run(provider);
  return { deleted: r.changes > 0 };
}

// MAIN-PROCESS ONLY. Returns the plaintext key for a provider, or null
// if not configured. Never invoke from an IPC handler that returns the
// result to the renderer — the only legitimate caller is the provider-
// call code (Anthropic SDK, Groq fetch, Apify fetch) which runs in
// main and never serializes the key back across IPC.
function getKey(db, provider) {
  validateProvider(provider);
  const row = db
    .prepare("SELECT value FROM api_keys WHERE provider = ?")
    .get(provider);
  return row ? row.value : null;
}

module.exports = {
  KNOWN_PROVIDERS: [...KNOWN_PROVIDERS],
  KNOWN_PREFIXES,
  fingerprintOf,
  last4Of,
  looksLikeKnownFormat,
  validateProvider,
  validateValue,
  listKeys,
  setKey,
  deleteKey,
  getKey,
};
