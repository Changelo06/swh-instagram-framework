// Apify scrape provider — main-process side.
//
// Replaces /api/scrape and /api/apify/account. Same actor
// (`apify~instagram-scraper`), same polling cadence, same event names
// (start / queued / progress / warn / done) so the renderer's existing
// `onEvent(event, data)` switch keeps working unchanged once it pivots
// from SSE to IPC.
//
// Key resolution: the scrape pulls its Apify token from the vault via a
// `getApiKey` closure (just like Anthropic). The optional Groq key for
// the chained transcribe step uses a second closure (`getGroqApiKey`) so
// the scrape can run even when no Groq key is configured — transcripts
// are skipped with a `warn` event, the scrape still ships.

const {
  TRANSCRIPT_FIELD,
  pickFields,
  summarize,
  normalizeIgUrl,
  synthesizeScrapeFilename,
  pMapBounded,
} = require("./dataset.cjs");
const runs = require("../runs/index.cjs");
const { transcribeOne, GROQ_MODEL, TRANSCRIBE_CONCURRENCY } = require("./groq.cjs");

const APIFY_ACTOR_ID = "apify~instagram-scraper";
const APIFY_BASE = "https://api.apify.com/v2";
const APIFY_POLL_MS = Number(process.env.APIFY_POLL_MS || 3000);
const APIFY_MAX_POLLS = Number(process.env.APIFY_MAX_POLLS || 400); // ~20 min @ 3s
// Apify run statuses considered "still running" for polling purposes.
const APIFY_LIVE_STATUSES = new Set(["READY", "RUNNING"]);

async function apifyFetch(url, init = {}) {
  const r = await fetch(url, init);
  if (!r.ok) {
    let detail = "";
    try {
      detail = (await r.text()).slice(0, 400);
    } catch {}
    throw new Error(`apify ${r.status}: ${detail || r.statusText}`);
  }
  return r;
}

// ---- Account / usage --------------------------------------------------
//
// Reads the operator's Apify profile + monthly usage. Synchronous
// request/response (no streaming). The IPC handler resolves the token
// from the vault.
async function fetchAccount({ token }) {
  if (!token) {
    const e = new Error("APIFY_TOKEN is not configured in the vault");
    e.code = "NO_API_KEY";
    throw e;
  }
  const [userResp, usageResp] = await Promise.all([
    fetch(`${APIFY_BASE}/users/me?token=${encodeURIComponent(token)}`),
    fetch(
      `${APIFY_BASE}/users/me/usage/monthly?token=${encodeURIComponent(token)}`
    ),
  ]);
  if (!userResp.ok) {
    const txt = await userResp.text().catch(() => "");
    const e = new Error(
      `apify ${userResp.status}: ${txt.slice(0, 200) || userResp.statusText}`
    );
    e.code = "APIFY_ERROR";
    throw e;
  }
  const userJson = await userResp.json().catch(() => ({}));
  const usageJson = usageResp.ok
    ? await usageResp.json().catch(() => ({}))
    : null;
  return { user: userJson?.data || null, usage: usageJson?.data || null };
}

// ---- Scrape -----------------------------------------------------------
//
// Returns `{runId}` synchronously. The run emits:
//   event: start    { actor, urls, resultsLimit }
//   event: queued   { runId, datasetId, consoleUrl }
//   event: progress { phase: 'scraping' | 'transcribing', ... } repeatedly
//   event: warn     { phase, message }                    (optional)
//   done            { payload: { rows, summary, filename, runId, datasetId } }
//
// The Groq transcribe pass is best-effort — when no key is configured or
// any single reel fails, the scrape still ships with empty transcripts.
function startScrapeRun({ payload, getApiKey, getGroqApiKey, sender }) {
  const { urls, resultsLimit, onlyPostsNewerThan, onlyPostsOlderThan, addParentData } =
    payload || {};

  const apifyKey = getApiKey();
  if (!apifyKey) {
    const e = new Error(
      "Apify token is not configured. Open Settings → API keys to add one."
    );
    e.code = "NO_API_KEY";
    throw e;
  }

  const directUrls = (Array.isArray(urls) ? urls : [])
    .map(normalizeIgUrl)
    .filter(Boolean);
  if (directUrls.length === 0) {
    const e = new Error(
      "Provide at least one valid Instagram profile URL or @handle"
    );
    e.code = "BAD_INPUT";
    throw e;
  }

  const limitClamped = Math.min(
    1000,
    Math.max(
      1,
      Number.isFinite(Number(resultsLimit))
        ? Math.floor(Number(resultsLimit))
        : 50
    )
  );

  const actorInput = {
    directUrls,
    resultsType: "posts",
    resultsLimit: limitClamped,
    addParentData: !!addParentData,
  };
  if (typeof onlyPostsNewerThan === "string" && onlyPostsNewerThan.trim()) {
    actorInput.onlyPostsNewerThan = onlyPostsNewerThan.trim();
  }
  if (typeof onlyPostsOlderThan === "string" && onlyPostsOlderThan.trim()) {
    actorInput.onlyPostsOlderThan = onlyPostsOlderThan.trim();
  }

  const controller = new AbortController();
  const runId = runs.startRun({
    type: "scrape",
    route: "chiqo.apify.scrape",
    sender,
    model: APIFY_ACTOR_ID,
    abortController: controller,
  });

  (async () => {
    try {
      runs.onStreaming(runId);
      runs.onEvent(runId, "start", {
        actor: APIFY_ACTOR_ID,
        urls: directUrls,
        resultsLimit: limitClamped,
      });

      // Kick off the actor run on Apify's side.
      const startResp = await apifyFetch(
        `${APIFY_BASE}/acts/${APIFY_ACTOR_ID}/runs?token=${encodeURIComponent(apifyKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(actorInput),
          signal: controller.signal,
        }
      );
      const startJson = await startResp.json();
      const apifyRunId = startJson?.data?.id;
      const datasetId = startJson?.data?.defaultDatasetId;
      if (!apifyRunId || !datasetId) {
        throw new Error("Apify did not return runId/datasetId");
      }

      runs.onEvent(runId, "queued", {
        runId: apifyRunId,
        datasetId,
        consoleUrl: `https://console.apify.com/actors/runs/${apifyRunId}`,
      });

      // Poll until terminal. Emits progress every poll even when status /
      // itemCount didn't change — keeps the run heartbeat alive in the
      // renderer panel.
      let polls = 0;

      while (true) {
        if (controller.signal.aborted) {
          throw Object.assign(new Error("aborted"), { name: "AbortError" });
        }
        polls++;
        if (polls > APIFY_MAX_POLLS) {
          throw new Error(
            `run still in progress after ${polls} polls — bailing out`
          );
        }
        await new Promise((r) => setTimeout(r, APIFY_POLL_MS));

        const statusResp = await apifyFetch(
          `${APIFY_BASE}/actor-runs/${apifyRunId}?token=${encodeURIComponent(apifyKey)}`,
          { signal: controller.signal }
        );
        const statusJson = await statusResp.json();
        const status = statusJson?.data?.status;
        const itemCount = Number(statusJson?.data?.stats?.itemCount) || 0;

        runs.onEvent(runId, "progress", {
          phase: "scraping",
          status,
          itemCount,
          requestsTotal: statusJson?.data?.stats?.requestsTotal || 0,
          startedAt: statusJson?.data?.startedAt,
        });

        if (!APIFY_LIVE_STATUSES.has(status)) {
          if (status !== "SUCCEEDED") {
            throw new Error(
              `Apify run ${status}: ${statusJson?.data?.exitCode ?? ""} ${statusJson?.data?.statusMessage || ""}`.trim()
            );
          }
          break;
        }
      }

      // Pull the resulting dataset.
      const itemsResp = await apifyFetch(
        `${APIFY_BASE}/datasets/${datasetId}/items?format=json&clean=true&token=${encodeURIComponent(apifyKey)}`,
        { signal: controller.signal }
      );
      const items = await itemsResp.json();
      if (!Array.isArray(items)) {
        throw new Error("Apify dataset response was not an array");
      }

      const rows = items.map(pickFields);
      const filename = synthesizeScrapeFilename(directUrls);

      // Chained Groq Whisper transcription. Best-effort — failure here
      // produces a warn event but the scrape still ships.
      const groqKey = (getGroqApiKey && getGroqApiKey()) || "";
      if (rows.length > 0) {
        const candidates = rows
          .map((row, idx) => ({ row, idx }))
          .filter(
            ({ row }) =>
              row._audioUrl &&
              String(row._audioUrl).startsWith("http") &&
              !(row[TRANSCRIPT_FIELD] && String(row[TRANSCRIPT_FIELD]).trim())
          );

        if (candidates.length === 0) {
          // Nothing to transcribe — skip silently.
        } else if (!groqKey) {
          runs.onEvent(runId, "warn", {
            phase: "transcribing",
            message:
              "Groq token not set — transcripts skipped. Add a token in Settings → API keys to enable.",
          });
        } else {
          try {
            runs.onEvent(runId, "progress", {
              phase: "transcribing",
              status: "STARTING",
              itemCount: 0,
              total: candidates.length,
            });
            let succeeded = 0;
            let failed = 0;
            await pMapBounded(
              candidates,
              TRANSCRIBE_CONCURRENCY,
              async ({ row }) => {
                if (controller.signal.aborted) {
                  const e = new Error("aborted");
                  e.name = "AbortError";
                  throw e;
                }
                const text = await transcribeOne(row._audioUrl, groqKey, {
                  signal: controller.signal,
                });
                row.transcript = text;
                row[TRANSCRIPT_FIELD] = text;
                return text;
              },
              ({ completed, total, lastResult }) => {
                if (lastResult.ok) succeeded++;
                else failed++;
                runs.onEvent(runId, "progress", {
                  phase: "transcribing",
                  status: "RUNNING",
                  itemCount: completed,
                  total,
                  succeeded,
                  failed,
                });
              }
            );
            runs.onEvent(runId, "progress", {
              phase: "transcribing",
              status: "SUCCEEDED",
              itemCount: succeeded,
              total: candidates.length,
              succeeded,
              failed,
              done: true,
            });
          } catch (e) {
            if (e?.name === "AbortError") throw e; // propagate stop
            runs.onEvent(runId, "warn", {
              phase: "transcribing",
              message: `transcribe step failed: ${e.message || "unknown error"}`,
            });
          }
        }
      }

      runs.onDone(runId, {
        payload: {
          rows,
          summary: summarize(rows, items.length ? Object.keys(items[0]) : []),
          filename,
          runId: apifyRunId,
          datasetId,
        },
        model: APIFY_ACTOR_ID,
      });
    } catch (e) {
      runs.onError(runId, e);
    }
  })();

  return { runId };
}

module.exports = {
  startScrapeRun,
  fetchAccount,
  APIFY_ACTOR_ID,
};
