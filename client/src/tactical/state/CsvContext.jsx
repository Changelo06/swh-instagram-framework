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

// sessionStorage key — survives F5 within a tab, clears when tab closes.
const SESSION_KEY = "tac-session-v1";

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

const VALIDATION_LAYERS = [
  {
    id: "url",
    label: "URL // REEL DESTINATION",
    critical: true,
    test: (row) => !!row.url || !!row.shortCode,
  },
  {
    id: "views",
    label: "VIEW COUNT // PERFORMANCE SIGNAL",
    critical: true,
    test: (row) =>
      Number.isFinite(Number(row.videoViewCount)) ||
      Number.isFinite(Number(row.videoPlayCount)),
  },
  {
    id: "likes",
    label: "LIKES // ENGAGEMENT NUMERATOR",
    critical: true,
    test: (row) => Number.isFinite(Number(row.likesCount)),
  },
  {
    id: "comments",
    label: "COMMENTS // ENGAGEMENT NUMERATOR",
    critical: true,
    test: (row) => Number.isFinite(Number(row.commentsCount)),
  },
  {
    id: "timestamp",
    label: "TIMESTAMP // DATE INTERVAL",
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
    label: "CAPTION // TEXT CONTENT",
    critical: false,
    test: (row) => typeof row.caption === "string" && row.caption.trim().length > 0,
  },
  {
    id: "duration",
    label: "DURATION // OPTIONAL METRIC",
    critical: false,
    test: (row) => Number.isFinite(Number(row.videoDuration)),
  },
  {
    id: "owner",
    label: "OWNER // CREATOR ATTRIBUTION",
    critical: false,
    test: (row) => !!row.ownerUsername || !!row.username || !!row.handle,
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
  }, []);

  const proceed = useCallback(() => {
    setStage((s) => (s === STAGE.VALIDATING ? STAGE.READY : s));
  }, []);

  const ingest = useCallback(async (file) => {
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) {
      setError("Only .csv files are accepted.");
      setStage(STAGE.ERROR);
      return;
    }
    setError("");
    setFilename(file.name);
    setStage(STAGE.PARSING);

    const fd = new FormData();
    fd.append("file", file);

    try {
      const res = await fetch("/api/parse", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Parse failed (HTTP ${res.status})`);

      const groups = groupByCreator(data.rows || []);
      if (!groups.length) throw new Error("No rows found in CSV.");

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

      setParsed(data);
      setCreators(groups);
      setSelectedHandle(groups[0].handle);
      setPerCreator(initState);
      setValidation(runValidation(data.rows || []));
      setStage(STAGE.VALIDATING);
    } catch (e) {
      setError(e.message);
      setStage(STAGE.ERROR);
    }
  }, []);

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

  const selectedCreator = useMemo(
    () => creators.find((c) => c.handle === selectedHandle) || null,
    [creators, selectedHandle]
  );

  const rows = useMemo(() => {
    if (!selectedCreator) return [];
    const cur = perCreator[selectedHandle] || {};
    return cur.enrichedRows || selectedCreator.rows || [];
  }, [selectedCreator, perCreator, selectedHandle]);

  const cur = perCreator[selectedHandle] || null;

  // ----- streaming helper for /api/analyze + /api/transcribe -----
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
      const ctrl = new AbortController();
      abortRef.current[abortKey] = ctrl;

      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) {
          const txt = await res.text().catch(() => "");
          throw new Error(txt || `HTTP ${res.status}`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split("\n\n");
          buffer = blocks.pop() || "";
          for (const block of blocks) {
            let event = "message";
            let dataLine = "";
            for (const line of block.split("\n")) {
              if (line.startsWith("event:")) event = line.slice(6).trim();
              else if (line.startsWith("data:")) dataLine += line.slice(5).trim();
            }
            if (!dataLine) continue;
            let parsed;
            try {
              parsed = JSON.parse(dataLine);
            } catch {
              continue;
            }
            if (event === "delta" && parsed.text) onDelta?.(parsed.text);
            else if (event === "done") onDone?.(parsed);
            else if (event === "error") throw new Error(parsed.message || "stream error");
            else onEvent?.(event, parsed);
          }
        }
      } catch (e) {
        if (e.name === "AbortError") onError?.({ aborted: true });
        else onError?.({ message: e.message });
      } finally {
        delete abortRef.current[abortKey];
      }
    },
    []
  );

  // ----- analyses (FAST / DEEP) -----
  // Both modes follow the original SWH flow: optionally transcribe the top-N
  // most-engaged reels via Groq Whisper, then stream the framework analysis
  // off the enriched rows. Exports stay disabled until status === "done".
  const TOP_N_TRANSCRIBE = 5;

  const runAnalysis = useCallback(
    ({ mode = "fast", scriptCount = 3 }) => {
      const id = nextId();
      const startedAt = Date.now();

      // detect whether the dataset has any rows with audio URLs that lack a
      // transcript; only those need a transcribe pass.
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
          payload: { rows, topN: TOP_N_TRANSCRIBE },
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
          payload: { rows: [sourceVideo], topN: 1 },
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
