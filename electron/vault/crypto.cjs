// chiqo.ai vault — cryptographic primitives.
//
// Standalone module. No DB, no UI, no Electron deps. Every function is
// pure (or pure modulo crypto.randomBytes). This file is unit-tested in
// isolation via electron/vault/crypto.test.cjs.
//
// Roles in the key hierarchy:
//
//   Master password
//        │
//        │ Argon2id(salt, params)
//        ▼
//      KEK  (Key Encryption Key, 32 bytes, in-memory only, never persisted)
//        │
//        │ AES-256-GCM wrap
//        ▼
//      DEK  (Data Encryption Key, 32 bytes, persisted as a wrapped blob)
//        │
//        │ Hex-encoded — passed verbatim to SQLCipher's `PRAGMA key`
//        ▼
//      Encrypted SQLite DB
//
// Why a two-layer KEK/DEK design instead of feeding the password directly
// into SQLCipher:
//   - Rotating the master password becomes "re-wrap the DEK with the new
//     KEK" — no need to re-encrypt the entire database.
//   - The KEK can be zeroized aggressively after each unlock; only the
//     DEK (which SQLCipher needs for every query) sits in memory while
//     the vault is open.
//   - The wrapped DEK gets a GCM auth tag, giving us a constant-time
//     wrong-password check independent of SQLCipher's behavior.
//
// On-disk format for a wrapped DEK (61 bytes total):
//
//   [version 1B][iv 12B][ciphertext 32B][gcm tag 16B]
//
// Bumping the version byte rotates the format without breaking old
// vaults — unwrap inspects byte 0 first and dispatches accordingly.

const crypto = require("node:crypto");
const { argon2id } = require("hash-wasm");

// --- Constants -------------------------------------------------------------

const VERSION = 0x01;
const KEY_LEN = 32; // 256 bits — used for KEK, DEK, AES key (all the same size)
const SALT_LEN = 16; // 128 bits — Argon2 salt
const IV_LEN = 12;   // 96 bits — GCM nonce
const TAG_LEN = 16;  // 128 bits — GCM auth tag
const WRAPPED_LEN = 1 + IV_LEN + KEY_LEN + TAG_LEN; // 61

// Argon2id parameters.
//
// OWASP's 2023 baseline is M=19 MiB / T=2 / p=1, but that's designed for
// server-side login throughput. A local vault unlocks once per session,
// so we can spend more compute per derive without hurting UX. Bench on a
// 2024 laptop puts these defaults at ~300ms — fast enough to feel
// instant, slow enough to crater offline brute-force attempts against a
// stolen DB file by an order of magnitude vs the OWASP baseline.
//
// Tunable per call via the `params` argument to deriveKey, so an
// admin-grade machine can dial higher (e.g., 256 MiB / T=6) at unlock
// time if they really want.
const KDF_PARAMS_DEFAULT = Object.freeze({
  memorySize: 131072, // KiB (≈ 128 MiB)
  iterations: 4,
  parallelism: 1,
  hashLength: KEY_LEN,
});

// --- Key derivation --------------------------------------------------------

// Derive a 32-byte KEK from the master password + salt.
//
// Returns a Buffer. The salt parameter MUST be stable for a given vault
// (read it from vault-meta.json before calling). Throws TypeError on bad
// arguments — bad-password checks live in unwrapDek, not here.
async function deriveKey(password, salt, params = {}) {
  if (typeof password !== "string" || password.length === 0) {
    throw new TypeError("deriveKey: password must be a non-empty string");
  }
  if (!Buffer.isBuffer(salt) || salt.length !== SALT_LEN) {
    throw new TypeError(
      `deriveKey: salt must be a ${SALT_LEN}-byte Buffer (got ${salt?.length})`
    );
  }
  const opts = { ...KDF_PARAMS_DEFAULT, ...params };
  const raw = await argon2id({
    password,
    salt,
    parallelism: opts.parallelism,
    iterations: opts.iterations,
    memorySize: opts.memorySize,
    hashLength: opts.hashLength,
    outputType: "binary",
  });
  // hash-wasm returns Uint8Array; normalize to Buffer for parity with
  // the rest of Node's crypto APIs.
  return Buffer.from(raw);
}

// --- DEK wrap / unwrap (AES-256-GCM) --------------------------------------

// Wrap a 32-byte DEK with the 32-byte KEK. Returns a 61-byte Buffer:
//   [version][iv][ciphertext][tag]
function wrapDek(kek, dek) {
  if (!Buffer.isBuffer(kek) || kek.length !== KEY_LEN) {
    throw new TypeError(`wrapDek: kek must be a ${KEY_LEN}-byte Buffer`);
  }
  if (!Buffer.isBuffer(dek) || dek.length !== KEY_LEN) {
    throw new TypeError(`wrapDek: dek must be a ${KEY_LEN}-byte Buffer`);
  }
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv("aes-256-gcm", kek, iv);
  const ciphertext = Buffer.concat([cipher.update(dek), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([VERSION]), iv, ciphertext, tag]);
}

// Reverse of wrapDek. Returns the 32-byte DEK on success.
//
// Throws with one of these `.code` values:
//   - BAD_INPUT       — wrong types / wrong lengths
//   - BAD_VERSION     — version byte we don't recognize
//   - BAD_AUTH_TAG    — GCM auth failed (wrong KEK or tampered ciphertext)
//
// The renderer-facing UX maps BAD_AUTH_TAG → "wrong master password" but
// the crypto layer doesn't make that assumption — it just reports what
// the cipher said.
function unwrapDek(kek, wrapped) {
  if (!Buffer.isBuffer(kek) || kek.length !== KEY_LEN) {
    const e = new TypeError(`unwrapDek: kek must be a ${KEY_LEN}-byte Buffer`);
    e.code = "BAD_INPUT";
    throw e;
  }
  if (!Buffer.isBuffer(wrapped)) {
    const e = new TypeError("unwrapDek: wrapped must be a Buffer");
    e.code = "BAD_INPUT";
    throw e;
  }
  if (wrapped.length !== WRAPPED_LEN) {
    const e = new Error(
      `unwrapDek: wrapped buffer must be ${WRAPPED_LEN} bytes (got ${wrapped.length})`
    );
    e.code = "BAD_INPUT";
    throw e;
  }
  const version = wrapped[0];
  if (version !== VERSION) {
    const e = new Error(`unwrapDek: unknown wrap version 0x${version.toString(16)}`);
    e.code = "BAD_VERSION";
    throw e;
  }
  const iv = wrapped.subarray(1, 1 + IV_LEN);
  const ciphertext = wrapped.subarray(1 + IV_LEN, 1 + IV_LEN + KEY_LEN);
  const tag = wrapped.subarray(1 + IV_LEN + KEY_LEN);
  const decipher = crypto.createDecipheriv("aes-256-gcm", kek, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    // Don't surface the underlying error message — Node's GCM auth
    // failure phrasing leaks no extra info but we keep our own string
    // for log grep-ability.
    const e = new Error("unwrapDek: authentication failed");
    e.code = "BAD_AUTH_TAG";
    throw e;
  }
}

// --- Random helpers --------------------------------------------------------

function randomBytes(n) {
  if (!Number.isInteger(n) || n <= 0) {
    throw new TypeError("randomBytes: n must be a positive integer");
  }
  return crypto.randomBytes(n);
}

function randomSalt() {
  return crypto.randomBytes(SALT_LEN);
}

function randomDek() {
  return crypto.randomBytes(KEY_LEN);
}

// --- Memory hygiene --------------------------------------------------------

// Overwrite a Buffer with zeros. Use after we're done with a KEK / DEK
// or any other sensitive value. Note: V8's garbage collector and string
// interning mean we can NOT zeroize JS strings reliably — passwords
// arriving as strings already leak some lifetime. Keep secrets in
// Buffers as early as possible.
function zeroize(buf) {
  if (Buffer.isBuffer(buf) && buf.length > 0) buf.fill(0);
}

// --- Public surface --------------------------------------------------------

module.exports = {
  // Constants worth exporting for callers / tests.
  KEY_LEN,
  SALT_LEN,
  IV_LEN,
  TAG_LEN,
  WRAPPED_LEN,
  VERSION,
  KDF_PARAMS_DEFAULT,

  // Operations.
  deriveKey,
  wrapDek,
  unwrapDek,
  randomBytes,
  randomSalt,
  randomDek,
  zeroize,
};
