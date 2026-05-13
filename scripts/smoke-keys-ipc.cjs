// Smoke test for Phase 2.5 — drives chiqo.keys.* through the same
// session module the IPC handlers call into. Verifies the full
// create-vault → set-key → list → get → delete flow.
//
// Run via the Electron binary (with ELECTRON_RUN_AS_NODE unset) so we
// pick up the real main-process module set.

const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { app } = require("electron");

const ROOT = path.resolve(__dirname, "..");
const LOG = path.join(ROOT, "keys-ipc-smoke.log");

const TMP_USERDATA = path.join(
  os.tmpdir(),
  `chiqo-keys-ipc-${process.pid}-${Date.now()}`
);
app.setPath("userData", TMP_USERDATA);

function out(line) {
  fs.appendFileSync(LOG, line + "\n");
}

(async () => {
  try { fs.unlinkSync(LOG); } catch {}

  await app.whenReady();
  out(`smoke @ ${new Date().toISOString()}`);
  out(`userData: ${TMP_USERDATA}`);

  const ipc = require("../electron/ipc/index.cjs");
  ipc.register({ userDataDir: TMP_USERDATA, appRoot: ROOT });

  const session = require("../electron/vault/session.cjs");

  let pass = 0;
  let fail = 0;
  async function check(label, fn) {
    try {
      await fn();
      out(`✓ ${label}`);
      pass++;
    } catch (e) {
      out(`✗ ${label}: ${e.stack || e.message || e}`);
      fail++;
    }
  }

  await check("listApiKeys before vault exists → throws LOCKED", () => {
    try {
      session.listApiKeys();
      throw new Error("should have thrown");
    } catch (e) {
      if (e.code !== "LOCKED") throw new Error(`wrong code: ${e.code}`);
    }
  });

  await check("create vault → unlocked", async () => {
    const s = await session.create("KeysSmoke2026!", { name: "smoke" });
    if (s.locked) throw new Error("vault should be unlocked after create");
  });

  await check("listApiKeys returns [] on fresh vault", () => {
    const list = session.listApiKeys();
    if (list.length !== 0) throw new Error(`got ${list.length}`);
  });

  await check("setApiKey anthropic", () => {
    const r = session.setApiKey("anthropic", "sk-ant-smokeTest_ABCDEF1234");
    if (r.provider !== "anthropic") throw new Error(`bad provider`);
    if (r.last4 !== "1234") throw new Error(`bad last4: ${r.last4}`);
    if (r.looksValid !== true) throw new Error("should look valid");
  });

  await check("setApiKey groq", () => {
    const r = session.setApiKey("groq", "gsk_smokeTest_WXYZ");
    if (r.last4 !== "WXYZ") throw new Error(`bad last4: ${r.last4}`);
  });

  await check("setApiKey rejects unknown provider", () => {
    try {
      session.setApiKey("openai", "anything");
      throw new Error("should have thrown");
    } catch (e) {
      if (e.code !== "BAD_PROVIDER") throw new Error(`wrong code: ${e.code}`);
    }
  });

  await check("listApiKeys returns the 2 stored, sorted", () => {
    const list = session.listApiKeys();
    if (list.length !== 2) throw new Error(`got ${list.length}`);
    if (list[0].provider !== "anthropic") throw new Error(`wrong order`);
    // Defense-in-depth: value never appears in list rows.
    if ("value" in list[0]) throw new Error("value leaked into listApiKeys!");
  });

  await check("getApiKey returns the plaintext (main-only)", () => {
    const v = session.getApiKey("anthropic");
    if (v !== "sk-ant-smokeTest_ABCDEF1234")
      throw new Error(`got ${v}`);
  });

  await check("keys survive lock/unlock", async () => {
    session.lock();
    if (session.isUnlocked()) throw new Error("still unlocked");
    await session.unlock("KeysSmoke2026!");
    if (session.listApiKeys().length !== 2)
      throw new Error("keys lost");
    if (session.getApiKey("anthropic") !== "sk-ant-smokeTest_ABCDEF1234")
      throw new Error("anthropic value lost");
  });

  await check("deleteApiKey removes the row", () => {
    const r = session.deleteApiKey("groq");
    if (r.deleted !== true) throw new Error("not deleted");
    if (session.listApiKeys().length !== 1) throw new Error("count wrong");
    if (session.getApiKey("groq") !== null)
      throw new Error("getApiKey should return null after delete");
  });

  await check("looksValid:false when format is unexpected (still saved)", () => {
    const r = session.setApiKey("apify", "definitely-not-an-apify-token");
    if (r.looksValid !== false) throw new Error("should NOT look valid");
    if (session.getApiKey("apify") !== "definitely-not-an-apify-token")
      throw new Error("not stored");
  });

  out("");
  out(`${pass}/${pass + fail} passed${fail ? `, ${fail} failed` : ""}`);
  out(fail === 0 ? "VERDICT: PASS" : "VERDICT: FAIL");

  try {
    fs.rmSync(TMP_USERDATA, { recursive: true, force: true });
  } catch {}

  app.quit();
})().catch((e) => {
  out(`runner crashed: ${e.stack || e.message || e}`);
  out("VERDICT: FAIL");
  app.quit();
});
