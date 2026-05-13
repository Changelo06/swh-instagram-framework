// Vault metadata sidecar.
//
// Lives at <userData>/vault-meta.json, in plaintext, alongside the
// encrypted <userData>/vault.db. The metadata file is intentionally not
// encrypted — we need to read it BEFORE we can derive the KEK (because
// it carries the salt + KDF params + the wrapped DEK).
//
// What's safe to put here:
//   - KDF parameters (salt, memory cost, etc.) — public by Argon2 design
//   - Wrapped DEK — encrypted-at-rest with a key the user must derive
//   - Vault name + optional password hint — UX metadata; the user accepts
//     that anything they put in the hint is readable by anyone with the
//     file
//
// What does NOT go here:
//   - Anything from inside the vault. Run history, API keys, transcripts,
//     scripts — all of that lives in the SQLCipher DB and stays opaque
//     without the master password.

const fs = require("node:fs");
const path = require("node:path");

const FILE_VERSION = 1;

// Shape of the file:
//
//   {
//     version: 1,
//     name: "Mehdi's vault",
//     hint: "first dog's middle name",
//     createdAt: ISO,
//     updatedAt: ISO,
//     kdf: {
//       algorithm: "argon2id",
//       memorySize: 131072,
//       iterations: 4,
//       parallelism: 1,
//       hashLength: 32,
//       salt: "<32 hex chars>",
//     },
//     wrappedDek: "<122 hex chars>",
//   }

function isHex(s, lenBytes) {
  return (
    typeof s === "string" &&
    s.length === lenBytes * 2 &&
    /^[0-9a-f]+$/i.test(s)
  );
}

function validateMeta(meta) {
  if (!meta || typeof meta !== "object") {
    throw new Error("vault-meta: not an object");
  }
  if (meta.version !== FILE_VERSION) {
    throw new Error(
      `vault-meta: unsupported version ${meta.version} (this build expects ${FILE_VERSION})`
    );
  }
  if (typeof meta.name !== "string" || !meta.name) {
    throw new Error("vault-meta: missing name");
  }
  if (typeof meta.hint !== "string") {
    throw new Error("vault-meta: hint must be a string (use '' if no hint)");
  }
  if (!meta.kdf || meta.kdf.algorithm !== "argon2id") {
    throw new Error("vault-meta: kdf.algorithm must be 'argon2id'");
  }
  if (!isHex(meta.kdf.salt, 16)) {
    throw new Error("vault-meta: kdf.salt must be 32 hex chars (16 bytes)");
  }
  for (const k of ["memorySize", "iterations", "parallelism", "hashLength"]) {
    if (typeof meta.kdf[k] !== "number" || !Number.isFinite(meta.kdf[k])) {
      throw new Error(`vault-meta: kdf.${k} must be a finite number`);
    }
  }
  if (!isHex(meta.wrappedDek, 61)) {
    throw new Error("vault-meta: wrappedDek must be 122 hex chars (61 bytes)");
  }
  return meta;
}

// Locate the sidecar relative to a userData directory.
function metaPathFor(userDataDir) {
  return path.join(userDataDir, "vault-meta.json");
}

// Does a vault exist at this userData dir? (Just sidecar presence — the
// DB might be missing if the previous run crashed mid-create. That's
// caught at unlock time by SQLCipher rejecting an empty file.)
function exists(userDataDir) {
  return fs.existsSync(metaPathFor(userDataDir));
}

// Read + validate. Throws if the file is missing, malformed, or carries a
// version we don't recognize.
function read(userDataDir) {
  const p = metaPathFor(userDataDir);
  if (!fs.existsSync(p)) {
    const e = new Error("vault-meta: file does not exist");
    e.code = "ENOENT";
    throw e;
  }
  let raw;
  try {
    raw = fs.readFileSync(p, "utf8");
  } catch (e) {
    const err = new Error(`vault-meta: read failed: ${e.message}`);
    err.code = "READ_FAILED";
    throw err;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const err = new Error("vault-meta: invalid JSON");
    err.code = "CORRUPT";
    throw err;
  }
  return validateMeta(parsed);
}

// Atomic write: write to a sibling temp file, then rename. Prevents a
// crash mid-write from leaving the sidecar half-written and the vault
// inaccessible.
function write(userDataDir, meta) {
  validateMeta(meta);
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }
  const finalPath = metaPathFor(userDataDir);
  const tmpPath = `${finalPath}.tmp-${process.pid}-${Date.now()}`;
  const body = JSON.stringify(meta, null, 2) + "\n";
  fs.writeFileSync(tmpPath, body, { mode: 0o600 });
  fs.renameSync(tmpPath, finalPath);
}

// Build a fresh meta object from raw inputs. Pure — no disk I/O.
function buildMeta({
  name,
  hint,
  saltBuf,        // 16-byte Buffer
  wrappedDekBuf,  // 61-byte Buffer
  kdfParams,      // { memorySize, iterations, parallelism, hashLength }
}) {
  if (!Buffer.isBuffer(saltBuf) || saltBuf.length !== 16) {
    throw new TypeError("buildMeta: saltBuf must be a 16-byte Buffer");
  }
  if (!Buffer.isBuffer(wrappedDekBuf) || wrappedDekBuf.length !== 61) {
    throw new TypeError("buildMeta: wrappedDekBuf must be a 61-byte Buffer");
  }
  const now = new Date().toISOString();
  return {
    version: FILE_VERSION,
    name: String(name || "My chiqo vault"),
    hint: String(hint || ""),
    createdAt: now,
    updatedAt: now,
    kdf: {
      algorithm: "argon2id",
      memorySize: kdfParams.memorySize,
      iterations: kdfParams.iterations,
      parallelism: kdfParams.parallelism,
      hashLength: kdfParams.hashLength,
      salt: saltBuf.toString("hex"),
    },
    wrappedDek: wrappedDekBuf.toString("hex"),
  };
}

// Extract just what the unlock UI needs to show before the password is
// entered. Safe to call without authentication.
function publicView(meta) {
  return {
    exists: true,
    name: meta.name,
    hint: meta.hint || null,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
  };
}

// Helpers for tests / IPC handlers to pull binary values back out of
// the validated meta object.
function getSaltBuf(meta) {
  return Buffer.from(meta.kdf.salt, "hex");
}

function getWrappedDekBuf(meta) {
  return Buffer.from(meta.wrappedDek, "hex");
}

function getKdfParams(meta) {
  return {
    memorySize: meta.kdf.memorySize,
    iterations: meta.kdf.iterations,
    parallelism: meta.kdf.parallelism,
    hashLength: meta.kdf.hashLength,
  };
}

module.exports = {
  FILE_VERSION,
  metaPathFor,
  exists,
  read,
  write,
  buildMeta,
  publicView,
  validateMeta,
  getSaltBuf,
  getWrappedDekBuf,
  getKdfParams,
};
