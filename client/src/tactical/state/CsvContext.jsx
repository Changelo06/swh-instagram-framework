import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { groupByCreator } from "../../lib/datasetClassifier.js";
import { streamRun } from "../../lib/runs-stream.js";

// sessionStorage key — survives F5 within a tab, clears when tab closes.
const SESSION_KEY = "tac-session-v1";

// Token slots are read at request time (not threaded through component props)
// so a token saved on the Settings/Apify pages is picked up on the next
// transcribe / scrape without needing the CsvContext to remount.
const APIFY_TOKEN_KEY = "swh-apify-token";
const GROQ_TOKEN_KEY = "swh-groq-token";

function readApifyToken() {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(APIFY_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

function readGroqToken() {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(GROQ_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

function loadSession() {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function persistSession(snapshot) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(snapshot));
  } catch (e) {
    // sessionStorage quota — silently fail; session resumes are best-effort.
    if (e?.name !== "QuotaExceededError") console.warn("session persist failed", e);
  }
}

// Mark in-flight runs as stopped on hydrate (the underlying fetch was killed
// by the page reload — we can't resume, so the user can hit RETRY).
function rehydrateRuns(runs) {
  if (!Array.isArray(runs)) return [];
  return runs.map((r) =>
    r.status === "running"
      ? { ...r, status: "stopped", phase: null, error: r.error || "interrupted by reload" }
      : r
  );
}

export const STAGE = {
  IDLE: "idle",
  PARSING: "parsing",
  VALIDATING: "validating",
  READY: "ready",
  ERROR: "error",
};

// Pseudo-handle used by the Dataset view to show every creator's rows in one
// unified table. Real creator buckets always have a non-empty, lowercased handle
// so this prefix can never collide with a parsed username.
export const ALL_HANDLE = "__all__";

const VALIDATION_LAYERS = [
  {
    id: "url",
    label: "Reel URL",
    critical: true,
    test: (row) => !!row.url || !!row.shortCode,
  },
  {
    id: "views",
    label: "View count",
    critical: true,
    test: (row) =>
      Number.isFinite(Number(row.videoViewCount)) ||
      Number.isFinite(Number(row.videoPlayCount)),
  },
  {
    id: "likes",
    label: "Likes",
    critical: true,
    test: (row) => Number.isFinite(Number(row.likesCount)),
  },
  {
    id: "comments",
    label: "Comments",
    critical: true,
    test: (row) => Number.isFinite(Number(row.commentsCount)),
  },
  {
    id: "timestamp",
    label: "Timestamp",
    critical: true,
    test: (row) => {
      const v = row.timestamp || row.takenAtTimestamp || row.taken_at_timestamp;
      if (!v) return false;
      const d = new Date(v);
      return !isNaN(d.getTime());
    },
  },
  {
    id: "caption",
    label: "Caption",
    critical: false,
    test: (row) => typeof row.caption === "string" && row.caption.trim().length > 0,
  },
  {
    id: "duration",
    label: "Duration",
    critical: false,
    test: (row) => Number.isFinite(Number(row.videoDuration)),
  },
  {
    id: "owner",
    label: "Owner",
    critical: false,
    // Pass when either Apify export column carries the creator — ownerUsername
    // (the @handle) or ownerFullName (the display name). Falling back to the
    // legacy `username`/`handle` aliases keeps non-Apify CSVs working too.
    test: (row) =>
      !!row.ownerUsername ||
      !!row.ownerFullName ||
      !!row.username ||
      !!row.handle,
  },
];

function runValidation(rows) {
  if (!rows || !rows.length) return { layers: [], allPass: false };
  const layers = VALIDATION_LAYERS.map((layer) => {
    const hits = rows.reduce((n, r) => (layer.test(r) ? n + 1 : n), 0);
    const coverage = rows.length ? hits / rows.length : 0;
    return {
      id: layer.id,
      label: layer.label,
      critical: layer.critical,
      hits,
      coverage,
      pass: coverage > 0,
    };
  });
  const allPass = layers.every((l) => l.pass);
  const criticalsPass = layers.filter((l) => l.critical).every((l) => l.pass);
  return { layers, allPass, criticalsPass };
}

const CsvContext = createContext(null);

export function useCsv() {
  const ctx = useContext(CsvContext);
  if (!ctx) throw new Error("useCsv must be used inside CsvProvider");
  return ctx;
}

let _id = 0;
const nextId = () => `${Date.now().toString(36)}-${(++_id).toString(36)}`;

export function CsvProvider({ children }) {
  const initial = loadSession() || {};

  const [stage, setStage] = useState(initial.stage || STAGE.IDLE);
  const [filename, setFilename] = useState(initial.filename || "");
  const [parsed, setParsed] = useState(initial.parsed || null);
  const [error, setError] = useState(initial.error || "");
  const [creators, setCreators] = useState(initial.creators || []);
  const [selectedHandle, setSelectedHandle] = useState(
    initial.selectedHandle || null
  );
  const [perCreator, setPerCreator] = useState(initial.perCreator || {});
  const [validation, setValidation] = useState(initial.validation || null);

  // dataset-wide analyses (FAST / DEEP)
  const [analyses, setAnalyses] = useState(rehydrateRuns(initial.analyses));
  const [activeAnalysisId, setActiveAnalysisId] = useState(
    initial.activeAnalysisId || null
  );

  // per-video script variation pages (notepad)
  const [variations, setVariations] = useState(rehydrateRuns(initial.variations));
  const [activeVariationId, setActiveVariationId] = useState(
    initial.activeVariationId || null
  );

  // Live Apify scrape — only one can run at a time. Persisted across reloads
  // as `idle`/`error`/`done`; mid-flight runs reset to idle since the SSE
  // stream is dead after a reload.
  const [apifyRun, setApifyRun] = useState(() => {
    const raw = initial.apifyRun;
    if (!raw) return { status: "idle" };
    if (raw.status === "running") return { status: "idle" };
    return raw;
  });

  const abortRef = useRef({});

  // persist a snapshot whenever any persisted slice changes.
  useEffect(() => {
    persistSession({
      stage: stage === STAGE.PARSING ? STAGE.IDLE : stage, // never resume a half-parse
      filename,
      parsed,
      error: stage === STAGE.ERROR ? error : "",
      creators,
      selectedHandle,
      perCreator,
      validation,
      analyses,
      activeAnalysisId,
      variations,
      activeVariationId,
      apifyRun,
    });
  }, [
    stage,
    filename,
    parsed,
    error,
    creators,
    selectedHandle,
    perCreator,
    validation,
    analyses,
    activeAnalysisId,
    variations,
    activeVariationId,
    apifyRun,
  ]);

  const reset = useCallback(() => {
    Object.values(abortRef.current).forEach((c) => c?.abort?.());
    abortRef.current = {};
    setStage(STAGE.IDLE);
    setFilename("");
    setParsed(null);
    setError("");
    setCreators([]);
    setSelectedHandle(null);
    setPerCreator({});
    setValidation(null);
    setAnalyses([]);
    setActiveAnalysisId(null);
    setVariations([]);
    setActiveVariationId(null);
    setApifyRun({ status: "idle" });
  }, []);

  const proceed = useCallback(() => {
    setStage((s) => (s === STAGE.VALIDATING ? STAGE.READY : s));
  }, []);

  // Shared with both CSV upload and Apify scrape — the only difference between
  // those entry points is *how* the rows arrive, not what we do with them once
  // they exist. Returns false (and surfaces an error) if the dataset is empty.
  const _loadParsedDataset = useCallback((data, fname) => {
    const groups = groupByCreator(data.rows || []);
    if (!groups.length) {
      setError("No rows found in dataset.");
      setStage(STAGE.ERROR);
      return false;
    }

    const initState = {};
    for (const g of groups) {
      initState[g.handle] = {
        stage: "ready",
        framework: null,
        enrichedRows: null,
        transcribeProgress: null,
        analyzeMode: "full",
        error: "",
        usage: null,
      };
    }

    setFilename(fname);
    setParsed(data);
    setCreators(groups);
    setSelectedHandle(groups[0].handle);
    setPerCreator(initState);
    setValidation(runValidation(data.rows || []));
    setStage(STAGE.VALIDATING);
    return true;
  }, []);

  const ingest = useCallback(
    async (file) => {
      if (!file) return;
      // Accept both Apify CSV exports and the raw JSON dataset format —
      // the main-process parser sniffs extension + content to pick CSV
      // vs JSON, and an Apify scrape produces the same row shape.
      if (!/\.(csv|json)$/i.test(file.name)) {
        setError("Only .csv or .json files are accepted.");
        setStage(STAGE.ERROR);
        return;
      }
      setError("");
      setFilename(file.name);
      setStage(STAGE.PARSING);

      const c = typeof window !== "undefined" ? window.chiqo : null;
      if (!c?.parse?.file) {
        setError(
          "chiqo.ai bridge unavailable — open this in the chiqo.ai desktop app."
        );
        setStage(STAGE.ERROR);
        return;
      }

      try {
        // structuredClone over IPC moves the buffer without a copy.
        const buf = await file.arrayBuffer();
        const data = await c.parse.file(buf, file.name);
        _loadParsedDataset(data, file.name);
      } catch (e) {
        setError(e.message || "Parse failed");
        setStage(STAGE.ERROR);
      }
    },
    [_loadParsedDataset]
  );

  const patchCreator = useCallback((handle, patch) => {
    setPerCreator((p) => ({
      ...p,
      [handle]: { ...(p[handle] || {}), ...patch },
    }));
  }, []);

  const setCreatorAlias = useCallback(
    (handle, alias) => {
      const clean = (alias || "").trim().replace(/^@/, "");
      patchCreator(handle, { alias: clean || null });
    },
    [patchCreator]
  );

  const isAllSelected = selectedHandle === ALL_HANDLE;

  const selectedCreator = useMemo(
    () =>
      isAllSelected
        ? null
        : creators.find((c) => c.handle === selectedHandle) || null,
    [creators, selectedHandle, isAllSelected]
  );

  const rows = useMemo(() => {
    if (isAllSelected) {
      return creators.flatMap((c) => {
        const cur = perCreator[c.handle] || {};
        return cur.enrichedRows || c.rows || [];
      });
    }
    if (!selectedCreator) return [];
    const cur = perCreator[selectedHandle] || {};
    return cur.enrichedRows || selectedCreator.rows || [];
  }, [selectedCreator, perCreator, selectedHandle, creators, isAllSelected]);

  const cur = isAllSelected ? null : perCreator[selectedHandle] || null;

  // ----- streaming helper for analyze / scrape / transcribe -----
  //
  // All three providers (Anthropic analyze, Apify scrape, Groq transcribe)
  // ride the same IPC streaming envelope:
  //
  //   chiqo.<provider>.<verb>(payload)  → { runId }
  //   chiqo.runs.subscribe(runId, ...)  → events on chiqo.runs.delta.<runId>
  //   chiqo.<provider>.stop(runId)
  //
  // The runs-stream helper translates the IPC events
  // ({type:'delta'|'event'|'done'|'error'|'state'}) into the old
  // {onDelta, onEvent, onDone, onError} callback shape this context
  // already speaks. `endpoint` chooses the provider; payloads are
  // forwarded as-is.
  //
  // Tokens (Apify, Groq) live in the vault — main pulls them via the
  // injected `getApiKey` closure. The renderer's old payload fields
  // (`token`, `groqToken`) are still accepted but ignored by the
  // providers; future cleanup can drop them at the call sites.
  const streamAnalyze = useCallback(
    async ({
      endpoint = "/api/analyze",
      payload,
      onDelta,
      onDone,
      onError,
      onEvent,
      abortKey,
    }) => {
      const c =
        typeof window !== "undefined" && window.chiqo ? window.chiqo : null;
      if (!c) {
        onError?.({
          message:
            "chiqo.ai bridge unavailable — open this in the chiqo.ai desktop app.",
          code: "NO_BRIDGE",
        });
        return;
      }

      // Dispatch table — endpoint name kept for backward compat with the
      // call sites; under the hood we hit IPC.
      const transport =
        endpoint === "/api/analyze"
          ? { start: () => c.anthropic.analyze(payload), stop: c.anthropic.stop }
          : endpoint === "/api/scrape"
          ? { start: () => c.apify.scrape(payload), stop: c.apify.stop }
          : endpoint === "/api/transcribe"
          ? { start: () => c.groq.transcribe(payload), stop: c.groq.stop }
          : null;
      if (!transport) {
        onError?.({ message: `Unknown endpoint ${endpoint}`, code: "BAD_ENDPOINT" });
        return;
      }

      let resolveFinished;
      const finished = new Promise((r) => (resolveFinished = r));
      const handle = { abort: () => {} };
      abortRef.current[abortKey] = handle;

      try {
        const { abort } = await streamRun({
          start: transport.start,
          stop: transport.stop,
          callbacks: {
            onDelta,
            onEvent,
            // The old SSE `done` event delivered the result body directly
            // (e.g. {rows, summary, filename}); the new IPC envelope wraps
            // it under `payload`. Existing call sites expect the body
            // shape — splat both forms so they keep reading
            // payload.rows / payload.usage uniformly.
            onDone: (d) => {
              const body = { ...(d.payload || {}) };
              if (d.usage) body.usage = d.usage;
              if (d.stopReason) body.stopReason = d.stopReason;
              onDone?.(body);
              resolveFinished();
            },
            onError: (e) => {
              onError?.(e);
              resolveFinished();
            },
          },
        });
        handle.abort = abort;
        await finished;
      } finally {
        delete abortRef.current[abortKey];
      }
    },
    []
  );

  // ----- Apify scraper -----
  // Drive a single in-flight scrape and replace the dataset on success. The
  // run state is intentionally a flat object (status + counters + error)
  // rather than a list — only one scrape runs at a time, and finishing one
  // implicitly invalidates the previous dataset anyway.
  const runApifyScrape = useCallback(
    ({
      token,
      groqToken,
      urls,
      resultsLimit,
      onlyPostsNewerThan,
      onlyPostsOlderThan,
      addParentData,
    }) => {
      const startedAt = Date.now();
      setApifyRun({
        status: "running",
        phase: "submitting",
        startedAt,
        urls,
        resultsLimit,
        runId: null,
        datasetId: null,
        itemCount: 0,
        consoleUrl: null,
        error: null,
        states: [
          {
            t: 0,
            label: "CLIENT_RUN_INITIATED",
            detail: { urls: urls.length, resultsLimit },
            client: true,
          },
        ],
      });

      const patch = (mut) => setApifyRun((r) => ({ ...r, ...mut }));
      // Append to the runtime timeline. Used both for server-sourced `state`
      // events and a couple of synthetic client-side milestones (initiated,
      // done received, error received, stream ended).
      const appendState = (entry) =>
        setApifyRun((r) => ({
          ...r,
          states: [...(r.states || []), entry],
        }));
      const clientMark = (label, detail) => {
        const t = Date.now() - startedAt;
        // eslint-disable-next-line no-console
        console.log(`[scrape client +${t}ms]`, label, detail || "");
        appendState({ t, label, detail: detail ?? null, client: true });
      };

      streamAnalyze({
        endpoint: "/api/scrape",
        abortKey: "apify-scrape",
        payload: {
          token,
          groqToken,
          urls,
          resultsLimit,
          onlyPostsNewerThan,
          onlyPostsOlderThan,
          addParentData,
        },
        onEvent: (event, data) => {
          // eslint-disable-next-line no-console
          console.log(
            `[scrape client +${Date.now() - startedAt}ms] event:${event}`,
            data
          );
          if (event === "start") {
            patch({ phase: "queued", actor: data.actor });
          } else if (event === "queued") {
            patch({
              phase: "scraping",
              runId: data.runId,
              datasetId: data.datasetId,
              consoleUrl: data.consoleUrl,
            });
          } else if (event === "progress") {
            // Server tags every progress event with `phase` so the panel
            // can swap "scraping → transcribing" without us inferring it.
            // `phase: "running"` is the legacy fallback for old payloads.
            patch({
              phase: data.phase || "scraping",
              actorStatus: data.status,
              itemCount: data.itemCount || 0,
              transcribeTotal:
                data.phase === "transcribing" ? data.total : null,
              requestsTotal: data.requestsTotal || 0,
            });
          } else if (event === "warn") {
            // Non-fatal — surfaces e.g. "transcribe step failed" without
            // killing the scrape. Stash on the run so the panel can show it.
            patch({ warning: data.message || "warning" });
          } else if (event === "state") {
            // Diagnostic timeline event from the server. Append verbatim.
            appendState({
              t: data.t,
              label: data.label,
              detail: data.detail,
              client: false,
            });
          }
        },
        onDone: (payload) => {
          clientMark("CLIENT_DONE_RECEIVED", { rows: (payload.rows || []).length });
          // Promote scraped dataset into the same state CSV uploads use.
          const ok = _loadParsedDataset(
            { rows: payload.rows, summary: payload.summary, filename: payload.filename },
            payload.filename
          );
          clientMark(
            ok ? "CLIENT_DATASET_LOADED" : "CLIENT_DATASET_EMPTY",
            { rows: (payload.rows || []).length }
          );
          // Distinguish "scrape ran cleanly but Apify returned nothing" from
          // a generic empty payload — single-URL submissions are most often
          // a private / removed / wrong-link reel; multi-URL is a profile
          // with no posts in the chosen window.
          const emptyMsg =
            (urls?.length || 0) === 1
              ? "reel inaccessible — private, removed, or wrong URL"
              : "scrape returned 0 items — target may be private, removed, or outside the time window";
          patch({
            status: ok ? "done" : "error",
            phase: null,
            finishedAt: Date.now(),
            itemCount: (payload.rows || []).length,
            error: ok ? null : emptyMsg,
          });
        },
        onError: (err) => {
          clientMark("CLIENT_ERROR_RECEIVED", {
            aborted: !!err.aborted,
            message: err.message,
          });
          patch({
            status: err.aborted ? "stopped" : "error",
            phase: null,
            finishedAt: Date.now(),
            error: err.message || (err.aborted ? "aborted" : "scrape failed"),
          });
        },
      });
    },
    [streamAnalyze, _loadParsedDataset]
  );

  const stopApifyScrape = useCallback(() => {
    abortRef.current["apify-scrape"]?.abort();
  }, []);

  const clearApifyRun = useCallback(() => {
    if (apifyRun.status === "running") return; // safety — make user stop first
    setApifyRun({ status: "idle" });
  }, [apifyRun.status]);

  // ----- analyses (FAST / DEEP) -----
  // Both modes follow the original SWH flow: optionally transcribe the top-N
  // most-engaged reels via the Apify transcriber, then stream the framework
  // analysis off the enriched rows. Exports stay disabled until status === "done".
  const TOP_N_TRANSCRIBE = 5;

  const runAnalysis = useCallback(
    ({ mode = "fast", scriptCount = 3 }) => {
      const id = nextId();
      const startedAt = Date.now();

      // detect whether the dataset has any rows with a resolved audio URL
      // that lacks a transcript; only those need a Groq Whisper pass.
      const candidates = rows.filter(
        (r) =>
          r._audioUrl &&
          !(
            r["reel-transcript"] && String(r["reel-transcript"]).trim()
          )
      );
      const willTranscribe = candidates.length > 0;
      const todoCount = Math.min(candidates.length, TOP_N_TRANSCRIBE);

      setAnalyses((a) => [
        ...a,
        {
          id,
          mode,
          startedAt,
          status: "running",
          phase: willTranscribe ? "transcribing" : "analyzing",
          transcribeProgress: willTranscribe
            ? { completed: 0, total: todoCount, ok: null }
            : null,
          text: "",
          usage: null,
          error: null,
          scriptCount,
        },
      ]);
      setActiveAnalysisId(id);

      const patch = (mut) =>
        setAnalyses((a) => a.map((x) => (x.id === id ? mut(x) : x)));

      const fail = (err) => {
        patch((x) => ({
          ...x,
          status: err.aborted ? "stopped" : "error",
          phase: null,
          error: err.message || (err.aborted ? "aborted" : "error"),
        }));
      };

      const runAnalyzeStep = async (rowsToAnalyze) => {
        patch((x) => ({ ...x, phase: "analyzing" }));
        await streamAnalyze({
          abortKey: `analysis-${id}-analyze`,
          payload: { rows: rowsToAnalyze, filename, scriptCount, mode },
          onDelta: (chunk) => {
            patch((x) => ({ ...x, text: x.text + chunk }));
          },
          onDone: (payload) => {
            patch((x) => ({
              ...x,
              status: "done",
              phase: null,
              usage: payload.usage,
            }));
          },
          onError: fail,
        });
      };

      const runTranscribeStep = async () => {
        let enrichedRows = rows;
        await streamAnalyze({
          endpoint: "/api/transcribe",
          abortKey: `analysis-${id}-transcribe`,
          payload: { rows, topN: TOP_N_TRANSCRIBE, groqToken: readGroqToken() },
          onEvent: (event, payload) => {
            if (event === "start") {
              patch((x) => ({
                ...x,
                transcribeProgress: {
                  completed: 0,
                  total: payload.total || todoCount,
                  audioField: payload.audioField,
                  model: payload.model,
                  strategy: payload.strategy,
                  ok: null,
                },
              }));
            } else if (event === "progress") {
              patch((x) => ({
                ...x,
                transcribeProgress: {
                  ...(x.transcribeProgress || {}),
                  completed: payload.completed,
                  total: x.transcribeProgress?.total || payload.total,
                  failed:
                    (x.transcribeProgress?.failed || 0) + (payload.ok ? 0 : 1),
                },
              }));
            }
          },
          onDone: (payload) => {
            if (payload.rows) enrichedRows = payload.rows;
            patch((x) => ({
              ...x,
              transcribeProgress: {
                ...(x.transcribeProgress || {}),
                completed: (payload.transcribed || 0) + (payload.failed || 0),
                failed: payload.failed || 0,
                ok: (payload.failed || 0) === 0,
              },
            }));
          },
          onError: fail,
        });
        return enrichedRows;
      };

      (async () => {
        try {
          let rowsToAnalyze = rows;
          if (willTranscribe) {
            rowsToAnalyze = await runTranscribeStep();
          }
          // bail if transcribe step failed/aborted
          let snapshot;
          setAnalyses((v) => {
            snapshot = v.find((x) => x.id === id);
            return v;
          });
          if (snapshot && (snapshot.status === "stopped" || snapshot.status === "error")) {
            return;
          }
          await runAnalyzeStep(rowsToAnalyze);
        } catch (e) {
          fail({ message: e.message });
        }
      })();

      return id;
    },
    [rows, filename, streamAnalyze]
  );

  const stopAnalysis = useCallback((id) => {
    abortRef.current[`analysis-${id}-transcribe`]?.abort();
    abortRef.current[`analysis-${id}-analyze`]?.abort();
  }, []);

  const removeAnalysis = useCallback((id) => {
    abortRef.current[`analysis-${id}-transcribe`]?.abort();
    abortRef.current[`analysis-${id}-analyze`]?.abort();
    setAnalyses((a) => a.filter((x) => x.id !== id));
    setActiveAnalysisId((cur) => (cur === id ? null : cur));
  }, []);

  // RETRY: keep the page in place, wipe just the run output, and re-fire the
  // same configuration. Caller passes the current id; we rebuild it with a
  // fresh stream while preserving the page slot (id stays, name stays).
  const retryAnalysis = useCallback(
    (id) => {
      const target = analyses.find((a) => a.id === id);
      if (!target) return;
      // abort any in-flight streams under this id
      abortRef.current[`analysis-${id}-transcribe`]?.abort();
      abortRef.current[`analysis-${id}-analyze`]?.abort();
      // remove the old record then start fresh — same template, new id
      setAnalyses((a) => a.filter((x) => x.id !== id));
      setTimeout(() => {
        const freshId = runAnalysis({
          mode: target.mode,
          scriptCount: target.scriptCount || 3,
        });
        setActiveAnalysisId(freshId);
      }, 0);
    },
    [analyses, runAnalysis]
  );

  // ----- variations (per-video script blueprints) -----
  const runVariation = useCallback(
    ({ name, sourceVideo, count = 3, dnaText, dnaFilename }) => {
      const id = nextId();
      const startedAt = Date.now();

      const sourceSnapshot = snapshotSource(sourceVideo);
      const hasAudio = !!sourceVideo?._audioUrl;
      const existingTranscript =
        sourceVideo?.["reel-transcript"] && String(sourceVideo["reel-transcript"]).trim();
      const willTranscribe = hasAudio && !existingTranscript;

      setVariations((v) => [
        ...v,
        {
          id,
          name: name || untitledName(v.length),
          startedAt,
          status: "running",
          phase: willTranscribe ? "transcribing" : "analyzing",
          transcribeProgress: willTranscribe
            ? { completed: 0, total: 1, ok: null }
            : null,
          text: "",
          usage: null,
          error: null,
          sourceVideo: sourceSnapshot,
          count,
          dnaFilename: dnaFilename || null,
          dnaSize: dnaText ? dnaText.length : 0,
        },
      ]);
      setActiveVariationId(id);

      const patch = (mut) =>
        setVariations((v) => v.map((x) => (x.id === id ? mut(x) : x)));

      const fail = (err) => {
        patch((x) => ({
          ...x,
          status: err.aborted ? "stopped" : "error",
          phase: null,
          error: err.message || (err.aborted ? "aborted" : "error"),
        }));
      };

      const runAnalysisStep = async (singleRow) => {
        patch((x) => ({ ...x, phase: "analyzing" }));
        await streamAnalyze({
          abortKey: `variation-${id}-analyze`,
          payload: {
            rows: [singleRow],
            filename,
            scriptCount: count,
            mode: "reel-blueprint",
            dna: dnaText || null,
            dnaFilename: dnaFilename || null,
          },
          onDelta: (chunk) => {
            patch((x) => ({ ...x, text: x.text + chunk }));
          },
          onDone: (payload) => {
            patch((x) => ({
              ...x,
              status: "done",
              phase: null,
              usage: payload.usage,
            }));
          },
          onError: fail,
        });
      };

      const runTranscribeStep = async () => {
        let enriched = sourceVideo;
        await streamAnalyze({
          endpoint: "/api/transcribe",
          abortKey: `variation-${id}-transcribe`,
          payload: { rows: [sourceVideo], topN: 1, groqToken: readGroqToken() },
          onEvent: (event, payload) => {
            if (event === "start") {
              patch((x) => ({
                ...x,
                transcribeProgress: {
                  completed: 0,
                  total: payload.total || 1,
                  audioField: payload.audioField,
                  model: payload.model,
                  ok: null,
                },
              }));
            } else if (event === "progress") {
              patch((x) => ({
                ...x,
                transcribeProgress: {
                  ...(x.transcribeProgress || {}),
                  completed: payload.completed,
                  ok: payload.ok,
                  chars: payload.chars,
                  error: payload.error,
                },
              }));
            }
          },
          onDone: (payload) => {
            // payload.rows[0] is the enriched single reel.
            if (payload.rows?.[0]) enriched = payload.rows[0];
            patch((x) => ({
              ...x,
              transcribeProgress: {
                ...(x.transcribeProgress || {}),
                completed: payload.transcribed || 0,
                failed: payload.failed || 0,
                ok: (payload.failed || 0) === 0,
              },
            }));
          },
          onError: fail,
        });
        return enriched;
      };

      (async () => {
        try {
          let target = sourceVideo;
          if (willTranscribe) {
            target = await runTranscribeStep();
          }
          // If aborted/failed during transcribe, the variation already has its
          // terminal status set — bail before kicking off analyze.
          const cur = (() => {
            let snapshot;
            setVariations((v) => {
              snapshot = v.find((x) => x.id === id);
              return v;
            });
            return snapshot;
          })();
          if (cur && (cur.status === "stopped" || cur.status === "error")) {
            return;
          }
          await runAnalysisStep(target);
        } catch (e) {
          fail({ message: e.message });
        }
      })();

      return id;
    },
    [rows, filename, streamAnalyze]
  );

  const stopVariation = useCallback((id) => {
    abortRef.current[`variation-${id}-transcribe`]?.abort();
    abortRef.current[`variation-${id}-analyze`]?.abort();
  }, []);

  const removeVariation = useCallback((id) => {
    abortRef.current[`variation-${id}-transcribe`]?.abort();
    abortRef.current[`variation-${id}-analyze`]?.abort();
    setVariations((v) => v.filter((x) => x.id !== id));
    setActiveVariationId((cur) => (cur === id ? null : cur));
  }, []);

  const retryVariation = useCallback(
    (id) => {
      const target = variations.find((v) => v.id === id);
      if (!target) return;
      // find the source row in the live dataset using shortCode/url match,
      // since the snapshot in `target.sourceVideo` is a denormalized copy.
      const sv = target.sourceVideo || {};
      const sourceRow = rows.find(
        (r) =>
          (sv.shortCode && r.shortCode === sv.shortCode) ||
          (sv.url && r.url === sv.url)
      );
      if (!sourceRow) {
        // can't retry — original row missing from dataset.
        setVariations((v) =>
          v.map((x) =>
            x.id === id
              ? {
                  ...x,
                  status: "error",
                  phase: null,
                  error: "source reel no longer in dataset",
                }
              : x
          )
        );
        return;
      }
      abortRef.current[`variation-${id}-transcribe`]?.abort();
      abortRef.current[`variation-${id}-analyze`]?.abort();
      setVariations((v) => v.filter((x) => x.id !== id));
      setTimeout(() => {
        const freshId = runVariation({
          name: target.name,
          sourceVideo: sourceRow,
          count: target.count,
          dnaText: null,
          dnaFilename: target.dnaFilename || null,
        });
        setActiveVariationId(freshId);
      }, 0);
    },
    [variations, rows, runVariation]
  );

  const value = useMemo(
    () => ({
      stage,
      filename,
      parsed,
      error,
      creators,
      selectedHandle,
      selectedCreator,
      perCreator,
      cur,
      rows,
      validation,
      abortRef,
      setSelectedHandle,
      patchCreator,
      setCreatorAlias,
      ingest,
      reset,
      proceed,
      // analyses
      analyses,
      activeAnalysisId,
      setActiveAnalysisId,
      runAnalysis,
      stopAnalysis,
      removeAnalysis,
      retryAnalysis,
      // variations
      variations,
      activeVariationId,
      setActiveVariationId,
      runVariation,
      stopVariation,
      removeVariation,
      retryVariation,
      // apify scraper
      apifyRun,
      runApifyScrape,
      stopApifyScrape,
      clearApifyRun,
    }),
    [
      stage,
      filename,
      parsed,
      error,
      creators,
      selectedHandle,
      selectedCreator,
      perCreator,
      cur,
      rows,
      validation,
      patchCreator,
      setCreatorAlias,
      ingest,
      reset,
      proceed,
      analyses,
      activeAnalysisId,
      runAnalysis,
      stopAnalysis,
      removeAnalysis,
      retryAnalysis,
      variations,
      activeVariationId,
      runVariation,
      stopVariation,
      removeVariation,
      retryVariation,
      apifyRun,
      runApifyScrape,
      stopApifyScrape,
      clearApifyRun,
    ]
  );

  return <CsvContext.Provider value={value}>{children}</CsvContext.Provider>;
}

function untitledName(n) {
  return `UNTITLED_${String(n + 1).padStart(2, "0")}`;
}

function snapshotSource(row) {
  if (!row) return null;
  return {
    url: row.url || null,
    shortCode: row.shortCode || null,
    caption: row.caption || "",
    views: Number(row.videoViewCount) || Number(row.videoPlayCount) || 0,
    likes: Number(row.likesCount) || 0,
    comments: Number(row.commentsCount) || 0,
    duration: Number(row.videoDuration) || 0,
  };
}
