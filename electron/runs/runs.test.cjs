// Tests for electron/runs/index.cjs + electron/runs/usage-log.cjs +
// electron/providers/prompt.cjs. Runs under Electron's bundled Node
// via scripts/test-vault.cjs.
//
// We do NOT call the real Anthropic SDK here. The streaming flow is
// covered in scripts/smoke-anthropic-ipc.cjs which exercises the IPC
// path with a fake key (and proves the wiring without burning real
// credits). The unit tests in this file focus on:
//
//   - Run lifecycle (start → streaming → done) emits the right events
//   - Cancellation (stop) classifies as "stopped", not "error"
//   - Errored runs surface { type: 'error', message }
//   - Usage log writes the right JSONL row + the right cost
//   - Prompt builder produces stable text shapes per mode

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const runs = require("./index.cjs");
const usageLog = require("./usage-log.cjs");
const prompt = require("../providers/prompt.cjs");

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

// Fake webContents that records every send(channel, payload) call.
function mockSender() {
  const sent = [];
  return {
    sent,
    isDestroyed: () => false,
    send: (channel, payload) => sent.push({ channel, payload }),
  };
}

(async () => {
  console.log("\nelectron/runs/* + electron/providers/prompt.cjs\n");

  // ──────────────────────────────────────────────────────────────────
  // usage-log
  // ──────────────────────────────────────────────────────────────────

  await test("computeCostUsd — sonnet 4.6 sample math", () => {
    const cost = usageLog.computeCostUsd({
      model: "claude-sonnet-4-6",
      usage: {
        input_tokens: 12345,
        output_tokens: 678,
        cache_read_input_tokens: 4000,
        cache_creation_input_tokens: 0,
      },
    });
    // 12345 * $3 + 678 * $15 + 4000 * $0.30 = 37035 + 10170 + 1200
    // = 48405 per million tokens → 0.048405 USD
    assert.equal(cost, 0.048405);
  });

  await test("computeCostUsd — opus 4.7 sample math", () => {
    const cost = usageLog.computeCostUsd({
      model: "claude-opus-4-7",
      usage: { input_tokens: 1000, output_tokens: 1000 },
    });
    // 1000 * $15 + 1000 * $75 = 90000 / 1M = $0.09
    assert.equal(cost, 0.09);
  });

  await test("computeCostUsd — unknown model → 0", () => {
    const cost = usageLog.computeCostUsd({
      model: "gpt-9000",
      usage: { input_tokens: 999999, output_tokens: 999999 },
    });
    assert.equal(cost, 0);
  });

  await test("logUsage — writes a row to userData/logs/usage.jsonl", () => {
    const dir = path.join(
      os.tmpdir(),
      `chiqo-usage-test-${process.pid}-${Date.now()}`
    );
    try {
      usageLog.logUsage({
        userDataDir: dir,
        runId: "run_test",
        model: "claude-sonnet-4-6",
        usage: { input_tokens: 100, output_tokens: 50 },
        route: "test",
      });
      const logPath = usageLog.usageLogPath(dir);
      assert.ok(fs.existsSync(logPath));
      const raw = fs.readFileSync(logPath, "utf8").trim();
      const row = JSON.parse(raw);
      assert.equal(row.runId, "run_test");
      assert.equal(row.model, "claude-sonnet-4-6");
      assert.equal(row.inputTokens, 100);
      assert.equal(row.outputTokens, 50);
      assert.ok(row.costUsd > 0);
      assert.ok(row.ts);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  // ──────────────────────────────────────────────────────────────────
  // runs lifecycle
  // ──────────────────────────────────────────────────────────────────

  await test("startRun → emits 'starting' state on the right channel", () => {
    runs.__resetForTests();
    const sender = mockSender();
    const ctrl = new AbortController();
    const runId = runs.startRun({
      type: "analyze-fast",
      route: "test",
      sender,
      model: "claude-sonnet-4-6",
      abortController: ctrl,
    });
    assert.ok(runId.startsWith("run_"));
    const channel = runs.deltaChannel(runId);
    assert.equal(sender.sent.length, 1);
    assert.equal(sender.sent[0].channel, channel);
    assert.deepEqual(sender.sent[0].payload, {
      type: "state",
      state: "starting",
    });
    const view = runs.get(runId);
    assert.equal(view.status, "starting");
    assert.equal(view.model, "claude-sonnet-4-6");
  });

  await test("onDelta accumulates + broadcasts each chunk", () => {
    runs.__resetForTests();
    const sender = mockSender();
    const runId = runs.startRun({
      type: "x",
      route: "t",
      sender,
      model: "m",
      abortController: new AbortController(),
    });
    runs.onDelta(runId, "hello ");
    runs.onDelta(runId, "world");
    // 1 state event + 2 delta events
    assert.equal(sender.sent.length, 3);
    assert.deepEqual(sender.sent[1].payload, {
      type: "delta",
      text: "hello ",
    });
    assert.deepEqual(sender.sent[2].payload, {
      type: "delta",
      text: "world",
    });
    assert.equal(runs._internalGet(runId).accumulator, "hello world");
  });

  await test("onDone emits done payload + sets status:done", () => {
    runs.__resetForTests();
    const sender = mockSender();
    const runId = runs.startRun({
      type: "x",
      route: "t",
      sender,
      model: "claude-sonnet-4-6",
      abortController: new AbortController(),
    });
    runs.onStreaming(runId);
    runs.onDelta(runId, "ok");
    runs.onDone(runId, {
      usage: { input_tokens: 10, output_tokens: 5 },
      stopReason: "end_turn",
    });
    const last = sender.sent[sender.sent.length - 1];
    assert.equal(last.payload.type, "done");
    assert.equal(last.payload.stopReason, "end_turn");
    assert.equal(last.payload.usage.input_tokens, 10);
    assert.equal(runs.get(runId).status, "done");
    assert.ok(runs.get(runId).finishedAt);
  });

  await test("onError — AbortError classifies as 'stopped', not 'error'", () => {
    runs.__resetForTests();
    const sender = mockSender();
    const runId = runs.startRun({
      type: "x",
      route: "t",
      sender,
      model: "m",
      abortController: new AbortController(),
    });
    const err = new Error("aborted");
    err.name = "AbortError";
    runs.onError(runId, err);
    assert.equal(runs.get(runId).status, "stopped");
    const last = sender.sent[sender.sent.length - 1];
    assert.deepEqual(last.payload, { type: "state", state: "stopped" });
  });

  await test("onError — non-abort classifies as 'error' + sends error payload", () => {
    runs.__resetForTests();
    const sender = mockSender();
    const runId = runs.startRun({
      type: "x",
      route: "t",
      sender,
      model: "m",
      abortController: new AbortController(),
    });
    runs.onError(runId, Object.assign(new Error("network down"), { code: "ENET" }));
    assert.equal(runs.get(runId).status, "error");
    const last = sender.sent[sender.sent.length - 1];
    assert.equal(last.payload.type, "error");
    assert.equal(last.payload.message, "network down");
    assert.equal(last.payload.code, "ENET");
  });

  await test("stop — aborts the controller + returns { stopped:true }", () => {
    runs.__resetForTests();
    const sender = mockSender();
    const ctrl = new AbortController();
    const runId = runs.startRun({
      type: "x",
      route: "t",
      sender,
      model: "m",
      abortController: ctrl,
    });
    assert.equal(ctrl.signal.aborted, false);
    const r = runs.stop(runId);
    assert.equal(r.stopped, true);
    assert.equal(ctrl.signal.aborted, true);
  });

  await test("stop — unknown runId throws NOT_FOUND", () => {
    runs.__resetForTests();
    assert.throws(
      () => runs.stop("run_nope"),
      (e) => e.code === "NOT_FOUND"
    );
  });

  await test("stop — already finished run returns { stopped:false }", () => {
    runs.__resetForTests();
    const sender = mockSender();
    const runId = runs.startRun({
      type: "x",
      route: "t",
      sender,
      model: "m",
      abortController: new AbortController(),
    });
    runs.onDone(runId, { usage: {}, stopReason: "end_turn" });
    const r = runs.stop(runId);
    assert.equal(r.stopped, false);
  });

  await test("list — most recent first", () => {
    runs.__resetForTests();
    const a = runs.startRun({
      type: "x",
      route: "t",
      sender: mockSender(),
      model: "m",
      abortController: new AbortController(),
    });
    // Force a measurable gap.
    const before = Date.now();
    while (Date.now() - before < 2) {}
    const b = runs.startRun({
      type: "y",
      route: "t",
      sender: mockSender(),
      model: "m",
      abortController: new AbortController(),
    });
    const list = runs.list();
    assert.equal(list[0].id, b);
    assert.equal(list[1].id, a);
  });

  await test("remove — in-flight run throws IN_FLIGHT", () => {
    runs.__resetForTests();
    const runId = runs.startRun({
      type: "x",
      route: "t",
      sender: mockSender(),
      model: "m",
      abortController: new AbortController(),
    });
    assert.throws(
      () => runs.remove(runId),
      (e) => e.code === "IN_FLIGHT"
    );
  });

  await test("remove — finished run is removed", () => {
    runs.__resetForTests();
    const runId = runs.startRun({
      type: "x",
      route: "t",
      sender: mockSender(),
      model: "m",
      abortController: new AbortController(),
    });
    runs.onDone(runId, { usage: {}, stopReason: "end_turn" });
    assert.equal(runs.remove(runId).removed, true);
    assert.throws(() => runs.get(runId), (e) => e.code === "NOT_FOUND");
  });

  await test("destroyed sender — sends are dropped silently, run continues", () => {
    runs.__resetForTests();
    const dead = {
      isDestroyed: () => true,
      send: () => {
        throw new Error("should not be called");
      },
    };
    const runId = runs.startRun({
      type: "x",
      route: "t",
      sender: dead,
      model: "m",
      abortController: new AbortController(),
    });
    runs.onDelta(runId, "ok");
    runs.onDone(runId, { usage: {}, stopReason: "end_turn" });
    assert.equal(runs.get(runId).status, "done");
  });

  // ──────────────────────────────────────────────────────────────────
  // prompt builder
  // ──────────────────────────────────────────────────────────────────

  await test("buildPrompt('fast') — 4 layers, ~4500 max tokens", () => {
    const r = prompt.buildPrompt({
      rows: [{ id: "1", caption: "x", videoViewCount: 100 }],
      mode: "fast",
      filename: "test.csv",
    });
    assert.equal(r.label, "analyze-fast");
    assert.equal(r.maxTokens, 4500);
    assert.ok(r.userMessage.includes("## Overview"));
    assert.ok(r.userMessage.includes("Layer 1: Performance Snapshot"));
    assert.ok(r.userMessage.includes("Layer 4: Next Moves"));
    assert.equal(r.userMessage.includes("Layer 5:"), false);
  });

  await test("buildPrompt('full') — 6 layers, 32000 max tokens", () => {
    const r = prompt.buildPrompt({
      rows: [{ id: "1" }],
      mode: "full",
      filename: "test.csv",
    });
    assert.equal(r.label, "analyze-deep");
    assert.equal(r.maxTokens, 32000);
    assert.ok(r.userMessage.includes("Layer 5: Follower-Base Dynamics"));
    assert.ok(r.userMessage.includes("Layer 6: Strategic Moves"));
  });

  await test("buildPrompt('reel-blueprint') — uses first row as source", () => {
    const r = prompt.buildPrompt({
      rows: [{ id: "1", url: "https://x", caption: "src reel" }],
      mode: "reel-blueprint",
      scriptCount: 4,
      filename: "ref.csv",
    });
    assert.equal(r.label, "script-variation");
    assert.equal(r.maxTokens, 16000);
    assert.equal(r.scriptCount, 4);
    assert.ok(r.userMessage.includes("Produce exactly 4 script variations"));
    assert.ok(r.userMessage.includes("## Script N: <short, vivid title>"));
  });

  await test("buildPrompt('reel-blueprint') — clamps scriptCount to [1,5]", () => {
    const lo = prompt.buildPrompt({
      rows: [{ id: "1" }],
      mode: "reel-blueprint",
      scriptCount: 0,
    });
    assert.equal(lo.scriptCount, 1);
    assert.ok(lo.userMessage.includes("Produce exactly 1 script variation."));
    const hi = prompt.buildPrompt({
      rows: [{ id: "1" }],
      mode: "reel-blueprint",
      scriptCount: 99,
    });
    assert.equal(hi.scriptCount, 5);
    assert.ok(hi.userMessage.includes("Produce exactly 5 script variations"));
  });

  await test("buildPrompt — rejects empty rows", () => {
    assert.throws(
      () => prompt.buildPrompt({ rows: [], mode: "fast" }),
      (e) => e.code === "BAD_INPUT"
    );
    assert.throws(
      () => prompt.buildPrompt({ rows: null, mode: "fast" }),
      (e) => e.code === "BAD_INPUT"
    );
  });

  await test("prepRowsForClaude — strips _audioUrl + unifies transcript", () => {
    const rows = [
      {
        id: "1",
        "reel-transcript": "real text",
        _audioUrl: "https://cdn/audio",
        _audioSourceField: "videoUrl",
      },
      {
        id: "2",
        transcript: "legacy text",
      },
    ];
    const prepped = prompt.prepRowsForClaude(rows);
    assert.equal(prepped[0].transcript, "real text");
    assert.equal(prepped[0]._audioUrl, undefined);
    assert.equal(prepped[0]._audioSourceField, undefined);
    assert.equal(prepped[1].transcript, "legacy text");
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
