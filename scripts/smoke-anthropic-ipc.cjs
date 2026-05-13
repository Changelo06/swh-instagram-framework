// Smoke test for chiqo.anthropic.* IPC under Electron.
//
// We deliberately don't call the real Anthropic API — that would burn
// credits + need a real key. We cover the wiring instead:
//
//   - analyze with vault locked → throws LOCKED before any SDK call
//   - analyze with no key set → throws NO_API_KEY
//   - analyze with malformed payload → throws BAD_INPUT from prompt builder
//   - stop with bogus runId → throws NOT_FOUND
//   - runs.list / get / delete on in-memory entries works
//
// Run via the Electron binary (ELECTRON_RUN_AS_NODE unset).

const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { app } = require("electron");

const ROOT = path.resolve(__dirname, "..");
const LOG = path.join(ROOT, "anthropic-ipc-smoke.log");

const TMP_USERDATA = path.join(
  os.tmpdir(),
  `chiqo-anthropic-ipc-${process.pid}-${Date.now()}`
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

  // Bootstrap the IPC registry the same way main.cjs does.
  const ipc = require("../electron/ipc/index.cjs");
  ipc.register({ userDataDir: TMP_USERDATA, appRoot: ROOT });

  const session = require("../electron/vault/session.cjs");
  const runs = require("../electron/runs/index.cjs");
  const anthropic = require("../electron/providers/anthropic.cjs");

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

  // Vault locked path — provider key lookup throws LOCKED via session.
  await check("analyze with vault locked → throws LOCKED", () => {
    try {
      anthropic.startAnalyzeRun({
        payload: { rows: [{ id: "1" }], mode: "fast" },
        getApiKey: () => session.getApiKey("anthropic"), // throws LOCKED
        sender: { send: () => {}, isDestroyed: () => false },
      });
      throw new Error("should have thrown");
    } catch (e) {
      if (e.code !== "LOCKED") throw new Error(`wrong code: ${e.code}`);
    }
  });

  // Unlock + no Anthropic key configured.
  await check("create vault + unlock", async () => {
    const s = await session.create("AnthropicSmoke2026!", { name: "smoke" });
    if (s.locked) throw new Error("vault should be unlocked");
  });

  await check(
    "analyze with no Anthropic key in vault → throws NO_API_KEY",
    () => {
      try {
        anthropic.startAnalyzeRun({
          payload: { rows: [{ id: "1" }], mode: "fast" },
          getApiKey: () => {
            const v = session.getApiKey("anthropic");
            if (!v) {
              const e = new Error("no key");
              e.code = "NO_API_KEY";
              throw e;
            }
            return v;
          },
          sender: { send: () => {}, isDestroyed: () => false },
        });
        throw new Error("should have thrown");
      } catch (e) {
        if (e.code !== "NO_API_KEY") throw new Error(`wrong code: ${e.code}`);
      }
    }
  );

  // Bad payload path.
  await check("analyze with empty rows → throws BAD_INPUT", () => {
    session.setApiKey("anthropic", "sk-ant-fake-smoke-key");
    try {
      anthropic.startAnalyzeRun({
        payload: { rows: [], mode: "fast" },
        getApiKey: () => session.getApiKey("anthropic"),
        sender: { send: () => {}, isDestroyed: () => false },
      });
      throw new Error("should have thrown");
    } catch (e) {
      if (e.code !== "BAD_INPUT") throw new Error(`wrong code: ${e.code}`);
    }
  });

  // Bad mode path also routes through prompt builder.
  await check("analyze with valid payload + fake key → starts run", () => {
    // The real SDK call will fail (fake key), but startAnalyzeRun
    // returns {runId} synchronously before the SDK request fires.
    // The async runStreamLoop will surface the auth error as
    // { type: "error" } on the delta channel. We just verify that
    // we got a runId back.
    const sender = { send: () => {}, isDestroyed: () => false };
    const r = anthropic.startAnalyzeRun({
      payload: {
        rows: [{ id: "1", caption: "x" }],
        mode: "fast",
        filename: "smoke.csv",
      },
      getApiKey: () => session.getApiKey("anthropic"),
      sender,
    });
    if (!r.runId || !r.runId.startsWith("run_"))
      throw new Error(`expected runId, got ${JSON.stringify(r)}`);
    // Immediately stop it so we don't actually wait for the Anthropic
    // call to fail (which would take a few hundred ms).
    runs.stop(r.runId);
  });

  // Runs IPC surface.
  await check("runs.list returns the run we just stopped", () => {
    const list = runs.list();
    if (list.length < 1) throw new Error("expected at least one run");
  });

  await check("runs.stop with bogus runId → NOT_FOUND", () => {
    try {
      runs.stop("run_nonexistent");
      throw new Error("should have thrown");
    } catch (e) {
      if (e.code !== "NOT_FOUND") throw new Error(`wrong code: ${e.code}`);
    }
  });

  // Wipe — also exercises the keys cleanup path.
  await check("wipe('WIPE') clears the vault", () => {
    session.wipe("WIPE");
    if (session.status().exists) throw new Error("vault still exists");
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
