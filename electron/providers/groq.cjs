// Groq Whisper transcribe provider.
//
// Replaces the old /api/transcribe Express handler. Returns `{runId}`
// synchronously; the run streams `event:start` then a series of
// `event:progress` updates and finally a `done` event with the enriched
// rows on the run's delta channel. The renderer subscribes via
// chiqo.runs.subscribe(runId, ...).
//
// The Groq key resolution mirrors anthropic.cjs: a `getApiKey` closure is
// injected at run start (the IPC handler reads it from the vault). The
// provider never touches the vault directly — that's what keeps it
// unit-testable.

const {
  TRANSCRIPT_FIELD,
  engagementScore,
  pMapBounded,
} = require("./dataset.cjs");
const runs = require("../runs/index.cjs");

const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const GROQ_MODEL =
  process.env.GROQ_WHISPER_MODEL || "whisper-large-v3-turbo";
const GROQ_AUDIO_MAX_BYTES = 24 * 1024 * 1024;
const GROQ_DOWNLOAD_TIMEOUT_MS = Number(
  process.env.GROQ_DOWNLOAD_TIMEOUT_MS || 30000
);
const TRANSCRIBE_CONCURRENCY = Number(
  process.env.TRANSCRIBE_CONCURRENCY || 4
);

async function downloadAudio(url, { signal, timeoutMs = GROQ_DOWNLOAD_TIMEOUT_MS } = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  // Chain the run's abort signal so stopping the run kills in-flight audio
  // fetches too — otherwise a stop request would still let pending audio
  // downloads complete.
  if (signal) {
    if (signal.aborted) ac.abort();
    else signal.addEventListener("abort", () => ac.abort(), { once: true });
  }
  try {
    const r = await fetch(url, {
      signal: ac.signal,
      headers: {
        // Instagram CDN occasionally rejects fetches without a UA.
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      },
    });
    if (!r.ok) throw new Error(`audio fetch ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > GROQ_AUDIO_MAX_BYTES) {
      throw new Error(`audio too large for Groq (${buf.length} bytes)`);
    }
    return buf;
  } finally {
    clearTimeout(t);
  }
}

async function transcribeWithGroq(
  buf,
  groqKey,
  { signal, filename = "audio.mp4" } = {}
) {
  if (!groqKey) {
    const e = new Error("Groq API key not provided");
    e.code = "NO_API_KEY";
    throw e;
  }
  const fd = new FormData();
  fd.append("file", new Blob([buf], { type: "audio/mp4" }), filename);
  fd.append("model", GROQ_MODEL);
  fd.append("response_format", "text");
  fd.append("temperature", "0");
  const r = await fetch(GROQ_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${groqKey}` },
    body: fd,
    signal,
  });
  if (!r.ok) {
    const errText = await r.text().catch(() => "");
    throw new Error(
      `groq ${r.status}: ${errText.slice(0, 200) || r.statusText}`
    );
  }
  const text = await r.text();
  return text.trim();
}

async function transcribeOne(audioUrl, groqKey, { signal } = {}) {
  const buf = await downloadAudio(audioUrl, { signal });
  return transcribeWithGroq(buf, groqKey, { signal });
}

// Public: start a top-N transcribe run. Returns `{runId}` synchronously
// before any audio fetch fires. The IPC handler is the only caller — see
// `chiqo.groq.transcribe` in electron/ipc/index.cjs.
function startTranscribeRun({ payload, getApiKey, sender }) {
  const { rows, topN } = payload || {};
  if (!Array.isArray(rows) || rows.length === 0) {
    const e = new Error("rows[] required");
    e.code = "BAD_INPUT";
    throw e;
  }

  // Look up the Groq key BEFORE returning a runId so the renderer gets a
  // synchronous typed error (NO_API_KEY) instead of a deferred event.
  const groqKey = getApiKey();
  if (!groqKey) {
    const e = new Error(
      "Groq key is not configured. Open Settings → API keys to add one."
    );
    e.code = "NO_API_KEY";
    throw e;
  }

  const limit = Number.isFinite(topN) && topN > 0 ? Math.floor(topN) : 5;

  const controller = new AbortController();
  const runId = runs.startRun({
    type: "transcribe",
    route: "chiqo.groq.transcribe",
    sender,
    model: GROQ_MODEL,
    abortController: controller,
  });

  (async () => {
    try {
      runs.onStreaming(runId);

      const enriched = rows.map((r) => ({ ...r }));
      const ranked = enriched
        .map((row, idx) => ({ row, idx, score: engagementScore(row) }))
        .filter(({ row }) => {
          const existing =
            row[TRANSCRIPT_FIELD] && String(row[TRANSCRIPT_FIELD]).trim();
          return row._audioUrl && !existing;
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      const todo = ranked.map(({ row, idx, score }) => ({
        idx,
        url: row._audioUrl,
        score,
      }));

      const audioField =
        enriched.find((r) => r._audioSourceField)?._audioSourceField || null;

      runs.onEvent(runId, "start", {
        audioField,
        total: todo.length,
        limit,
        strategy: "top engagement (likes + comments)",
        skipped: enriched.length - todo.length,
        model: GROQ_MODEL,
      });

      if (todo.length === 0) {
        runs.onDone(runId, {
          payload: {
            rows: enriched,
            transcribed: 0,
            failed: 0,
            skipped: enriched.length,
          },
        });
        return;
      }

      let failed = 0;
      await pMapBounded(
        todo,
        TRANSCRIBE_CONCURRENCY,
        async (job) => {
          if (controller.signal.aborted) {
            const e = new Error("aborted");
            e.name = "AbortError";
            throw e;
          }
          const text = await transcribeOne(job.url, groqKey, {
            signal: controller.signal,
          });
          enriched[job.idx][TRANSCRIPT_FIELD] = text;
          enriched[job.idx].transcript = text;
          return text;
        },
        ({ completed, total, lastIndex, lastResult }) => {
          const job = todo[lastIndex];
          if (lastResult.ok) {
            runs.onEvent(runId, "progress", {
              completed,
              total,
              rowIndex: job.idx,
              ok: true,
              chars: lastResult.value.length,
            });
          } else {
            failed++;
            enriched[job.idx][TRANSCRIPT_FIELD] = "";
            enriched[job.idx]["_transcribe_error"] = lastResult.error;
            runs.onEvent(runId, "progress", {
              completed,
              total,
              rowIndex: job.idx,
              ok: false,
              error: lastResult.error,
            });
          }
        }
      );

      runs.onDone(runId, {
        payload: {
          rows: enriched,
          transcribed: todo.length - failed,
          failed,
          skipped: enriched.length - todo.length,
        },
      });
    } catch (e) {
      runs.onError(runId, e);
    }
  })();

  return { runId };
}

module.exports = {
  startTranscribeRun,
  // Exposed for the Apify provider, which chains a transcribe pass at the
  // end of a successful scrape.
  transcribeOne,
  GROQ_MODEL,
  TRANSCRIBE_CONCURRENCY,
};
