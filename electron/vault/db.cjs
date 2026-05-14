// chiqo.ai vault — encrypted-at-rest SQLite store.
//
// IMPORTANT (architectural compromise):
//
//   This module uses file-level AES-GCM wrapping over a plain better-
//   sqlite3 database, NOT SQLCipher's page-level encryption.
//
//   The persisted artifact (`vault.db.enc`) is fully opaque on disk —
//   no app data is recoverable from it without the master password.
//   That satisfies the doc's acceptance criterion as written.
//
//   The compromise vs. real SQLCipher: while the vault is UNLOCKED, a
//   plaintext working file (`vault.db`) lives next to it on disk. Lock
//   removes it. Crash leaves it behind until the next successful
//   unlock + lock cycle re-seals.
//
//   We're on this path because:
//     - SQLCipher bindings require a from-source C++ rebuild for
//       Electron's specific Node ABI
//     - That build needs Visual Studio Build Tools (~5 GB, admin)
//     - The current dev machine doesn't have it
//   Once VS Build Tools is available (or a binding ships Electron
//   prebuilds), we can swap SQLCipher back in by replacing this file —
//   the crypto module (KEK/DEK + Argon2id) doesn't change, neither does
//   the IPC surface or the session state machine.
//
// On-disk layout (in <userData>/):
//
//   vault.db.enc            ← persisted, always encrypted (61B header + body)
//   vault.db                ← transient, exists only between unlock and lock
//   vault-meta.json         ← public sidecar (salt, wrapped DEK, hint, name)
//
// Wrapped-file format inside vault.db.enc:
//
//   [version 1B][iv 12B][ciphertext...][gcm tag 16B]
//
//   ciphertext = AES-256-GCM(dek, iv) of the entire SQLite file bytes.

const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const Database = require("better-sqlite3");

const SEALED_FILENAME = "vault.db.enc";
const PLAINTEXT_FILENAME = "vault.db";

const SEAL_VERSION = 0x01;
const SEAL_IV_LEN = 12;
const SEAL_TAG_LEN = 16;
const SEAL_HEADER_LEN = 1 + SEAL_IV_LEN; // version + iv

// --- Paths ----------------------------------------------------------------

function sealedPathFor(userDataDir) {
  return path.join(userDataDir, SEALED_FILENAME);
}
function plaintextPathFor(userDataDir) {
  return path.join(userDataDir, PLAINTEXT_FILENAME);
}
// "The DB file on disk" from the rest of the app's POV = the encrypted
// artifact. The plaintext is transient working state and isn't an
// addressable thing.
function dbPathFor(userDataDir) {
  return sealedPathFor(userDataDir);
}

// --- Seal / unseal --------------------------------------------------------

// Encrypt the entire SQLite file (passed in as a Buffer) and persist
// atomically to `outPath`. Atomic = write to a sibling .tmp, then rename.
function sealFile(dek, plaintextBytes, outPath) {
  if (!Buffer.isBuffer(dek) || dek.length !== 32) {
    throw new TypeError("sealFile: dek must be a 32-byte Buffer");
  }
  if (!Buffer.isBuffer(plaintextBytes)) {
    throw new TypeError("sealFile: plaintextBytes must be a Buffer");
  }
  const iv = crypto.randomBytes(SEAL_IV_LEN);
  const cipher = crypto.createCipheriv("aes-256-gcm", dek, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintextBytes),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const wrapped = Buffer.concat([
    Buffer.from([SEAL_VERSION]),
    iv,
    ciphertext,
    tag,
  ]);
  const tmp = `${outPath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, wrapped, { mode: 0o600 });
  fs.renameSync(tmp, outPath);
}

// Reverse of sealFile. Throws with .code in {BAD_INPUT, BAD_VERSION,
// BAD_KEY_OR_CORRUPT}.
function unsealFile(dek, sealedPath) {
  if (!Buffer.isBuffer(dek) || dek.length !== 32) {
    throw new TypeError("unsealFile: dek must be a 32-byte Buffer");
  }
  const raw = fs.readFileSync(sealedPath);
  if (raw.length < SEAL_HEADER_LEN + SEAL_TAG_LEN) {
    const e = new Error("unsealFile: sealed file too short");
    e.code = "BAD_INPUT";
    throw e;
  }
  const version = raw[0];
  if (version !== SEAL_VERSION) {
    const e = new Error(
      `unsealFile: unknown seal version 0x${version.toString(16)}`
    );
    e.code = "BAD_VERSION";
    throw e;
  }
  const iv = raw.subarray(1, 1 + SEAL_IV_LEN);
  const tag = raw.subarray(raw.length - SEAL_TAG_LEN);
  const ciphertext = raw.subarray(
    SEAL_HEADER_LEN,
    raw.length - SEAL_TAG_LEN
  );
  const decipher = crypto.createDecipheriv("aes-256-gcm", dek, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    const e = new Error(
      "unsealFile: authentication failed (wrong key or corrupt file)"
    );
    e.code = "BAD_KEY_OR_CORRUPT";
    throw e;
  }
}

// --- Schema migrations ----------------------------------------------------

const MIGRATIONS = [
  {
    version: 1,
    up(db) {
      // The universal kv table. Schema version + lightweight scalars
      // (e.g., "vault_created_at") live here without needing a new
      // migration for each setting.
      db.exec(`
        CREATE TABLE _meta (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);
      const now = new Date().toISOString();
      const stmt = db.prepare("INSERT INTO _meta(key, value) VALUES (?, ?)");
      stmt.run("schema_version", "1");
      stmt.run("vault_created_at", now);
    },
  },
  {
    version: 2,
    up(db) {
      // Provider API keys (Anthropic, Groq, Apify). The `value` column
      // holds the actual key in plaintext inside the encrypted DB —
      // since the DB file is AES-GCM-wrapped at rest, that's the
      // intended storage. Only the main process ever reads `value`;
      // the renderer-facing IPC returns fingerprint + last4 only.
      //
      // `fingerprint` = first 8 hex chars of sha-256(value), for UX
      //                 disambiguation when a user rotates a key.
      // `last4`       = last 4 visible characters, also UX only.
      db.exec(`
        CREATE TABLE api_keys (
          provider     TEXT PRIMARY KEY,
          value        TEXT NOT NULL,
          fingerprint  TEXT NOT NULL,
          last4        TEXT NOT NULL,
          created_at   TEXT NOT NULL,
          updated_at   TEXT NOT NULL
        );
      `);
    },
  },
  {
    version: 3,
    up(db) {
      // Persistent runs table. Phase 2.6 introduced runs as an
      // in-memory registry; Phase 3 swaps the backing store for this
      // table so history survives lock/unlock and app restart.
      //
      // `status` is one of:
      //   starting | streaming | done | error | stopped
      // In-flight runs (`starting` / `streaming`) DO get persisted —
      // if the app is killed while a run is mid-stream we want to be
      // able to mark it `stopped` on the next unlock rather than
      // leaving phantom entries.
      //
      // `usage_json` is the raw Anthropic usage envelope (input_tokens,
      // output_tokens, cache_*). `payload_json` is the provider-specific
      // result body for Apify/Groq (rows, summary, filename). Kept as
      // TEXT/JSON so the schema is forward-compatible.
      db.exec(`
        CREATE TABLE runs (
          id            TEXT PRIMARY KEY,
          type          TEXT,
          route         TEXT,
          status        TEXT NOT NULL,
          model         TEXT,
          started_at    INTEGER NOT NULL,
          finished_at   INTEGER,
          output_length INTEGER DEFAULT 0,
          usage_json    TEXT,
          stop_reason   TEXT,
          error         TEXT,
          cost_usd      REAL DEFAULT 0,
          payload_json  TEXT
        );
        CREATE INDEX runs_started_at ON runs(started_at DESC);
        CREATE INDEX runs_status     ON runs(status);
      `);
    },
  },
];

function getSchemaVersion(db) {
  try {
    const row = db
      .prepare("SELECT value FROM _meta WHERE key = ?")
      .get("schema_version");
    return row ? parseInt(row.value, 10) : 0;
  } catch {
    return 0;
  }
}

function runMigrations(db) {
  const current = getSchemaVersion(db);
  let applied = 0;
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    db.transaction(() => {
      m.up(db);
      db.prepare(
        `INSERT INTO _meta(key, value) VALUES('schema_version', ?)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value`
      ).run(String(m.version));
    })();
    applied++;
  }
  return { from: current, to: getSchemaVersion(db), applied };
}

// --- Open / close --------------------------------------------------------

// Open the vault DB. If `vault.db.enc` exists, decrypt it to
// `vault.db` first (unless `vault.db` already exists from a prior
// crashed session — in which case the plaintext is the source of
// truth, we'll re-seal it on close). If neither exists and create:true,
// a fresh SQLite file is created.
//
// Returns the better-sqlite3 handle. Caller is responsible for calling
// closeAndSeal(handle, userDataDir, dek) on lock/quit.
function openDb(userDataDir, dek, { create = false } = {}) {
  if (!Buffer.isBuffer(dek) || dek.length !== 32) {
    throw new TypeError("openDb: dek must be a 32-byte Buffer");
  }
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }

  const sealedPath = sealedPathFor(userDataDir);
  const plainPath = plaintextPathFor(userDataDir);

  const sealedExists = fs.existsSync(sealedPath);
  const plainExists = fs.existsSync(plainPath);

  if (!sealedExists && !plainExists && !create) {
    const e = new Error("openDb: vault.db.enc does not exist");
    e.code = "ENOENT";
    throw e;
  }

  // If a sealed file exists and there's no plaintext working copy yet,
  // unseal it. If the plaintext IS already there (crashed prior
  // session), use it as-is — we'll re-seal on close, generating a
  // fresh `vault.db.enc` with the current contents.
  if (sealedExists && !plainExists) {
    const bytes = unsealFile(dek, sealedPath); // throws BAD_KEY_OR_CORRUPT on wrong dek
    fs.writeFileSync(plainPath, bytes, { mode: 0o600 });
  }
  // If !sealedExists and !plainExists and create:true → fall through;
  // better-sqlite3 will create the plaintext file on first write.

  const db = new Database(plainPath);
  try {
    runMigrations(db);
  } catch (e) {
    try {
      db.close();
    } catch {}
    throw e;
  }
  return db;
}

// Close the handle, then encrypt the plaintext file → vault.db.enc and
// remove the plaintext. Always succeeds-or-throws atomically: if the
// seal fails, the plaintext is preserved so the next open can recover.
function closeAndSeal(db, userDataDir, dek) {
  if (!Buffer.isBuffer(dek) || dek.length !== 32) {
    throw new TypeError("closeAndSeal: dek must be a 32-byte Buffer");
  }
  if (db) {
    try {
      db.close();
    } catch {}
  }
  const plain = plaintextPathFor(userDataDir);
  const sealed = sealedPathFor(userDataDir);
  if (!fs.existsSync(plain)) return; // nothing to seal — already clean

  const bytes = fs.readFileSync(plain);
  sealFile(dek, bytes, sealed);

  // Overwrite the plaintext bytes before unlinking. Best-effort hygiene
  // — SSD wear leveling means real recovery is still theoretically
  // possible, but for casual filesystem recovery tools this is a
  // meaningful step.
  try {
    const size = fs.statSync(plain).size;
    fs.writeFileSync(plain, Buffer.alloc(size, 0));
  } catch {}
  try {
    fs.unlinkSync(plain);
  } catch {}
}

// Close without sealing. Used by tests + by error paths where we don't
// have a valid DEK to seal with (or already sealed manually).
function closeDb(db) {
  if (!db) return;
  try {
    db.close();
  } catch {}
}

// Wipe both files. Used by `session.wipe(...)`.
function deleteAll(userDataDir) {
  for (const f of [
    plaintextPathFor(userDataDir),
    sealedPathFor(userDataDir),
  ]) {
    if (fs.existsSync(f)) {
      try {
        fs.unlinkSync(f);
      } catch {}
    }
  }
}

module.exports = {
  SEALED_FILENAME,
  PLAINTEXT_FILENAME,
  sealedPathFor,
  plaintextPathFor,
  dbPathFor,
  openDb,
  closeAndSeal,
  closeDb,
  deleteAll,
  runMigrations,
  getSchemaVersion,
  MIGRATIONS,
  // exported for tests
  sealFile,
  unsealFile,
};
