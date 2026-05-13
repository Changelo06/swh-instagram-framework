// Run lifecycle — in-memory for Phase 2.6, will get a DB-backed
// `runs` table in Phase 3.
//
// What's a "run"?
//   Every paid model call goes through here. We track its state, hold
//   an AbortController so it can be canceled mid-stream, accumulate
//   the streamed text, and broadcast delta / state / done / error
//   events to the renderer that initiated it.
//
// Event channel for a given run:
//   `chiqo.runs.delta.<runId>` — see preload.cjs's chiqo.runs.subscribe
//
// Payloads emitted on that channel:
//   { type: "state",  state: "starting" | "streaming" | "done" | "error" | "stopped" }
//   { type: "delta",  text: string }      // a chunk from the SDK stream
//   { type: "done",   stopReason, usage, model, durationMs }
//   { type: "error",  message, code? }
//
// Cancellation:
//   chiqo.anthropic.stop(runId) → runs.stop(runId)
//   We abort the AbortController; the SDK throws inside the await loop;
//   we emit { type: "state", state: "stopped" } and clean up.
//
// Single-window assumption: each run is broadcast back ONLY to the
// webContents that initiated it. If the renderer reloads, subsequent
// deltas will be sent to a dead webContents and silently dropped —
// acceptable for now; multi-window comes later.

const crypto = require("node:crypto");

const { logUsage } = require("./usage-log.cjs");

// Module-state map of in-flight + recently-completed runs.
// Key: runId. Value: { id, type, status, model, startedAt, finishedAt,
//                      accumulator, controller, sender, route }
const runs = new Map();

// Bound by main on boot — used for usage-log paths.
let _userDataDir = null;
function setUserDataDir(dir) {
  _userDataDir = dir;
}

function newRunId() {
  // 12 chars of url-safe randomness — enough to never collide in
  // practice, short enough to be human-readable in logs.
  return "run_" + crypto.randomBytes(8).toString("hex");
}

function deltaChannel(runId) {
  return `chiqo.runs.delta.${runId}`;
}

// Best-effort: only send if the webContents is still alive.
function sendTo(sender, channel, payload) {
  if (!sender || sender.isDestroyed?.()) return;
  try {
    sender.send(channel, payload);
  } catch {
    // The renderer's gone — drop silently. Run continues so we still
    // log usage / accumulate state.
  }
}

// Create the run record and emit the initial "starting" state. Does
// NOT do any model I/O — caller (providers/anthropic.cjs) drives the
// stream loop and feeds us via onDelta / onDone / onError.
function startRun({ type, route, sender, model, abortController }) {
  const id = newRunId();
  const startedAt = Date.now();
  const record = {
    id,
    type,
    route,
    sender, // webContents
    model: model || null,
    status: "starting",
    accumulator: "",
    startedAt,
    finishedAt: null,
    usage: null,
    stopReason: null,
    error: null,
    controller: abortController || null,
  };
  runs.set(id, record);
  sendTo(sender, deltaChannel(id), { type: "state", state: "starting" });
  return id;
}

function onStreaming(runId) {
  const r = runs.get(runId);
  if (!r) return;
  r.status = "streaming";
  sendTo(r.sender, deltaChannel(runId), { type: "state", state: "streaming" });
}

function onDelta(runId, text) {
  const r = runs.get(runId);
  if (!r) return;
  if (!text) return;
  r.accumulator += text;
  sendTo(r.sender, deltaChannel(runId), { type: "delta", text });
}

function onDone(runId, { usage, stopReason }) {
  const r = runs.get(runId);
  if (!r) return;
  r.status = "done";
  r.finishedAt = Date.now();
  r.usage = usage || null;
  r.stopReason = stopReason || null;
  const durationMs = r.finishedAt - r.startedAt;
  sendTo(r.sender, deltaChannel(runId), {
    type: "done",
    usage,
    stopReason,
    model: r.model,
    durationMs,
  });

  // Append usage row for the Account page (Phase 4) to read.
  logUsage({
    userDataDir: _userDataDir,
    runId,
    model: r.model,
    usage,
    route: r.route,
  });
}

function onError(runId, err) {
  const r = runs.get(runId);
  if (!r) return;
  // If the user aborted, classify as stopped rather than error.
  const aborted =
    err?.name === "AbortError" ||
    err?.message?.includes("aborted") ||
    err?.code === "ABORT_ERR";
  r.status = aborted ? "stopped" : "error";
  r.finishedAt = Date.now();
  r.error = err?.message || String(err);
  if (aborted) {
    sendTo(r.sender, deltaChannel(runId), {
      type: "state",
      state: "stopped",
    });
  } else {
    sendTo(r.sender, deltaChannel(runId), {
      type: "error",
      message: r.error,
      code: err?.code || null,
    });
  }
}

// Cancel a run. The provider call (which is awaiting the SDK stream)
// gets an AbortError on its next iteration; that bubbles through onError
// which classifies it as "stopped".
function stop(runId) {
  const r = runs.get(runId);
  if (!r) {
    const e = new Error(`runs.stop: unknown runId ${runId}`);
    e.code = "NOT_FOUND";
    throw e;
  }
  if (r.status !== "starting" && r.status !== "streaming") {
    return { stopped: false, reason: "run not in flight" };
  }
  try {
    r.controller?.abort();
  } catch {}
  return { stopped: true };
}

// Public-safe view (no `sender`, no `controller`).
function publicView(r) {
  return {
    id: r.id,
    type: r.type,
    status: r.status,
    model: r.model,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    usage: r.usage,
    stopReason: r.stopReason,
    error: r.error,
    outputLength: r.accumulator?.length || 0,
    route: r.route,
  };
}

function get(runId) {
  const r = runs.get(runId);
  if (!r) {
    const e = new Error(`runs.get: unknown runId ${runId}`);
    e.code = "NOT_FOUND";
    throw e;
  }
  return publicView(r);
}

function list() {
  const out = [];
  for (const r of runs.values()) out.push(publicView(r));
  // Most recent first.
  out.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
  return out;
}

// Drop a finished run from the in-memory map. Doesn't affect the
// usage-log row (that's persisted to disk).
function remove(runId) {
  const r = runs.get(runId);
  if (!r) {
    return { removed: false };
  }
  if (r.status === "starting" || r.status === "streaming") {
    const e = new Error(
      `runs.remove: cannot remove an in-flight run (${runId}). Stop it first.`
    );
    e.code = "IN_FLIGHT";
    throw e;
  }
  runs.delete(runId);
  return { removed: true };
}

// For tests / wipe — drop everything.
function __resetForTests() {
  for (const r of runs.values()) {
    try {
      r.controller?.abort();
    } catch {}
  }
  runs.clear();
  _userDataDir = null;
}

module.exports = {
  setUserDataDir,
  startRun,
  onStreaming,
  onDelta,
  onDone,
  onError,
  stop,
  get,
  list,
  remove,
  deltaChannel,
  __resetForTests,
  // For provider modules that need to peek at the raw record (e.g., to
  // grab the AbortController). NEVER expose this through IPC — it
  // contains the webContents reference.
  _internalGet: (runId) => runs.get(runId),
};
