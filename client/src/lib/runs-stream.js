// Generalized renderer-side helper for any IPC-streamed run.
//
// Used by analyze (Anthropic deltas), transcribe (Groq progress events),
// and scrape (Apify progress + chained transcribe progress events). All
// three share the same lifecycle envelope:
//
//   start(payload) -> { runId }    // synchronous typed error on failure
//   chiqo.runs.subscribe(runId, ...) -> unsubscribe
//   chiqo.<provider>.stop(runId)
//
// The renderer doesn't care which provider is on the other side. It
// hands us a `start` thunk + a `stop` thunk + the same
// `{onDelta, onEvent, onDone, onError}` callback bag that the old SSE
// helper already spoke. We translate the IPC event types
// (state / delta / event / done / error) back into those callbacks and
// return `{runId, abort}`.

function bridge() {
  if (typeof window === "undefined" || !window.chiqo) return null;
  return window.chiqo;
}

export function hasRunsBridge() {
  const c = bridge();
  return !!(c && c.runs);
}

// Drive a single IPC streamed run.
//
//   start: () => Promise<{ runId }>      — provider-specific call
//   stop:  (runId) => Promise<any>       — provider-specific stop
//   callbacks: {
//     onDelta?(text)            — Anthropic streaming text chunks
//     onEvent?(name, payload)   — Apify / Groq named progress events
//     onDone?({ payload, usage, stopReason, model, durationMs })
//     onError?({ message, code, aborted })
//   }
//
// Returns `{ runId, abort }`. `abort()` is idempotent — calling it after
// a terminal event is a no-op.
export async function streamRun({ start, stop, callbacks = {} }) {
  const { onDelta, onEvent, onDone, onError } = callbacks;
  const c = bridge();
  if (!c || !c.runs) {
    const e = new Error(
      "chiqo.ai bridge unavailable — open this in the chiqo.ai desktop app."
    );
    e.code = "NO_BRIDGE";
    throw e;
  }

  let unsubscribe = null;
  let settled = false;

  const finish = () => {
    settled = true;
    if (unsubscribe) {
      try { unsubscribe(); } catch { /* renderer disposed */ }
      unsubscribe = null;
    }
  };

  const handler = (evt) => {
    if (settled || !evt || typeof evt !== "object") return;
    switch (evt.type) {
      case "delta":
        if (evt.text) onDelta?.(evt.text);
        return;
      case "event":
        onEvent?.(evt.event, evt.payload || {});
        return;
      case "done":
        finish();
        onDone?.({
          payload: evt.payload || null,
          usage: evt.usage || null,
          stopReason: evt.stopReason || null,
          model: evt.model || null,
          durationMs: evt.durationMs || null,
        });
        return;
      case "error":
        finish();
        onError?.({
          message: evt.message || "stream error",
          code: evt.code || null,
        });
        return;
      case "state":
        // Terminal `state:stopped` is the cancellation signal — translate
        // to onError({aborted:true}) so the existing AbortController flow
        // in CsvContext keeps working unchanged.
        if (evt.state === "stopped") {
          finish();
          onError?.({ aborted: true });
        }
        // "starting" / "streaming" → progress-only, ignored.
        return;
      default:
        // Unknown event type — forward-compat ignore.
        return;
    }
  };

  // Kick the run first to get a runId, then attach the subscriber. We
  // accept the microscopic risk of a delta racing the subscribe attach
  // (Anthropic adds ~50ms before first chunk, Apify polls every 3s, Groq
  // downloads audio first — all far slower than IPC round-trip).
  let result;
  try {
    result = await start();
  } catch (e) {
    onError?.({ message: e.message || String(e), code: e.code });
    return { runId: null, abort: () => {} };
  }

  const { runId } = result || {};
  if (!runId) {
    onError?.({ message: "run did not return a runId" });
    return { runId: null, abort: () => {} };
  }

  unsubscribe = c.runs.subscribe(runId, handler);

  const abort = () => {
    if (settled) return;
    stop(runId).catch(() => {
      // Run may have already finished — silently absorbed. The terminal
      // event handler is the source of truth for state.
    });
  };

  return { runId, abort };
}
