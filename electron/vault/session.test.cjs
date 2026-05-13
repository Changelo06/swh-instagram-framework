// Tests for electron/vault/session.cjs.
//
//   node electron/vault/session.test.cjs
//
// The session module is a stateful main-process singleton; we reset it
// via __resetForTests() between cases and point it at a throwaway
// userData dir per test.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const session = require("./session.cjs");
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

function freshDir() {
  const p = path.join(
    os.tmpdir(),
    `chiqo-session-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  );
  fs.mkdirSync(p, { recursive: true });
  return p;
}

function rmDir(p) {
  try {
    fs.rmSync(p, { recursive: true, force: true });
  } catch {}
}

(async () => {
  console.log("\nelectron/vault/session.cjs\n");

  await test("status: exists:false on a fresh dir", async () => {
    const dir = freshDir();
    try {
      session.__resetForTests();
      session.setUserDataDir(dir);
      const s = session.status();
      assert.equal(s.exists, false);
      assert.equal(s.locked, true);
    } finally {
      rmDir(dir);
    }
  });

  await test("create: builds vault, leaves session unlocked", async () => {
    const dir = freshDir();
    try {
      session.__resetForTests();
      session.setUserDataDir(dir);
      const s = await session.create("CreatePw2026!", {
        name: "test",
        hint: "h",
      });
      assert.equal(s.exists, true);
      assert.equal(s.locked, false);
      assert.equal(s.name, "test");
      assert.equal(s.hint, "h");
      assert.ok(session.isUnlocked());
      assert.ok(fs.existsSync(meta.metaPathFor(dir)));
      // After create() we're still unlocked — the plaintext working
      // file exists; the sealed vault.db.enc only appears on lock().
      assert.ok(fs.existsSync(db.plaintextPathFor(dir)));
      assert.equal(fs.existsSync(db.sealedPathFor(dir)), false);

      // Now lock and verify the seal/unseal lifecycle is right.
      session.lock();
      assert.equal(fs.existsSync(db.plaintextPathFor(dir)), false);
      assert.ok(fs.existsSync(db.sealedPathFor(dir)));
    } finally {
      session.__resetForTests();
      rmDir(dir);
    }
  });

  await test("create: rejects creating a second vault in the same dir", async () => {
    const dir = freshDir();
    try {
      session.__resetForTests();
      session.setUserDataDir(dir);
      await session.create("first", {});
      session.lock();
      await assert.rejects(
        () => session.create("second", {}),
        (e) => e.code === "ALREADY_EXISTS"
      );
    } finally {
      session.__resetForTests();
      rmDir(dir);
    }
  });

  await test("lock: clears state, sets status to locked", async () => {
    const dir = freshDir();
    try {
      session.__resetForTests();
      session.setUserDataDir(dir);
      await session.create("pw", {});
      session.lock();
      assert.equal(session.isUnlocked(), false);
      assert.equal(session.status().locked, true);
    } finally {
      session.__resetForTests();
      rmDir(dir);
    }
  });

  await test("unlock: wrong password → BAD_PASSWORD", async () => {
    const dir = freshDir();
    try {
      session.__resetForTests();
      session.setUserDataDir(dir);
      await session.create("right", {});
      session.lock();
      await assert.rejects(
        () => session.unlock("wrong"),
        (e) => e.code === "BAD_PASSWORD"
      );
      assert.equal(session.isUnlocked(), false);
    } finally {
      session.__resetForTests();
      rmDir(dir);
    }
  });

  await test("unlock: right password reopens the DB", async () => {
    const dir = freshDir();
    try {
      session.__resetForTests();
      session.setUserDataDir(dir);
      await session.create("PW#2026", {});
      session.lock();
      const s = await session.unlock("PW#2026");
      assert.equal(s.locked, false);
      assert.ok(session.isUnlocked());
      // We can issue a query through the session's handle.
      const conn = session.getDb();
      const row = conn.prepare("SELECT value FROM _meta WHERE key=?").get("schema_version");
      assert.equal(row.value, "1");
    } finally {
      session.__resetForTests();
      rmDir(dir);
    }
  });

  await test("unlock: no vault → NO_VAULT", async () => {
    const dir = freshDir();
    try {
      session.__resetForTests();
      session.setUserDataDir(dir);
      await assert.rejects(
        () => session.unlock("anything"),
        (e) => e.code === "NO_VAULT"
      );
    } finally {
      rmDir(dir);
    }
  });

  await test("unlock: when already unlocked → idempotent", async () => {
    const dir = freshDir();
    try {
      session.__resetForTests();
      session.setUserDataDir(dir);
      await session.create("pw", {});
      const s = await session.unlock("anything-ignored-because-already-unlocked");
      assert.equal(s.locked, false);
    } finally {
      session.__resetForTests();
      rmDir(dir);
    }
  });

  await test("getHint works without unlock", async () => {
    const dir = freshDir();
    try {
      session.__resetForTests();
      session.setUserDataDir(dir);
      await session.create("pw", { hint: "look in the journal" });
      session.lock();
      const hint = session.getHint();
      assert.equal(hint, "look in the journal");
    } finally {
      session.__resetForTests();
      rmDir(dir);
    }
  });

  await test("setHint requires unlock", async () => {
    const dir = freshDir();
    try {
      session.__resetForTests();
      session.setUserDataDir(dir);
      await session.create("pw", {});
      session.lock();
      assert.throws(() => session.setHint("new"), (e) => e.code === "LOCKED");

      await session.unlock("pw");
      const s = session.setHint("new");
      assert.equal(s.hint, "new");
      assert.equal(session.getHint(), "new");
    } finally {
      session.__resetForTests();
      rmDir(dir);
    }
  });

  await test("changePassword: wrong old pw → BAD_PASSWORD", async () => {
    const dir = freshDir();
    try {
      session.__resetForTests();
      session.setUserDataDir(dir);
      await session.create("old", {});
      await assert.rejects(
        () => session.changePassword("WRONG", "new"),
        (e) => e.code === "BAD_PASSWORD"
      );
    } finally {
      session.__resetForTests();
      rmDir(dir);
    }
  });

  await test("changePassword: rotates the key, DB stays accessible", async () => {
    const dir = freshDir();
    try {
      session.__resetForTests();
      session.setUserDataDir(dir);
      await session.create("OldPw#1", {});
      // Drop a marker so we can confirm the DB content survives.
      session
        .getDb()
        .prepare("INSERT INTO _meta(key, value) VALUES (?, ?)")
        .run("marker", "before-rotate");

      await session.changePassword("OldPw#1", "NewPw#2");
      session.lock();

      // Old password no longer works.
      await assert.rejects(
        () => session.unlock("OldPw#1"),
        (e) => e.code === "BAD_PASSWORD"
      );

      // New password works AND the marker is intact.
      await session.unlock("NewPw#2");
      const row = session.getDb()
        .prepare("SELECT value FROM _meta WHERE key=?")
        .get("marker");
      assert.equal(row.value, "before-rotate");
    } finally {
      session.__resetForTests();
      rmDir(dir);
    }
  });

  await test("wipe: requires the typed 'WIPE' confirm", async () => {
    const dir = freshDir();
    try {
      session.__resetForTests();
      session.setUserDataDir(dir);
      await session.create("pw", {});
      assert.throws(() => session.wipe("wipe"), (e) => e.code === "BAD_CONFIRM");
      assert.throws(() => session.wipe(""), (e) => e.code === "BAD_CONFIRM");
      assert.ok(fs.existsSync(meta.metaPathFor(dir)));
    } finally {
      session.__resetForTests();
      rmDir(dir);
    }
  });

  await test("wipe: deletes both meta + db, status returns exists:false", async () => {
    const dir = freshDir();
    try {
      session.__resetForTests();
      session.setUserDataDir(dir);
      await session.create("pw", {});
      session.wipe("WIPE");
      assert.equal(fs.existsSync(meta.metaPathFor(dir)), false);
      assert.equal(fs.existsSync(db.dbPathFor(dir)), false);
      assert.equal(session.status().exists, false);
      assert.equal(session.isUnlocked(), false);
    } finally {
      session.__resetForTests();
      rmDir(dir);
    }
  });

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
