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
//   { type: "event",  event: string, payload: any } // named progress events
//                                          // (e.g. "queued", "progress",
//                                          // "warn" for Apify + Groq runs)
//   { type: "done",   stopReason, usage, model, durationMs, payload? }
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

const { logUsage, computeCostUsd } = require("./usage-log.cjs");
const store = require("./store.cjs");

// Module-state map of in-flight + recently-completed runs.
// Key: runId. Value: { id, type, status, model, startedAt, finishedAt,
//                      accumulator, controller, sender, route, donePayload }
//
// Phase 3 adds DB write-through: every state transition (start, done,
// error, stop) is mirrored into the `runs` table in the vault DB. When
// the vault is locked, DB persistence is silently skipped — the
// in-memory map is the only record of those runs until lock/unlock.
const runs = new Map();

// Bound by main on boot — used for usage-log paths.
let _userDataDir = null;
function setUserDataDir(dir) {
  _userDataDir = dir;
}

// Injection seam: a getter that returns the vault-DB better-sqlite3
// handle when the vault is unlocked, or null/throws otherwise. Wired by
// electron/ipc/index.cjs after both modules load. Kept as a getter
// (not a direct handle) so a lock/unlock cycle doesn't leave us holding
// a stale closed DB.
let _vaultDbGetter = null;
function setVaultDbGetter(fn) {
  _vaultDbGetter = fn;
}
function tryGetDb() {
  if (!_vaultDbGetter) return null;
  try {
    return _vaultDbGetter() || null;
  } catch {
    // LOCKED or any other failure — fall back to in-memory only.
    return null;
  }
}
function persist(record) {
  const db = tryGetDb();
  if (!db) return;
  try {
    store.upsertRun(db, record);
  } catch (e) {
    // Best-effort — never break a run because the persist failed.
    console.warn("[runs] persist failed:", e?.message || e);
  }
}

// Called from the session on unlock so any rows left mid-stream by a
// previous process get marked stopped. Safe to call repeatedly.
function reapInFlight() {
  const db = tryGetDb();
  if (!db) return { reaped: 0 };
  try {
    return store.reapInFlight(db);
  } catch (e) {
    console.warn("[runs] reapInFlight failed:", e?.message || e);
    return { reaped: 0 };
  }
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
    donePayload: null,
    controller: abortController || null,
  };
  runs.set(id, record);
  persist(record);
  sendTo(sender, deltaChannel(id), { type: "state", state: "starting" });
  return id;
}

function onStreaming(runId) {
  const r = runs.get(runId);
  if (!r) return;
  r.status = "streaming";
  persist(r);
  sendTo(r.sender, deltaChannel(runId), { type: "state", state: "streaming" });
}

function onDelta(runId, text) {
  const r = runs.get(runId);
  if (!r) return;
  if (!text) return;
  r.accumulator += text;
  sendTo(r.sender, deltaChannel(runId), { type: "delta", text });
}

// Named progress event — used by Apify (start / queued / progress / warn)
// and Groq (start / progress) to surface mid-run state changes that don't
// fit the text-delta model. The renderer's IPC adapter translates these
// to onEvent(event, payload) callbacks.
function onEvent(runId, event, payload) {
  const r = runs.get(runId);
  if (!r) return;
  sendTo(r.sender, deltaChannel(runId), {
    type: "event",
    event,
    payload: payload ?? null,
  });
}

// `payload` is an optional opaque result object that providers without a
// text-delta stream (Apify scrape, Groq transcribe) use to return their
// final rows + metadata to the renderer alongside the usual usage info.
function onDone(runId, { usage, stopReason, payload } = {}) {
  const r = runs.get(runId);
  if (!r) return;
  r.status = "done";
  r.finishedAt = Date.now();
  r.usage = usage || null;
  r.stopReason = stopReason || null;
  r.donePayload = payload || null;
  r.costUsd = computeCostUsd({ model: r.model, usage }) || 0;
  const durationMs = r.finishedAt - r.startedAt;
  sendTo(r.sender, deltaChannel(runId), {
    type: "done",
    usage,
    stopReason,
    model: r.model,
    durationMs,
    payload: payload ?? null,
  });

  // Append usage row for the Account page to read. JSONL log stays
  // around as a process-of-record alongside the DB — useful for
  // debugging cost regressions when the vault is locked.
  logUsage({
    userDataDir: _userDataDir,
    runId,
    model: r.model,
    usage,
    route: r.route,
  });
  persist(r);
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
  persist(r);
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

// Public-safe view (no `sender`, no `controller`). Accepts either an
// in-memory record or a hydrated row from the store.
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
    outputLength:
      r.outputLength != null
        ? r.outputLength
        : r.accumulator?.length || 0,
    route: r.route,
    costUsd: r.costUsd || 0,
  };
}

function get(runId) {
  // In-memory wins for in-flight state (it has the live accumulator).
  const mem = runs.get(runId);
  if (mem) return publicView(mem);
  const db = tryGetDb();
  if (db) {
    const fromDb = store.getRun(db, runId);
    if (fromDb) return publicView(fromDb);
  }
  const e = new Error(`runs.get: unknown runId ${runId}`);
  e.code = "NOT_FOUND";
  throw e;
}

function list(filter = {}) {
  const merged = new Map();
  // DB rows first — historical baseline.
  const db = tryGetDb();
  if (db) {
    try {
      for (const r of store.listRuns(db, filter)) merged.set(r.id, r);
    } catch (e) {
      console.warn("[runs] DB list failed, falling back:", e?.message || e);
    }
  }
  // In-memory wins for any id where it has fresher state (live deltas
  // for in-flight runs, plus any run started while the vault was
  // locked).
  for (const r of runs.values()) merged.set(r.id, r);
  const out = [];
  for (const r of merged.values()) out.push(publicView(r));
  out.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
  return out;
}

// Drop a finished run from BOTH the in-memory map and the DB. In-flight
// rejects so callers stop it first.
function remove(runId) {
  const mem = runs.get(runId);
  if (mem && (mem.status === "starting" || mem.status === "streaming")) {
    const e = new Error(
      `runs.remove: cannot remove an in-flight run (${runId}). Stop it first.`
    );
    e.code = "IN_FLIGHT";
    throw e;
  }
  let removed = false;
  if (mem) {
    runs.delete(runId);
    removed = true;
  }
  const db = tryGetDb();
  if (db) {
    try {
      const r = store.deleteRun(db, runId);
      if (r.deleted) removed = true;
    } catch (e) {
      console.warn("[runs] DB delete failed:", e?.message || e);
    }
  }
  return { removed };
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
  setVaultDbGetter,
  reapInFlight,
  startRun,
  onStreaming,
  onDelta,
  onEvent,
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
