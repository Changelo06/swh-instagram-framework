// Tests for electron/vault/keys.cjs and the session-level keys
// passthroughs. Runs under Electron's bundled Node via scripts/test-
// vault.cjs.
//
// What we cover:
//   - listKeys / setKey / deleteKey / getKey roundtrips
//   - getKey returns null for missing providers
//   - listKeys never exposes `value`
//   - fingerprint stays stable across re-set with the same key
//   - replace preserves createdAt, advances updatedAt
//   - validateProvider rejects unknown names
//   - validateValue rejects empty/whitespace
//   - session-level wrappers throw LOCKED when vault is locked

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const crypto = require("./crypto.cjs");
const meta = require("./meta.cjs");
const db = require("./db.cjs");
const keys = require("./keys.cjs");
const session = require("./session.cjs");

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
    `chiqo-keys-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  );
  fs.mkdirSync(p, { recursive: true });
  return p;
}

function rmDir(p) {
  try {
    fs.rmSync(p, { recursive: true, force: true });
  } catch {}
}

// Stand up a real encrypted vault DB, run keys ops against it, then
// tear it down. Returns the open DB handle + a teardown fn.
async function withOpenVault(fn) {
  const dir = freshDir();
  const password = "KeysTest2026!";
  const salt = crypto.randomSalt();
  const kek = await crypto.deriveKey(password, salt);
  const dek = crypto.randomDek();
  const wrapped = crypto.wrapDek(kek, dek);
  meta.write(
    dir,
    meta.buildMeta({
      name: "keys-test",
      hint: "",
      saltBuf: salt,
      wrappedDekBuf: wrapped,
      kdfParams: crypto.KDF_PARAMS_DEFAULT,
    })
  );
  const conn = db.openDb(dir, dek, { create: true });
  try {
    await fn(conn);
  } finally {
    db.closeAndSeal(conn, dir, dek);
    rmDir(dir);
  }
}

(async () => {
  console.log("\nelectron/vault/keys.cjs\n");

  // ──────────────────────────────────────────────────────────────────
  // Pure validators (no DB)
  // ──────────────────────────────────────────────────────────────────

  await test("validateProvider accepts the 3 known providers", () => {
    keys.validateProvider("anthropic");
    keys.validateProvider("groq");
    keys.validateProvider("apify");
  });

  await test("validateProvider rejects unknown providers", () => {
    assert.throws(
      () => keys.validateProvider("openai"),
      (e) => e.code === "BAD_PROVIDER"
    );
    assert.throws(
      () => keys.validateProvider(""),
      (e) => e.code === "BAD_PROVIDER"
    );
  });

  await test("validateValue trims whitespace and rejects empty", () => {
    assert.equal(keys.validateValue("  sk-ant-test123  "), "sk-ant-test123");
    assert.throws(() => keys.validateValue(""), (e) => e.code === "BAD_INPUT");
    assert.throws(
      () => keys.validateValue("   "),
      (e) => e.code === "BAD_INPUT"
    );
  });

  await test("validateValue rejects values with embedded whitespace", () => {
    assert.throws(
      () => keys.validateValue("sk-ant abc"),
      (e) => e.code === "BAD_INPUT"
    );
    assert.throws(
      () => keys.validateValue("sk\nant"),
      (e) => e.code === "BAD_INPUT"
    );
  });

  await test("validateValue rejects non-strings", () => {
    assert.throws(() => keys.validateValue(123), TypeError);
    assert.throws(() => keys.validateValue(null), TypeError);
  });

  await test("fingerprintOf is deterministic + 8 hex chars", () => {
    const a = keys.fingerprintOf("sk-ant-aaa");
    const b = keys.fingerprintOf("sk-ant-aaa");
    const c = keys.fingerprintOf("sk-ant-bbb");
    assert.equal(a, b);
    assert.notEqual(a, c);
    assert.match(a, /^[0-9a-f]{8}$/);
  });

  await test("last4Of returns the trailing 4 chars", () => {
    assert.equal(keys.last4Of("sk-ant-abcdef"), "cdef");
    assert.equal(keys.last4Of("xyz"), "xyz");
  });

  await test("looksLikeKnownFormat matches expected prefixes", () => {
    assert.equal(keys.looksLikeKnownFormat("anthropic", "sk-ant-xx"), true);
    assert.equal(keys.looksLikeKnownFormat("anthropic", "wrong-xx"), false);
    assert.equal(keys.looksLikeKnownFormat("groq", "gsk_test"), true);
    assert.equal(keys.looksLikeKnownFormat("groq", "foo"), false);
    assert.equal(keys.looksLikeKnownFormat("apify", "apify_api_x"), true);
  });

  // ──────────────────────────────────────────────────────────────────
  // DB-backed operations
  // ──────────────────────────────────────────────────────────────────

  await test("listKeys is empty on a fresh vault", () => {
    return withOpenVault(async (conn) => {
      assert.deepEqual(keys.listKeys(conn), []);
    });
  });

  await test("setKey + listKeys roundtrip (no value in list)", () => {
    return withOpenVault(async (conn) => {
      keys.setKey(conn, "anthropic", "sk-ant-test123XYZ");
      const all = keys.listKeys(conn);
      assert.equal(all.length, 1);
      assert.equal(all[0].provider, "anthropic");
      assert.equal(all[0].last4, "3XYZ"); // last 4 of "sk-ant-test123XYZ"
      assert.match(all[0].fingerprint, /^[0-9a-f]{8}$/);
      // value MUST NOT appear in the row.
      assert.equal("value" in all[0], false);
    });
  });

  await test("setKey is upsert (replacing the same provider preserves created_at)", () => {
    return withOpenVault(async (conn) => {
      const a = keys.setKey(conn, "groq", "gsk_first_key");
      // wait briefly so updated_at would differ if it advances
      await new Promise((r) => setTimeout(r, 10));
      const b = keys.setKey(conn, "groq", "gsk_replacement_key");
      assert.equal(a.provider, b.provider);
      assert.equal(a.createdAt, b.createdAt);
      assert.notEqual(a.updatedAt, b.updatedAt);
      assert.notEqual(a.fingerprint, b.fingerprint);
    });
  });

  await test("getKey returns the stored value (main-process-only path)", () => {
    return withOpenVault(async (conn) => {
      keys.setKey(conn, "apify", "apify_api_secret_value_xyz");
      assert.equal(
        keys.getKey(conn, "apify"),
        "apify_api_secret_value_xyz"
      );
      assert.equal(keys.getKey(conn, "groq"), null);
    });
  });

  await test("listKeys is sorted by provider", () => {
    return withOpenVault(async (conn) => {
      keys.setKey(conn, "groq", "gsk_x");
      keys.setKey(conn, "apify", "apify_api_y");
      keys.setKey(conn, "anthropic", "sk-ant-z");
      const all = keys.listKeys(conn);
      assert.deepEqual(
        all.map((r) => r.provider),
        ["anthropic", "apify", "groq"]
      );
    });
  });

  await test("deleteKey removes the row + reports changes:true", () => {
    return withOpenVault(async (conn) => {
      keys.setKey(conn, "anthropic", "sk-ant-test");
      assert.equal(keys.deleteKey(conn, "anthropic").deleted, true);
      assert.deepEqual(keys.listKeys(conn), []);
      assert.equal(keys.getKey(conn, "anthropic"), null);
    });
  });

  await test("deleteKey on a missing provider reports deleted:false", () => {
    return withOpenVault(async (conn) => {
      assert.equal(keys.deleteKey(conn, "anthropic").deleted, false);
    });
  });

  await test("setKey trims whitespace from the value", () => {
    return withOpenVault(async (conn) => {
      keys.setKey(conn, "anthropic", "  sk-ant-padded  ");
      assert.equal(keys.getKey(conn, "anthropic"), "sk-ant-padded");
    });
  });

  await test("setKey rejects unknown provider with BAD_PROVIDER", () => {
    return withOpenVault(async (conn) => {
      assert.throws(
        () => keys.setKey(conn, "openai", "sk-anything"),
        (e) => e.code === "BAD_PROVIDER"
      );
    });
  });

  await test("setKey reports looksValid flag based on prefix", () => {
    return withOpenVault(async (conn) => {
      const ok = keys.setKey(conn, "anthropic", "sk-ant-realformat");
      assert.equal(ok.looksValid, true);
      const odd = keys.setKey(conn, "anthropic", "weird-format-but-accepted");
      // Stored despite the prefix mismatch — we never reject on shape.
      assert.equal(odd.looksValid, false);
      assert.equal(
        keys.getKey(conn, "anthropic"),
        "weird-format-but-accepted"
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // Session-level gating: keys ops require an unlocked vault
  // ──────────────────────────────────────────────────────────────────

  await test("session.listApiKeys: throws LOCKED when vault is locked", () => {
    const dir = freshDir();
    try {
      session.__resetForTests();
      session.setUserDataDir(dir);
      assert.throws(
        () => session.listApiKeys(),
        (e) => e.code === "LOCKED"
      );
    } finally {
      rmDir(dir);
    }
  });

  await test("session.setApiKey: throws LOCKED when vault is locked", () => {
    const dir = freshDir();
    try {
      session.__resetForTests();
      session.setUserDataDir(dir);
      assert.throws(
        () => session.setApiKey("anthropic", "sk-ant-x"),
        (e) => e.code === "LOCKED"
      );
    } finally {
      rmDir(dir);
    }
  });

  await test("session: full flow — create → setApiKey → listApiKeys → getApiKey → delete", async () => {
    const dir = freshDir();
    try {
      session.__resetForTests();
      session.setUserDataDir(dir);
      await session.create("pw-for-keys-flow", { name: "test" });

      session.setApiKey("anthropic", "sk-ant-flow-test-ABCD");
      session.setApiKey("groq", "gsk_flow_test_WXYZ");

      const list = session.listApiKeys();
      assert.equal(list.length, 2);
      assert.equal(list[0].provider, "anthropic");
      assert.equal(list[0].last4, "ABCD");
      assert.equal(list[1].provider, "groq");
      assert.equal(list[1].last4, "WXYZ");

      // Main-process-only path: real value comes back.
      assert.equal(session.getApiKey("anthropic"), "sk-ant-flow-test-ABCD");

      session.deleteApiKey("groq");
      assert.equal(session.listApiKeys().length, 1);
      assert.equal(session.getApiKey("groq"), null);
    } finally {
      session.__resetForTests();
      rmDir(dir);
    }
  });

  await test("session: keys survive lock/unlock cycle", async () => {
    const dir = freshDir();
    try {
      session.__resetForTests();
      session.setUserDataDir(dir);
      await session.create("survive-pw", {});
      session.setApiKey("apify", "apify_api_persistent_VALUE");

      session.lock();
      assert.equal(session.isUnlocked(), false);

      await session.unlock("survive-pw");
      const list = session.listApiKeys();
      assert.equal(list.length, 1);
      assert.equal(list[0].provider, "apify");
      assert.equal(session.getApiKey("apify"), "apify_api_persistent_VALUE");
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
