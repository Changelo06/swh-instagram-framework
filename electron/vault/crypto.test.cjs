// Standalone tests for electron/vault/crypto.cjs.
//
// Run: node electron/vault/crypto.test.cjs
//
// Uses only node:assert + the module under test. No test framework
// dependency. Exits non-zero on any failure.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const {
  KEY_LEN,
  SALT_LEN,
  IV_LEN,
  TAG_LEN,
  WRAPPED_LEN,
  VERSION,
  KDF_PARAMS_DEFAULT,
  deriveKey,
  wrapDek,
  unwrapDek,
  randomBytes,
  randomSalt,
  randomDek,
  zeroize,
} = require("./crypto.cjs");

let pass = 0;
let fail = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    process.stdout.write(`  \x1b[32m✓\x1b[0m ${name}\n`);
    pass++;
  } catch (e) {
    process.stdout.write(`  \x1b[31m✗\x1b[0m ${name}\n`);
    process.stdout.write(`      ${e.stack || e.message || e}\n`);
    failures.push({ name, error: e });
    fail++;
  }
}

(async () => {
  console.log("\nelectron/vault/crypto.cjs\n");

  // --- Sanity on exported constants ---------------------------------------

  await test("constants are the right sizes", () => {
    assert.equal(KEY_LEN, 32);
    assert.equal(SALT_LEN, 16);
    assert.equal(IV_LEN, 12);
    assert.equal(TAG_LEN, 16);
    assert.equal(WRAPPED_LEN, 1 + IV_LEN + KEY_LEN + TAG_LEN);
    assert.equal(VERSION, 0x01);
  });

  await test("KDF defaults are tuned for desktop vault (≥ OWASP 2023 baseline)", () => {
    // Memory cost ≥ 19 MiB and iteration count ≥ 2 are the OWASP minimums;
    // we ship higher. parallelism=1 is required by Argon2id when caller
    // can't guarantee a thread pool.
    assert.ok(
      KDF_PARAMS_DEFAULT.memorySize >= 19456,
      `memorySize ${KDF_PARAMS_DEFAULT.memorySize} below OWASP minimum`
    );
    assert.ok(
      KDF_PARAMS_DEFAULT.iterations >= 2,
      `iterations ${KDF_PARAMS_DEFAULT.iterations} below OWASP minimum`
    );
    assert.equal(KDF_PARAMS_DEFAULT.parallelism, 1);
    assert.equal(KDF_PARAMS_DEFAULT.hashLength, KEY_LEN);
  });

  // --- randomSalt / randomDek / randomBytes -------------------------------

  await test("randomSalt is 16 bytes and unique", () => {
    const s1 = randomSalt();
    const s2 = randomSalt();
    assert.ok(Buffer.isBuffer(s1));
    assert.equal(s1.length, SALT_LEN);
    assert.notDeepEqual(s1, s2); // overwhelmingly likely
  });

  await test("randomDek is 32 bytes and unique", () => {
    const d1 = randomDek();
    const d2 = randomDek();
    assert.ok(Buffer.isBuffer(d1));
    assert.equal(d1.length, KEY_LEN);
    assert.notDeepEqual(d1, d2);
  });

  await test("randomBytes rejects bad arguments", () => {
    assert.throws(() => randomBytes(0));
    assert.throws(() => randomBytes(-1));
    assert.throws(() => randomBytes(1.5));
    assert.throws(() => randomBytes("16"));
  });

  // --- deriveKey ----------------------------------------------------------

  await test("deriveKey returns a 32-byte Buffer", async () => {
    const key = await deriveKey("hunter2", randomSalt());
    assert.ok(Buffer.isBuffer(key));
    assert.equal(key.length, KEY_LEN);
  });

  await test("deriveKey is deterministic for same password+salt", async () => {
    const salt = randomSalt();
    const k1 = await deriveKey("hunter2", salt);
    const k2 = await deriveKey("hunter2", salt);
    assert.deepEqual(k1, k2);
  });

  await test("deriveKey diverges on different password", async () => {
    const salt = randomSalt();
    const k1 = await deriveKey("hunter2", salt);
    const k2 = await deriveKey("hunter3", salt);
    assert.notDeepEqual(k1, k2);
  });

  await test("deriveKey diverges on different salt", async () => {
    const k1 = await deriveKey("hunter2", randomSalt());
    const k2 = await deriveKey("hunter2", randomSalt());
    assert.notDeepEqual(k1, k2);
  });

  await test("deriveKey rejects empty password", async () => {
    await assert.rejects(
      () => deriveKey("", randomSalt()),
      /must be a non-empty string/
    );
  });

  await test("deriveKey rejects non-string password", async () => {
    await assert.rejects(() => deriveKey(123, randomSalt()), TypeError);
    await assert.rejects(() => deriveKey(null, randomSalt()), TypeError);
  });

  await test("deriveKey rejects wrong-length salt", async () => {
    await assert.rejects(
      () => deriveKey("x", Buffer.alloc(15)),
      /must be a 16-byte Buffer/
    );
    await assert.rejects(() => deriveKey("x", Buffer.alloc(17)), TypeError);
  });

  await test("deriveKey rejects non-Buffer salt", async () => {
    await assert.rejects(() => deriveKey("x", "16-char-string!!"), TypeError);
  });

  // --- wrapDek / unwrapDek roundtrip --------------------------------------

  // Derive once and reuse — Argon2id is expensive, no need to do it per-test.
  const KEK = await deriveKey("master-password-for-tests", randomSalt());

  await test("wrap produces 61-byte output", () => {
    const w = wrapDek(KEK, randomDek());
    assert.equal(w.length, WRAPPED_LEN);
    assert.equal(w[0], VERSION);
  });

  await test("wrap/unwrap roundtrip recovers the DEK", () => {
    const dek = randomDek();
    const wrapped = wrapDek(KEK, dek);
    const unwrapped = unwrapDek(KEK, wrapped);
    assert.deepEqual(unwrapped, dek);
  });

  await test("wrap produces different output each call (random IV)", () => {
    const dek = randomDek();
    const w1 = wrapDek(KEK, dek);
    const w2 = wrapDek(KEK, dek);
    assert.notDeepEqual(w1, w2);
    // But both unwrap to the same DEK.
    assert.deepEqual(unwrapDek(KEK, w1), dek);
    assert.deepEqual(unwrapDek(KEK, w2), dek);
  });

  await test("unwrap with wrong KEK fails with BAD_AUTH_TAG", async () => {
    const wrongKek = await deriveKey("different-password", randomSalt());
    const wrapped = wrapDek(KEK, randomDek());
    assert.throws(
      () => unwrapDek(wrongKek, wrapped),
      (e) => e.code === "BAD_AUTH_TAG"
    );
  });

  await test("unwrap on tampered ciphertext fails with BAD_AUTH_TAG", () => {
    const wrapped = wrapDek(KEK, randomDek());
    wrapped[1 + IV_LEN + 4] ^= 0x01; // flip one bit in the middle of ciphertext
    assert.throws(
      () => unwrapDek(KEK, wrapped),
      (e) => e.code === "BAD_AUTH_TAG"
    );
  });

  await test("unwrap on tampered tag fails with BAD_AUTH_TAG", () => {
    const wrapped = wrapDek(KEK, randomDek());
    wrapped[wrapped.length - 1] ^= 0x01; // flip a bit in the auth tag
    assert.throws(
      () => unwrapDek(KEK, wrapped),
      (e) => e.code === "BAD_AUTH_TAG"
    );
  });

  await test("unwrap on tampered IV fails with BAD_AUTH_TAG", () => {
    const wrapped = wrapDek(KEK, randomDek());
    wrapped[1] ^= 0x01;
    assert.throws(
      () => unwrapDek(KEK, wrapped),
      (e) => e.code === "BAD_AUTH_TAG"
    );
  });

  await test("unwrap rejects truncated buffer with BAD_INPUT", () => {
    assert.throws(
      () => unwrapDek(KEK, Buffer.alloc(10)),
      (e) => e.code === "BAD_INPUT"
    );
  });

  await test("unwrap rejects oversize buffer with BAD_INPUT", () => {
    assert.throws(
      () => unwrapDek(KEK, Buffer.alloc(200)),
      (e) => e.code === "BAD_INPUT"
    );
  });

  await test("unwrap rejects unknown version with BAD_VERSION", () => {
    const wrapped = wrapDek(KEK, randomDek());
    wrapped[0] = 0xff;
    assert.throws(
      () => unwrapDek(KEK, wrapped),
      (e) => e.code === "BAD_VERSION"
    );
  });

  await test("unwrap rejects non-Buffer wrapped input", () => {
    assert.throws(() => unwrapDek(KEK, "not-a-buffer"));
    assert.throws(() => unwrapDek(KEK, null));
  });

  await test("unwrap rejects wrong-length KEK", () => {
    assert.throws(
      () => unwrapDek(Buffer.alloc(31), Buffer.alloc(WRAPPED_LEN)),
      TypeError
    );
  });

  await test("wrap rejects wrong-length KEK / DEK", () => {
    assert.throws(() => wrapDek(Buffer.alloc(31), randomDek()), TypeError);
    assert.throws(() => wrapDek(KEK, Buffer.alloc(31)), TypeError);
  });

  // --- zeroize ------------------------------------------------------------

  await test("zeroize fills a Buffer with zeros", () => {
    const buf = randomDek();
    assert.ok(buf.some((b) => b !== 0)); // sanity: not already all-zero
    zeroize(buf);
    assert.ok(buf.every((b) => b === 0));
    assert.equal(buf.length, KEY_LEN); // length preserved
  });

  await test("zeroize is a no-op on non-Buffer / empty", () => {
    // Just verifying we don't throw on these.
    zeroize(null);
    zeroize(undefined);
    zeroize("string");
    zeroize(Buffer.alloc(0));
  });

  // --- End-to-end vault unlock scenario -----------------------------------

  await test("full vault scenario: create → close → reopen → wrong-pw → right-pw", async () => {
    // Simulate vault creation.
    const password = "ChiqoTestPass#2026";
    const salt = randomSalt();
    const kek = await deriveKey(password, salt);
    const dek = randomDek();
    const wrappedDek = wrapDek(kek, dek);

    // Persist `salt` + `wrappedDek` (to disk in reality). Zero the
    // in-memory KEK; the DEK would also be zeroized after handoff to
    // SQLCipher.
    const persistedSalt = Buffer.from(salt);
    const persistedWrapped = Buffer.from(wrappedDek);
    zeroize(kek);
    zeroize(dek);

    // ─── App restarted ───

    // Wrong password attempt.
    const wrongKek = await deriveKey("nope", persistedSalt);
    assert.throws(
      () => unwrapDek(wrongKek, persistedWrapped),
      (e) => e.code === "BAD_AUTH_TAG"
    );
    zeroize(wrongKek);

    // Right password recovers the DEK.
    const recoveredKek = await deriveKey(password, persistedSalt);
    const recoveredDek = unwrapDek(recoveredKek, persistedWrapped);
    assert.equal(recoveredDek.length, KEY_LEN);
    assert.notDeepEqual(recoveredDek, Buffer.alloc(KEY_LEN)); // not all-zero
  });

  // --- Done ---------------------------------------------------------------

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
