// Renderer-side helper for the Anthropic streaming IPC path.
//
// Replaces the old `fetch("/api/analyze") + SSE parsing` flow with the
// vault-gated main-process route exposed by electron/preload.cjs:
//   chiqo.anthropic.analyze(payload)         -> { runId }
//   chiqo.runs.subscribe(runId, callback)    -> unsubscribe
//   chiqo.anthropic.stop(runId)              -> { stopped: true }
//
// The callback shape (`onDelta`, `onDone`, `onError`) mirrors the SSE
// callbacks `streamAnalyze` in CsvContext already uses, so the call sites
// barely change.
//
// Why this lives next to chiqo.js but in its own module: chiqo.js is the
// thin "is the bridge there" wrapper for plain request/response IPC.
// Streaming has its own lifecycle (subscribe → events → unsubscribe), and
// a couple of edge cases (renderer disposes before runId returns, run
// finishes before subscribe attaches) are worth handling once here
// instead of repeating at every caller.

function bridge() {
  if (typeof window === "undefined" || !window.chiqo) return null;
  return window.chiqo;
}

export function hasAnthropicBridge() {
  const c = bridge();
  return !!(c && c.anthropic && c.runs);
}

// Kick off an analyze run via IPC and translate the streamed events into
// the same `{onDelta, onDone, onError}` callback shape the rest of the
// app already speaks.
//
// Returns `{ runId, abort }` synchronously-ish (the IPC `analyze` call is
// a promise, but it resolves in a single tick — well before any deltas
// arrive). `abort()` requests cancellation via `chiqo.anthropic.stop`;
// the renderer will see a `state:stopped` event which we translate to
// `onError({ aborted: true })` to match the AbortController flow.
export async function streamAnalyzeViaIpc(payload, callbacks = {}) {
  const { onDelta, onDone, onError } = callbacks;
  const c = bridge();
  if (!c || !c.anthropic || !c.runs) {
    const e = new Error(
      "chiqo.ai bridge unavailable — open this in the chiqo.ai desktop app."
    );
    e.code = "NO_BRIDGE";
    throw e;
  }

  let unsubscribe = null;
  let settled = false;

  // Guard against double-delivery (e.g. error + state:stopped racing) and
  // make sure we always tear down the IPC listener.
  const finish = () => {
    settled = true;
    if (unsubscribe) {
      try { unsubscribe(); } catch { /* renderer disposed */ }
      unsubscribe = null;
    }
  };

  const handler = (event) => {
    if (settled || !event || typeof event !== "object") return;
    switch (event.type) {
      case "delta":
        if (event.text) onDelta?.(event.text);
        return;
      case "done":
        finish();
        onDone?.({
          usage: event.usage || null,
          stopReason: event.stopReason || null,
          model: event.model || null,
          durationMs: event.durationMs || null,
        });
        return;
      case "error":
        finish();
        onError?.({ message: event.message || "stream error", code: event.code });
        return;
      case "state":
        // The terminal `state:stopped` is the cancellation signal — the
        // SDK call was aborted by `chiqo.anthropic.stop(runId)`. Surface
        // it the same way an AbortController would.
        if (event.state === "stopped") {
          finish();
          onError?.({ aborted: true });
        }
        // "starting" / "streaming" are progress-only — ignored here.
        return;
      default:
        // Unknown event — ignore. Forward-compat with future event types.
        return;
    }
  };

  // Order matters: kick off the run first to get a runId, then attach
  // the subscriber. If we attached first there would be no channel to
  // attach to. We accept a tiny risk that the very first delta lands
  // between `analyze()` resolving and `subscribe()` attaching — in
  // practice the SDK call adds ~50ms of latency before the first chunk,
  // far more than the IPC round-trip window, so this races safely.
  let result;
  try {
    result = await c.anthropic.analyze(payload);
  } catch (e) {
    // Pre-stream failure (BAD_INPUT, NO_API_KEY, LOCKED, etc.). Surface
    // through onError instead of throwing so call sites don't need a
    // try/catch around the helper.
    onError?.({ message: e.message || String(e), code: e.code });
    return { runId: null, abort: () => {} };
  }

  const { runId } = result || {};
  if (!runId) {
    onError?.({ message: "anthropic.analyze returned no runId" });
    return { runId: null, abort: () => {} };
  }

  unsubscribe = c.runs.subscribe(runId, handler);

  const abort = () => {
    if (settled) return;
    // Don't tear down `unsubscribe` here — let the `state:stopped` event
    // do it so onError({aborted:true}) gets to fire. The main-side stop
    // call resolves immediately; the SDK abort propagates async.
    c.anthropic.stop(runId).catch(() => {
      // If stop itself fails (run already finished, runId expired) we
      // just leave the subscriber to handle whatever terminal event the
      // run produced. No need to surface this to the caller.
    });
  };

  return { runId, abort };
}
