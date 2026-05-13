// Tests for electron/vault/meta.cjs + electron/vault/db.cjs.
//
//   node electron/vault/db.test.cjs
//
// Uses only node:assert. Creates throwaway vaults in os.tmpdir() and
// cleans them up at the end. Slow tests (Argon2id derives) are
// deduplicated so the full suite finishes in ~3 seconds.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const crypto = require("./crypto.cjs");
const meta = require("./meta.cjs");
const db = require("./db.cjs");

let pass = 0;
let fail = 0;

async function test(name, fn) {
  try {
    await fn();
    process.stdout.write(`  \x1b[32m✓\x1b[0m ${name}\n`);
    pass++;
  } catch (e) {
    process.stdout.write(`  \x1b[31m✗\x1b[0m ${name}\n`);
    process.stdout.write(`      ${e.stack || e.message || e}\n`);
    fail++;
  }
}

// Each test gets its own throwaway userData dir.
function mkTmpDir() {
  const p = path.join(
    os.tmpdir(),
    `chiqo-vault-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  );
  fs.mkdirSync(p, { recursive: true });
  return p;
}

function rmTmpDir(p) {
  try {
    fs.rmSync(p, { recursive: true, force: true });
  } catch {}
}

// Helper: do a full "create vault" sequence and return everything
// useful for follow-up tests. Reuses one Argon2id derive to keep tests
// snappy.
async function makeVault({ userDataDir, password = "TestPassword2026!", name = "Test", hint = "" }) {
  const salt = crypto.randomSalt();
  const kek = await crypto.deriveKey(password, salt);
  const dek = crypto.randomDek();
  const wrapped = crypto.wrapDek(kek, dek);

  const metaObj = meta.buildMeta({
    name,
    hint,
    saltBuf: salt,
    wrappedDekBuf: wrapped,
    kdfParams: crypto.KDF_PARAMS_DEFAULT,
  });
  meta.write(userDataDir, metaObj);

  // Create + immediately seal so the only artifact on disk is the
  // encrypted vault.db.enc. Mirrors the production lifecycle.
  const conn = db.openDb(userDataDir, dek, { create: true });
  db.closeAndSeal(conn, userDataDir, dek);

  return { salt, kek, dek, wrapped, metaObj, password };
}

(async () => {
  console.log("\nelectron/vault/{meta,db}.cjs\n");

  // ──────────────────────────────────────────────────────────────────
  // meta.cjs
  // ──────────────────────────────────────────────────────────────────

  await test("meta: exists() returns false on empty dir", () => {
    const dir = mkTmpDir();
    try {
      assert.equal(meta.exists(dir), false);
    } finally {
      rmTmpDir(dir);
    }
  });

  await test("meta: buildMeta rejects bad inputs", () => {
    const goodSalt = Buffer.alloc(16);
    const goodWrapped = Buffer.alloc(61);
    const goodKdf = crypto.KDF_PARAMS_DEFAULT;
    assert.throws(() =>
      meta.buildMeta({ name: "x", hint: "", saltBuf: Buffer.alloc(15), wrappedDekBuf: goodWrapped, kdfParams: goodKdf })
    );
    assert.throws(() =>
      meta.buildMeta({ name: "x", hint: "", saltBuf: goodSalt, wrappedDekBuf: Buffer.alloc(60), kdfParams: goodKdf })
    );
  });

  await test("meta: write → read → equal", () => {
    const dir = mkTmpDir();
    try {
      const m = meta.buildMeta({
        name: "Mehdi",
        hint: "dog name",
        saltBuf: Buffer.alloc(16, 0xab),
        wrappedDekBuf: Buffer.alloc(61, 0xcd),
        kdfParams: crypto.KDF_PARAMS_DEFAULT,
      });
      meta.write(dir, m);
      assert.equal(meta.exists(dir), true);
      const back = meta.read(dir);
      assert.deepEqual(back, m);
    } finally {
      rmTmpDir(dir);
    }
  });

  await test("meta: file written with mode 0600", () => {
    if (process.platform === "win32") return; // POSIX-only assertion
    const dir = mkTmpDir();
    try {
      const m = meta.buildMeta({
        name: "x",
        hint: "",
        saltBuf: Buffer.alloc(16),
        wrappedDekBuf: Buffer.alloc(61),
        kdfParams: crypto.KDF_PARAMS_DEFAULT,
      });
      meta.write(dir, m);
      const mode = fs.statSync(meta.metaPathFor(dir)).mode & 0o777;
      assert.equal(mode, 0o600);
    } finally {
      rmTmpDir(dir);
    }
  });

  await test("meta: read rejects bogus JSON", () => {
    const dir = mkTmpDir();
    try {
      fs.writeFileSync(meta.metaPathFor(dir), "not json");
      assert.throws(() => meta.read(dir), (e) => e.code === "CORRUPT");
    } finally {
      rmTmpDir(dir);
    }
  });

  await test("meta: read rejects unknown version", () => {
    const dir = mkTmpDir();
    try {
      const m = meta.buildMeta({
        name: "x",
        hint: "",
        saltBuf: Buffer.alloc(16),
        wrappedDekBuf: Buffer.alloc(61),
        kdfParams: crypto.KDF_PARAMS_DEFAULT,
      });
      m.version = 99;
      fs.writeFileSync(meta.metaPathFor(dir), JSON.stringify(m));
      assert.throws(() => meta.read(dir), /unsupported version/);
    } finally {
      rmTmpDir(dir);
    }
  });

  await test("meta: publicView omits salt + wrappedDek + kdf details", () => {
    const m = meta.buildMeta({
      name: "Test",
      hint: "h",
      saltBuf: Buffer.alloc(16),
      wrappedDekBuf: Buffer.alloc(61),
      kdfParams: crypto.KDF_PARAMS_DEFAULT,
    });
    const pv = meta.publicView(m);
    assert.equal(pv.exists, true);
    assert.equal(pv.name, "Test");
    assert.equal(pv.hint, "h");
    assert.equal(pv.salt, undefined);
    assert.equal(pv.kdf, undefined);
    assert.equal(pv.wrappedDek, undefined);
  });

  await test("meta: getSaltBuf / getWrappedDekBuf / getKdfParams roundtrip", () => {
    const salt = crypto.randomSalt();
    const wrapped = crypto.randomBytes(61);
    const m = meta.buildMeta({
      name: "x",
      hint: "",
      saltBuf: salt,
      wrappedDekBuf: wrapped,
      kdfParams: crypto.KDF_PARAMS_DEFAULT,
    });
    assert.deepEqual(meta.getSaltBuf(m), salt);
    assert.deepEqual(meta.getWrappedDekBuf(m), wrapped);
    assert.deepEqual(meta.getKdfParams(m), crypto.KDF_PARAMS_DEFAULT);
  });

  // ──────────────────────────────────────────────────────────────────
  // db.cjs — single shared sealed vault to amortize the Argon2id cost.
  //
  // makeVault() creates + seals immediately, mirroring production. To
  // operate on the DB after that, callers re-open it via openDb, then
  // closeAndSeal when done.
  // ──────────────────────────────────────────────────────────────────

  const sharedDir = mkTmpDir();
  const sharedVault = await makeVault({ userDataDir: sharedDir, name: "Shared", hint: "" });

  await test("db: sealed file exists; plaintext does not (after seal)", () => {
    assert.ok(fs.existsSync(db.sealedPathFor(sharedDir)), "vault.db.enc should exist");
    assert.equal(
      fs.existsSync(db.plaintextPathFor(sharedDir)),
      false,
      "vault.db (plaintext) should be gone after seal"
    );
  });

  await test("db: openDb rejects wrong-length DEK", () => {
    assert.throws(() => db.openDb(sharedDir, Buffer.alloc(31)), TypeError);
    assert.throws(() => db.openDb(sharedDir, "not-a-buffer"), TypeError);
  });

  await test("db: openDb with right DEK unseals and exposes schema_version", () => {
    const conn = db.openDb(sharedDir, sharedVault.dek);
    try {
      assert.equal(db.getSchemaVersion(conn), 1);
    } finally {
      db.closeAndSeal(conn, sharedDir, sharedVault.dek);
    }
  });

  await test("db: openDb with wrong DEK throws BAD_KEY_OR_CORRUPT", () => {
    const wrong = crypto.randomDek();
    assert.throws(
      () => db.openDb(sharedDir, wrong),
      (e) => e.code === "BAD_KEY_OR_CORRUPT"
    );
  });

  await test("db: ENOENT when no sealed file exists and create:false", () => {
    const empty = mkTmpDir();
    try {
      const dek = crypto.randomDek();
      assert.throws(() => db.openDb(empty, dek), (e) => e.code === "ENOENT");
    } finally {
      rmTmpDir(empty);
    }
  });

  await test("db: migrations are idempotent across re-opens", () => {
    const conn = db.openDb(sharedDir, sharedVault.dek);
    try {
      const r = db.runMigrations(conn);
      assert.equal(r.applied, 0);
      assert.equal(r.from, 1);
      assert.equal(r.to, 1);
    } finally {
      db.closeAndSeal(conn, sharedDir, sharedVault.dek);
    }
  });

  await test("db: writes persist across unlock → seal → re-unlock", () => {
    const conn1 = db.openDb(sharedDir, sharedVault.dek);
    conn1.prepare("INSERT INTO _meta(key, value) VALUES (?, ?)")
      .run("test_value", "hello-from-test");
    db.closeAndSeal(conn1, sharedDir, sharedVault.dek);

    // No plaintext lingering after seal.
    assert.equal(fs.existsSync(db.plaintextPathFor(sharedDir)), false);

    const conn2 = db.openDb(sharedDir, sharedVault.dek);
    try {
      const row = conn2.prepare("SELECT value FROM _meta WHERE key = ?")
        .get("test_value");
      assert.equal(row.value, "hello-from-test");
    } finally {
      db.closeAndSeal(conn2, sharedDir, sharedVault.dek);
    }
  });

  await test("db: recovers from a crashed session (plaintext exists, no sealed file yet)", async () => {
    const dir = mkTmpDir();
    try {
      const v = await makeVault({ userDataDir: dir, name: "CrashRecovery" });
      // Simulate a crash: unseal manually, but never re-seal — leave the
      // plaintext on disk and remove the sealed file (mimicking a crash
      // that happened mid-write).
      const conn = db.openDb(dir, v.dek);
      conn.prepare("INSERT INTO _meta(key, value) VALUES (?, ?)")
        .run("survived", "yes");
      db.closeDb(conn); // close WITHOUT sealing
      fs.unlinkSync(db.sealedPathFor(dir)); // pretend the sealed file is gone

      // openDb should see the plaintext, use it as-is, and let us read.
      // (Note: with no sealed file AND a plaintext file, openDb needs
      // create:true OR it should still proceed — verify behavior.)
      assert.ok(fs.existsSync(db.plaintextPathFor(dir)));
      const conn2 = db.openDb(dir, v.dek, { create: true });
      try {
        const row = conn2.prepare("SELECT value FROM _meta WHERE key = ?")
          .get("survived");
        assert.equal(row.value, "yes");
      } finally {
        db.closeAndSeal(conn2, dir, v.dek);
      }
      // Now we have a fresh sealed file again.
      assert.ok(fs.existsSync(db.sealedPathFor(dir)));
      assert.equal(fs.existsSync(db.plaintextPathFor(dir)), false);
    } finally {
      rmTmpDir(dir);
    }
  });

  await test("db: sealFile + unsealFile roundtrip", () => {
    const dek = crypto.randomDek();
    const payload = Buffer.from("any binary content here — could be a sqlite file");
    const tmp = path.join(os.tmpdir(), `chiqo-seal-test-${Date.now()}.bin`);
    try {
      db.sealFile(dek, payload, tmp);
      const back = db.unsealFile(dek, tmp);
      assert.deepEqual(back, payload);
    } finally {
      try { fs.unlinkSync(tmp); } catch {}
    }
  });

  await test("db: unsealFile rejects wrong DEK with BAD_KEY_OR_CORRUPT", () => {
    const tmp = path.join(os.tmpdir(), `chiqo-seal-test-${Date.now()}.bin`);
    try {
      db.sealFile(crypto.randomDek(), Buffer.from("x"), tmp);
      assert.throws(
        () => db.unsealFile(crypto.randomDek(), tmp),
        (e) => e.code === "BAD_KEY_OR_CORRUPT"
      );
    } finally {
      try { fs.unlinkSync(tmp); } catch {}
    }
  });

  // ──────────────────────────────────────────────────────────────────
  // Acceptance tests from the doc — adapted to the file-level wrap
  // approach. The persisted artifact (vault.db.enc) is what an attacker
  // would find on disk; they should be unable to recover anything from
  // it without the DEK.
  // ──────────────────────────────────────────────────────────────────

  await test("ACCEPTANCE: bare SQLite cannot read vault.db.enc (it's not a SQLite file)", () => {
    const Database = require("better-sqlite3");
    const filePath = db.dbPathFor(sharedDir); // resolves to vault.db.enc
    assert.ok(fs.existsSync(filePath), "vault.db.enc should exist");
    assert.throws(
      () => {
        const bare = new Database(filePath);
        bare.prepare("SELECT count(*) FROM sqlite_master").get();
      },
      /file is not a database|unable to open|encrypted/i
    );
  });

  await test("ACCEPTANCE: secret strings written into the vault don't appear in vault.db.enc as plaintext", async () => {
    const dir = mkTmpDir();
    try {
      const password = "Burnable2026!";
      const salt = crypto.randomSalt();
      const kek = await crypto.deriveKey(password, salt);
      const dek = crypto.randomDek();
      const wrapped = crypto.wrapDek(kek, dek);
      meta.write(
        dir,
        meta.buildMeta({
          name: "leak-test",
          hint: "",
          saltBuf: salt,
          wrappedDekBuf: wrapped,
          kdfParams: crypto.KDF_PARAMS_DEFAULT,
        })
      );
      const SECRET_TOKEN = "sk-ant-this-secret-MUST-NOT-leak-9HZx";
      const conn = db.openDb(dir, dek, { create: true });
      conn.prepare("INSERT INTO _meta(key, value) VALUES (?, ?)")
        .run("api_key", SECRET_TOKEN);
      // Seal — the persisted artifact is vault.db.enc, NOT vault.db.
      db.closeAndSeal(conn, dir, dek);

      // The sealed file MUST NOT contain the plaintext.
      const rawSealed = fs.readFileSync(db.sealedPathFor(dir));
      assert.equal(
        rawSealed.toString("binary").includes(SECRET_TOKEN),
        false,
        "secret token leaked in cleartext inside vault.db.enc"
      );
      // The plaintext working file should also be gone.
      assert.equal(fs.existsSync(db.plaintextPathFor(dir)), false);
    } finally {
      rmTmpDir(dir);
    }
  });

  // ──────────────────────────────────────────────────────────────────
  // End-to-end: full create → lock → wrong-pw → unlock → use
  // ──────────────────────────────────────────────────────────────────

  await test("E2E: create vault → restart → wrong pw → right pw → data intact", async () => {
    const dir = mkTmpDir();
    try {
      const password = "E2EPassword2026!";
      const v = await makeVault({ userDataDir: dir, password, name: "E2E", hint: "test-hint" });

      // Pretend we're in a fresh process. The meta sidecar is what
      // the unlock UI uses to drive the screen.
      const stored = meta.read(dir);
      assert.equal(meta.publicView(stored).name, "E2E");
      assert.equal(meta.publicView(stored).hint, "test-hint");

      // Wrong password.
      const wrongKek = await crypto.deriveKey(
        "WRONG",
        meta.getSaltBuf(stored)
      );
      assert.throws(
        () => crypto.unwrapDek(wrongKek, meta.getWrappedDekBuf(stored)),
        (e) => e.code === "BAD_AUTH_TAG"
      );

      // Right password.
      const rightKek = await crypto.deriveKey(
        password,
        meta.getSaltBuf(stored)
      );
      const recoveredDek = crypto.unwrapDek(
        rightKek,
        meta.getWrappedDekBuf(stored)
      );
      assert.deepEqual(recoveredDek, v.dek);

      // The DEK opens the DB.
      const conn = db.openDb(dir, recoveredDek);
      try {
        assert.equal(db.getSchemaVersion(conn), 1);
      } finally {
        db.closeAndSeal(conn, dir, recoveredDek);
      }
    } finally {
      rmTmpDir(dir);
    }
  });

  // ──────────────────────────────────────────────────────────────────

  rmTmpDir(sharedDir);

  const total = pass + fail;
  const summary = `\n  ${pass}/${total} passed${fail ? `, ${fail} failed` : ""}\n`;
  if (fail === 0) {
    process.stdout.write(`\x1b[32m${summary}\x1b[0m`);
    process.exit(0);
  } else {
    process.stdout.write(`\x1b[31m${summary}\x1b[0m`);
    process.exit(1);
  }
})().catch((e) => {
  process.stderr.write(`\nrunner crashed: ${e.stack || e.message || e}\n`);
  process.exit(2);
});
