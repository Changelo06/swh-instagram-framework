import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Upload,
  Sparkles,
  Eye,
  TrendingUp,
  Music,
  Hash,
  Layers as LayersIcon,
  Download,
  FileSpreadsheet,
  Mic,
  BarChart3,
  PenLine,
  ShieldAlert,
  Save,
  Zap,
  ListChecks,
  X,
  Lock,
} from "lucide-react";
import InsightsPanel from "../components/InsightsPanel.jsx";
import DatasetBadge from "../components/DatasetBadge.jsx";
import FrameworkTabs from "../components/FrameworkTabs.jsx";
import { API_STATE } from "../components/ApiStatus.jsx";
import {
  classifyDataset,
  detectHandle,
  groupByCreator,
} from "../lib/datasetClassifier.js";
import { splitFrameworkStream } from "../lib/frameworkParser.js";
import {
  downloadEnrichedCsv,
  downloadInsightsCsv,
  downloadTranscriptsTxt,
} from "../lib/exporters.js";
import CreatorSwitcher from "../components/CreatorSwitcher.jsx";

const GLOBAL_STAGE = {
  IDLE: "idle",
  PARSING: "parsing",
  READY: "ready",
  PARSE_ERROR: "parse_error",
};

const PER_STAGE = {
  READY: "ready",
  TRANSCRIBING: "transcribing",
  ANALYZING: "analyzing",
  DONE: "done",
  ERROR: "error",
};

const TRANSCRIBE_TOP_N = 5;
const TRANSCRIPT_KEY = "reel-transcript";

function buildSummaryForRows(rows, parentSummary) {
  const totalPosts = rows.length;
  if (!totalPosts) return parentSummary;

  const captionRows = rows.filter(
    (r) => (r.caption || "").trim().length > 0
  ).length;
  const captionCoveragePct = Math.round((captionRows / totalPosts) * 100);

  const audioField = parentSummary?.audioField || null;
  const audioFieldHits = audioField
    ? rows.filter((r) => r._audioUrl || r[audioField]).length
    : 0;

  const transcribed = rows.filter(
    (r) => r[TRANSCRIPT_KEY] && String(r[TRANSCRIPT_KEY]).trim()
  ).length;
  const transcriptCoveragePct = transcribed
    ? Math.round((transcribed / totalPosts) * 100)
    : 0;

  const viewRows = rows.filter(
    (r) =>
      Number.isFinite(Number(r.videoPlayCount)) ||
      Number.isFinite(Number(r.videoViewCount))
  ).length;
  const viewCoveragePct = Math.round((viewRows / totalPosts) * 100);

  return {
    ...(parentSummary || {}),
    totalPosts,
    captionCoveragePct,
    audioField,
    audioFieldHits,
    transcriptCoveragePct,
    viewCoveragePct,
  };
}

export default function Dashboard({
  health,
  scriptCount,
  resetSignal,
  onStageChange,
  onOpenSettings,
}) {
  // ---- shared upload state ----
  const [globalStage, setGlobalStage] = useState(GLOBAL_STAGE.IDLE);
  const [filename, setFilename] = useState("");
  const [parsed, setParsed] = useState(null);
  const [parseError, setParseError] = useState("");
  const [creators, setCreators] = useState([]);
  const [selectedHandle, setSelectedHandle] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [confirmIntent, setConfirmIntent] = useState(null);

  // ---- per-creator state ----
  const [perCreator, setPerCreator] = useState({});

  const inputRef = useRef(null);
  const abortRef = useRef({});

  const apiBlocked = health.state === API_STATE.OFFLINE;

  const cur = perCreator[selectedHandle] || {};
  const curStage = cur.stage || PER_STAGE.READY;

  const patchCreator = useCallback((handle, patch) => {
    setPerCreator((p) => ({
      ...p,
      [handle]: { ...(p[handle] || {}), ...patch },
    }));
  }, []);

  const patchCur = useCallback(
    (patch) => {
      if (!selectedHandle) return;
      patchCreator(selectedHandle, patch);
    },
    [selectedHandle, patchCreator]
  );

  const reset = useCallback(() => {
    Object.values(abortRef.current).forEach((c) => c?.abort?.());
    abortRef.current = {};
    setGlobalStage(GLOBAL_STAGE.IDLE);
    setFilename("");
    setParsed(null);
    setParseError("");
    setCreators([]);
    setSelectedHandle(null);
    setPerCreator({});
    setConfirmIntent(null);
  }, []);

  useEffect(() => {
    if (resetSignal) reset();
  }, [resetSignal, reset]);

  useEffect(() => {
    onStageChange?.(globalStage === GLOBAL_STAGE.IDLE ? "idle" : "active");
  }, [globalStage, onStageChange]);

  const consumeSSE = async (response, onEvent) => {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() || "";
      for (const block of blocks) {
        const lines = block.split("\n");
        let event = "message";
        let dataLine = "";
        for (const line of lines) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLine += line.slice(5).trim();
        }
        if (!dataLine) continue;
        onEvent(event, JSON.parse(dataLine));
      }
    }
  };

  const runTranscribeFor = async (handle, rowsIn) => {
    patchCreator(handle, {
      stage: PER_STAGE.TRANSCRIBING,
      transcribeProgress: { completed: 0, total: 0, failed: 0 },
    });
    const controller = new AbortController();
    abortRef.current[handle] = controller;

    const res = await fetch("/api/transcribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: rowsIn, topN: TRANSCRIBE_TOP_N }),
      signal: controller.signal,
    });
    if (!res.ok || !res.body) {
      const txt = await res.text().catch(() => "");
      throw new Error(txt || `Transcribe failed (HTTP ${res.status})`);
    }

    let resultRows = rowsIn;
    let failed = 0;

    await consumeSSE(res, (event, payload) => {
      if (event === "start") {
        patchCreator(handle, {
          transcribeProgress: {
            completed: 0,
            total: payload.total,
            failed: 0,
            skipped: payload.skipped,
            audioField: payload.audioField,
            model: payload.model,
            strategy: payload.strategy,
          },
        });
      } else if (event === "progress") {
        if (!payload.ok) failed++;
        setPerCreator((p) => {
          const prev = p[handle]?.transcribeProgress || {};
          return {
            ...p,
            [handle]: {
              ...(p[handle] || {}),
              transcribeProgress: {
                ...prev,
                completed: payload.completed,
                failed,
              },
            },
          };
        });
      } else if (event === "done") {
        resultRows = payload.rows;
        setPerCreator((p) => {
          const prev = p[handle]?.transcribeProgress || {};
          return {
            ...p,
            [handle]: {
              ...(p[handle] || {}),
              transcribeProgress: {
                ...prev,
                completed: payload.transcribed + payload.failed,
                failed: payload.failed,
              },
            },
          };
        });
      } else if (event === "error") {
        throw new Error(payload.message || "Transcribe error");
      }
    });

    return resultRows;
  };

  const runAnalyzeFor = async (handle, rowsIn, mode) => {
    patchCreator(handle, {
      stage: PER_STAGE.ANALYZING,
      framework: null,
      usage: null,
      activeTab: "framework",
      analyzeMode: mode,
    });
    const controller = new AbortController();
    abortRef.current[handle] = controller;

    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: rowsIn, filename, scriptCount, mode }),
      signal: controller.signal,
    });
    if (!res.ok || !res.body) {
      const txt = await res.text().catch(() => "");
      throw new Error(txt || `Analyze failed (HTTP ${res.status})`);
    }

    let buffered = "";
    let lastFlush = 0;
    const flush = (force = false) => {
      const now = Date.now();
      if (!force && now - lastFlush < 120) return;
      lastFlush = now;
      patchCreator(handle, { framework: splitFrameworkStream(buffered) });
    };

    await consumeSSE(res, (event, payload) => {
      if (event === "delta") {
        buffered += payload.text;
        flush();
      } else if (event === "done") {
        flush(true);
        patchCreator(handle, { usage: payload.usage, stage: PER_STAGE.DONE });
      } else if (event === "error") {
        throw new Error(payload.message || "Analyze error");
      }
    });

    setPerCreator((p) => {
      const prev = p[handle];
      if (!prev || prev.stage !== PER_STAGE.ANALYZING) return p;
      return { ...p, [handle]: { ...prev, stage: PER_STAGE.DONE } };
    });
  };

  const handleFile = useCallback(
    async (file) => {
      if (!file) return;
      if (apiBlocked) {
        setParseError(
          "Cannot upload — backend APIs are offline. Open Settings to recheck."
        );
        setGlobalStage(GLOBAL_STAGE.PARSE_ERROR);
        return;
      }
      if (!/\.csv$/i.test(file.name)) {
        setParseError("Please upload a .csv file.");
        setGlobalStage(GLOBAL_STAGE.PARSE_ERROR);
        return;
      }
      setParseError("");
      setFilename(file.name);
      setGlobalStage(GLOBAL_STAGE.PARSING);

      const fd = new FormData();
      fd.append("file", file);
      try {
        const res = await fetch("/api/parse", { method: "POST", body: fd });
        const parsedData = await res.json();
        if (!res.ok) throw new Error(parsedData.error || "Parse failed");
        setParsed(parsedData);

        const groups = groupByCreator(parsedData.rows || []);
        if (groups.length === 0) {
          throw new Error("No rows found in CSV.");
        }
        setCreators(groups);

        const initState = {};
        for (const g of groups) {
          initState[g.handle] = {
            stage: PER_STAGE.READY,
            framework: null,
            enrichedRows: null,
            transcribeProgress: null,
            analyzeMode: "full",
            error: "",
            usage: null,
            activeTab: "dataset",
          };
        }
        setPerCreator(initState);
        setSelectedHandle(groups[0].handle);
        setGlobalStage(GLOBAL_STAGE.READY);
      } catch (e) {
        setParseError(e.message);
        setGlobalStage(GLOBAL_STAGE.PARSE_ERROR);
      }
    },
    [apiBlocked]
  );

  const runConfirmed = async (mode) => {
    const target = confirmIntent?.handle || selectedHandle;
    setConfirmIntent(null);
    if (!target) return;
    const creator = creators.find((c) => c.handle === target);
    if (!creator) return;
    if (apiBlocked) {
      patchCreator(target, {
        error: "Backend offline. Open Settings to recheck.",
        stage: PER_STAGE.ERROR,
      });
      return;
    }

    try {
      const ping = await fetch("/api/health", { cache: "no-store" });
      const data = await ping.json();
      const anthropicOk =
        data.services?.anthropic?.configured ?? data.anthropicConfigured;
      if (!anthropicOk) {
        patchCreator(target, {
          error: "Anthropic API key not configured on server.",
          stage: PER_STAGE.ERROR,
        });
        return;
      }
    } catch (e) {
      patchCreator(target, {
        error: `Health check failed: ${e.message}`,
        stage: PER_STAGE.ERROR,
      });
      return;
    }

    try {
      const targetState = perCreator[target] || {};
      let rows = targetState.enrichedRows || creator.rows;
      const audioField = parsed?.summary?.audioField;
      const needsTranscribe =
        !!audioField && rows.some((r) => r._audioUrl && !r[TRANSCRIPT_KEY]);

      if (needsTranscribe) {
        rows = await runTranscribeFor(target, rows);
        patchCreator(target, { enrichedRows: rows });
      }

      await runAnalyzeFor(target, rows, mode);
    } catch (e) {
      if (e.name === "AbortError") return;
      patchCreator(target, { error: e.message, stage: PER_STAGE.ERROR });
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    handleFile(e.dataTransfer.files?.[0]);
  };

  const selectedCreator = useMemo(
    () => creators.find((c) => c.handle === selectedHandle) || null,
    [creators, selectedHandle]
  );

  const baseRows = selectedCreator?.rows || [];
  const rowsForCharts = cur.enrichedRows || baseRows;

  const summary = useMemo(
    () => buildSummaryForRows(rowsForCharts, parsed?.summary),
    [rowsForCharts, parsed]
  );

  const baseName = useMemo(() => {
    const fname = (filename || "swh-framework").replace(/\.csv$/i, "");
    const handle = selectedHandle ? `-${selectedHandle}` : "";
    return `${fname}${handle}`;
  }, [filename, selectedHandle]);

  const classification = useMemo(
    () => (rowsForCharts.length ? classifyDataset(rowsForCharts) : null),
    [rowsForCharts]
  );
  const handleForCharts = useMemo(
    () =>
      rowsForCharts.length
        ? detectHandle(rowsForCharts)
        : selectedHandle || "creator",
    [rowsForCharts, selectedHandle]
  );

  const busy =
    curStage === PER_STAGE.TRANSCRIBING || curStage === PER_STAGE.ANALYZING;
  const canActOnDataset = !!selectedCreator && !busy && !apiBlocked;
  const hasFramework = !!cur.framework;
  const hasTranscripts = rowsForCharts.some(
    (r) => r[TRANSCRIPT_KEY] && String(r[TRANSCRIPT_KEY]).trim()
  );

  const activeTab = cur.activeTab || "dataset";
  const setActiveTab = (tab) => patchCur({ activeTab: tab });

  const showWorkspace =
    globalStage === GLOBAL_STAGE.READY && !!selectedCreator;
  const error = cur.error || "";

  return (
    <section className="relative max-w-7xl mx-auto px-6 py-8 md:py-10">
      {confirmIntent && confirmIntent.kind === "scripts" && (
        <ScriptsConfirmModal
          scriptCount={scriptCount}
          willTranscribe={!!summary?.audioField && !hasTranscripts}
          onCancel={() => setConfirmIntent(null)}
          onConfirm={(mode) => runConfirmed(mode)}
        />
      )}

      {apiBlocked && (
        <ApiOfflineBanner error={health.error} onOpenSettings={onOpenSettings} />
      )}

      {globalStage === GLOBAL_STAGE.IDLE ||
      globalStage === GLOBAL_STAGE.PARSING ||
      globalStage === GLOBAL_STAGE.PARSE_ERROR ? (
        <UploadZone
          dragActive={dragActive}
          setDragActive={setDragActive}
          onDrop={onDrop}
          onPick={() => inputRef.current?.click()}
          parsing={globalStage === GLOBAL_STAGE.PARSING}
          error={parseError}
          disabled={apiBlocked}
        />
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
        disabled={apiBlocked}
      />

      {showWorkspace && (
        <>
          <CreatorSwitcher
            creators={creators}
            selectedHandle={selectedHandle}
            onSelect={setSelectedHandle}
          />

          <DatasetCard
            filename={filename}
            handleLabel={selectedCreator.displayHandle || selectedCreator.handle}
            summary={summary}
            transcribeTopN={TRANSCRIBE_TOP_N}
            onChangeFile={() => inputRef.current?.click()}
            classification={classification}
            posts={rowsForCharts}
            hasTranscripts={hasTranscripts}
            busy={busy}
          />

          {error && curStage === PER_STAGE.ERROR && (
            <div className="panel p-4 mt-2 mb-6 border-red-500/50 bg-red-500/5 text-red-300 text-sm">
              {error}
            </div>
          )}

          <ActionButtons
            disabled={!canActOnDataset}
            busy={busy}
            scriptCount={scriptCount}
            activeTab={activeTab}
            onInsights={() => setActiveTab("insights")}
            onRunFramework={() => setActiveTab("framework")}
            onGenerateScripts={() =>
              setConfirmIntent({ kind: "scripts", handle: selectedHandle })
            }
            onSaveTranscripts={
              hasTranscripts
                ? () => downloadTranscriptsTxt(rowsForCharts, handleForCharts)
                : null
            }
          />

          <Tabs
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            hasInsights={rowsForCharts.length > 0}
            onExport={(kind) => {
              if (kind === "insights-csv")
                downloadInsightsCsv(rowsForCharts, baseName);
              if (kind === "transcribed-csv")
                downloadEnrichedCsv(rowsForCharts, baseName);
            }}
            exportEnabled={{
              "insights-csv": rowsForCharts.length > 0,
              "transcribed-csv": !!cur.enrichedRows,
            }}
          />

          {activeTab === "dataset" && (
            <DatasetPreview
              rows={rowsForCharts}
              rawColumns={parsed?.summary?.rawColumns}
            />
          )}

          {activeTab === "insights" && rowsForCharts.length > 0 && (
            <InsightsPanel rows={rowsForCharts} />
          )}

          {activeTab === "framework" && (
            <>
              {curStage === PER_STAGE.TRANSCRIBING && (
                <TranscribePanel progress={cur.transcribeProgress} />
              )}

              {curStage === PER_STAGE.ANALYZING && (
                <StreamingStrip
                  analyzeMode={cur.analyzeMode}
                  bufferedChars={
                    (cur.framework?.part1?.length || 0) +
                    (cur.framework?.part2?.length || 0) +
                    (cur.framework?.part3?.length || 0)
                  }
                />
              )}

              {hasFramework && (
                <FrameworkTabs
                  framework={cur.framework}
                  handle={handleForCharts}
                  streaming={curStage === PER_STAGE.ANALYZING}
                  initialPart={
                    cur.analyzeMode === "scripts-only" ? "part3" : "part1"
                  }
                />
              )}

              {!hasFramework &&
                curStage !== PER_STAGE.ANALYZING &&
                curStage !== PER_STAGE.TRANSCRIBING && (
                  <FrameworkChoice
                    disabled={!canActOnDataset}
                    willTranscribe={!!summary?.audioField && !hasTranscripts}
                    onPick={(mode) => runConfirmed(mode)}
                  />
                )}

              {curStage === PER_STAGE.DONE && cur.usage && (
                <div className="text-[11px] text-slate-500 mt-3 text-right font-mono">
                  {cur.usage.input_tokens?.toLocaleString()} in /{" "}
                  {cur.usage.output_tokens?.toLocaleString()} out
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}

// ---------- subcomponents ----------

function ApiOfflineBanner({ error, onOpenSettings }) {
  return (
    <div className="panel p-4 mb-6 border-red-500/40 bg-red-500/5 flex items-start gap-3">
      <ShieldAlert size={20} className="text-red-400 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-red-300 font-semibold text-sm">
          Backend APIs are offline
        </div>
        <div className="text-xs text-red-300/80 mt-1">
          {error || "Unable to reach the analysis backend."} Dataset uploads
          and analysis are disabled until the server can verify{" "}
          <span className="font-mono">ANTHROPIC_API_KEY</span>.
        </div>
      </div>
      <button onClick={onOpenSettings} className="btn-vibe-ghost text-xs shrink-0">
        Open Settings
      </button>
    </div>
  );
}

function UploadZone({
  dragActive,
  setDragActive,
  onDrop,
  onPick,
  parsing,
  error,
  disabled,
}) {
  return (
    <div className="text-center py-6">
      <div className="mb-10">
        <div className="inline-block text-[11px] uppercase tracking-[0.22em] text-vibe-purple font-semibold mb-3">
          Framework Dashboard
        </div>
        <h1 className="font-serif text-3xl md:text-4xl mb-3 leading-tight text-white">
          Run your <span className="vibe-text font-bold">framework</span>
        </h1>
        <p className="text-sm text-slate-400 max-w-2xl mx-auto leading-relaxed">
          Drop your Apify Instagram Sort Feed CSV. If it contains multiple
          creators, we'll split them into separate dashboards automatically.
        </p>
      </div>

      <div
        onClick={disabled ? undefined : onPick}
        onDragOver={(e) => {
          if (disabled) return;
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={disabled ? undefined : onDrop}
        className={`panel panel-hover p-12 transition-all max-w-2xl mx-auto ${
          disabled
            ? "opacity-40 cursor-not-allowed"
            : `cursor-pointer ${
                dragActive
                  ? "border-vibe-pink/60 bg-ink-800 scale-[1.01]"
                  : ""
              }`
        }`}
        style={
          dragActive
            ? { boxShadow: "0 24px 48px -16px rgba(236,72,153,0.35)" }
            : undefined
        }
      >
        <div
          className="mx-auto w-14 h-14 rounded-full grid place-items-center mb-4"
          style={{
            background:
              "linear-gradient(135deg, rgba(236,72,153,0.15), rgba(168,85,247,0.15))",
            border: "1.5px solid rgba(168,85,247,0.5)",
          }}
        >
          <Upload className="w-6 h-6 text-vibe-pink" strokeWidth={1.8} />
        </div>
        <div className="font-serif text-xl mb-1 text-white">
          {disabled
            ? "Backend offline — uploads disabled"
            : parsing
            ? "Parsing CSV…"
            : "Drop your Apify Instagram CSV here"}
        </div>
        <div className="text-sm text-slate-400">
          {disabled
            ? "Open Settings to recheck API status"
            : parsing
            ? "Extracting fields and detecting audio URLs"
            : "or click to browse — .csv files only"}
        </div>
      </div>

      {error && <div className="mt-4 text-sm text-red-300">{error}</div>}
    </div>
  );
}

function DatasetCard({
  filename,
  handleLabel,
  summary,
  classification,
  posts,
  hasTranscripts,
  transcribeTopN,
  onChangeFile,
  busy,
}) {
  const audioField = summary?.audioField;
  const captionPct = summary?.captionCoveragePct ?? 0;

  return (
    <div className="panel p-6 mb-4 relative overflow-hidden">
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(236,72,153,0.6), rgba(168,85,247,0.6), transparent)",
        }}
      />
      <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] text-slate-500 uppercase tracking-[0.22em] mb-1 font-semibold">
            Dataset · @{handleLabel}
          </div>
          <div className="font-serif text-xl vibe-text font-bold break-all">
            {filename}
          </div>
          {classification && (
            <DatasetBadge classification={classification} posts={posts} />
          )}
        </div>
        <button
          onClick={onChangeFile}
          className="btn-vibe-ghost text-sm"
          disabled={busy}
        >
          Change file
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <Stat
          icon={LayersIcon}
          label="Posts"
          value={summary?.totalPosts ?? "—"}
          hue="#EC4899"
        />
        <Stat
          icon={Hash}
          label="Captions"
          value={`${captionPct}%`}
          hue="#A855F7"
        />
        <Stat
          icon={Mic}
          label="Transcripts"
          value={
            hasTranscripts
              ? `${summary?.transcriptCoveragePct ?? 0}%`
              : "0%"
          }
          hue="#6366F1"
        />
        <Stat
          icon={Eye}
          label="View data"
          value={`${summary?.viewCoveragePct ?? 0}%`}
          hue="#3B82F6"
        />
      </div>

      <div className="mt-4 text-xs text-slate-400 space-y-1">
        {audioField ? (
          <div>
            <span className="text-slate-500">Audio URL field:</span>{" "}
            <span className="text-vibe-pink font-mono">{audioField}</span>
            <span className="text-slate-600 mx-2">·</span>
            <span className="text-slate-300">
              top {transcribeTopN} most-engaged reels will be transcribed when
              you start a run
            </span>
          </div>
        ) : (
          <div className="text-amber-300/80">
            No audio URL column detected — analysis will run on captions only.
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, hue = "#A855F7" }) {
  return (
    <div className="bg-ink-800/80 border border-white/10 rounded-lg p-3 relative overflow-hidden">
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{
          background: `linear-gradient(90deg, transparent, ${hue}, transparent)`,
        }}
      />
      <div className="flex items-center gap-1.5 text-[10px] text-slate-500 uppercase tracking-[0.18em] font-semibold">
        {Icon && <Icon size={11} style={{ color: hue }} />}
        {label}
      </div>
      <div
        className="text-lg font-semibold mt-1"
        style={{ color: hue }}
      >
        {value}
      </div>
    </div>
  );
}

function ActionButtons({
  disabled,
  busy,
  scriptCount,
  activeTab,
  onInsights,
  onRunFramework,
  onGenerateScripts,
  onSaveTranscripts,
}) {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
      <ActionButton
        icon={BarChart3}
        title="Insights"
        subtitle="Top 10, charts, tiers"
        onClick={onInsights}
        active={activeTab === "insights"}
        disabled={busy}
        accent="#3B82F6"
      />
      <ActionButton
        icon={Sparkles}
        title="Run Framework Analysis"
        subtitle="Pick Fast (≈40s) or Deep (1–3 min)"
        onClick={onRunFramework}
        disabled={disabled}
        primary
        loading={busy}
      />
      <ActionButton
        icon={PenLine}
        title="Generate Script Variations"
        subtitle={`${scriptCount} script${scriptCount > 1 ? "s" : ""} · skips Parts 1 & 2`}
        onClick={onGenerateScripts}
        disabled={disabled}
        accent="#FBBF24"
      />
      {onSaveTranscripts && (
        <ActionButton
          icon={Save}
          title="Save Transcripts"
          subtitle="Top reels · .txt"
          onClick={onSaveTranscripts}
          disabled={busy}
          accent="#A855F7"
        />
      )}
    </div>
  );
}

function ActionButton({
  icon: Icon,
  title,
  subtitle,
  onClick,
  disabled,
  primary,
  accent,
  active,
  loading,
}) {
  const accentColor = accent || "#A855F7";
  const baseClass = primary
    ? "border text-white"
    : active
    ? "panel border-white/20"
    : "panel panel-hover";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`text-left p-4 rounded-xl ${baseClass} transition-all relative overflow-hidden disabled:opacity-40 disabled:cursor-not-allowed`}
      style={
        primary
          ? {
              background: "linear-gradient(135deg, #EC4899 0%, #A855F7 100%)",
              borderColor: "rgba(236,72,153,0.6)",
              boxShadow: "0 12px 32px -12px rgba(236,72,153,0.5)",
            }
          : !active
          ? { borderColor: `${accentColor}40` }
          : undefined
      }
    >
      <div className="flex items-center gap-3">
        <div
          className={`w-10 h-10 rounded-lg grid place-items-center shrink-0 ${
            primary ? "bg-white/15" : ""
          }`}
          style={
            !primary
              ? { backgroundColor: `${accentColor}20`, color: accentColor }
              : undefined
          }
        >
          <Icon size={18} strokeWidth={2} />
        </div>
        <div className="min-w-0">
          <div
            className={`font-semibold text-sm ${
              primary ? "text-white" : "text-slate-100"
            }`}
          >
            {loading ? "Working…" : title}
          </div>
          <div
            className={`text-xs mt-0.5 ${
              primary ? "text-white/80" : "text-slate-400"
            }`}
          >
            {subtitle}
          </div>
        </div>
      </div>
    </button>
  );
}

function DatasetPreview({ rows, rawColumns }) {
  const [showAll, setShowAll] = useState(false);
  const visibleRows = showAll ? rows : rows.slice(0, 25);

  const columns = useMemo(() => {
    if (!rows.length) return [];
    const allKeys = [...new Set(rows.flatMap((r) => Object.keys(r)))]
      .filter((k) => !k.startsWith("_") && k !== "transcript")
      .filter((k) => k !== "reel-transcript");
    const preferred = [
      "id",
      "shortCode",
      "url",
      "caption",
      "videoViewCount",
      "videoPlayCount",
      "likesCount",
      "commentsCount",
      "videoDuration",
      "timestamp",
      "productType",
      "type",
    ];
    const ordered = [
      ...preferred.filter((k) => allKeys.includes(k)),
      ...allKeys.filter((k) => !preferred.includes(k)),
    ];
    return ordered;
  }, [rows]);

  return (
    <div className="panel p-0 overflow-hidden">
      <div className="px-5 py-3 border-b border-white/10 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ListChecks size={14} className="text-vibe-pink" />
          <div className="font-serif text-base text-white">Dataset preview</div>
          <span className="text-xs text-slate-500">
            · {rows.length} rows · {columns.length} columns shown
            {rawColumns?.length ? ` of ${rawColumns.length} total` : ""}
          </span>
        </div>
        {rows.length > 25 && (
          <button
            onClick={() => setShowAll((s) => !s)}
            className="text-xs text-vibe-pink hover:text-pink-300 underline-offset-2 hover:underline"
          >
            {showAll ? `Show first 25` : `Show all ${rows.length}`}
          </button>
        )}
      </div>

      <div className="overflow-auto max-h-[60vh]">
        <table className="w-full text-xs font-mono">
          <thead className="sticky top-0 bg-ink-900/95 backdrop-blur z-[1]">
            <tr>
              <th className="text-left px-3 py-2 text-vibe-pink font-semibold border-b border-white/10 w-10">
                #
              </th>
              {columns.map((col) => (
                <th
                  key={col}
                  className="text-left px-3 py-2 text-vibe-pink font-semibold border-b border-white/10 whitespace-nowrap"
                  title={col}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, i) => (
              <tr
                key={i}
                className="hover:bg-white/[0.03] border-b border-white/[0.04]"
              >
                <td className="px-3 py-2 text-slate-600">{i + 1}</td>
                {columns.map((col) => (
                  <td key={col} className="px-3 py-2 text-slate-300 align-top">
                    <Cell value={row[col]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length === 0 && (
        <div className="px-5 py-8 text-center text-sm text-slate-500">
          No rows parsed from the CSV.
        </div>
      )}
    </div>
  );
}

function Cell({ value }) {
  if (value == null || value === "") {
    return <span className="text-slate-700">—</span>;
  }
  const str = String(value);
  if (str.length > 140) {
    return (
      <span title={str}>
        {str.slice(0, 137)}
        <span className="text-slate-600">…</span>
      </span>
    );
  }
  return <span>{str}</span>;
}

function FrameworkChoice({ disabled, willTranscribe, onPick }) {
  return (
    <div className="panel p-6 md:p-8">
      <div className="text-center max-w-lg mx-auto mb-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-vibe-purple/15 border border-vibe-purple/40 text-[10px] uppercase tracking-widest text-vibe-pink font-semibold mb-4">
          <Sparkles size={12} />
          Run Framework Analysis
        </div>
        <h2 className="font-serif text-2xl vibe-text font-bold mb-2">
          Pick your analysis depth
        </h2>
        <p className="text-sm text-slate-400 leading-relaxed">
          Click a button below to start. The page will lock while the agent
          works — no partial output, you&rsquo;ll see the full report when
          it&rsquo;s ready.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-3 max-w-3xl mx-auto">
        <ChoiceCard
          icon={Zap}
          label="Fast Analysis"
          accent="#FBBF24"
          eta="≈ 40 seconds"
          description="Four layers: top performance signals, dominant hooks, structural beats, and topic ranking. One tight read."
          bullets={[
            "4 layers · single page",
            "Skips language + emotion",
            "Best for a quick read",
          ]}
          disabled={disabled}
          onClick={() => onPick("fast")}
        />
        <ChoiceCard
          icon={Sparkles}
          label="Deep Analysis"
          accent="#EC4899"
          eta="1–3 minutes"
          description="Full six-layer breakdown: performance, language, hooks, structure, emotion, topics — plus three replicable script blueprints."
          bullets={[
            "6 layers · 3 parts",
            "Hook intelligence + gaps",
            "Reel structure + emotional blueprint",
          ]}
          disabled={disabled}
          primary
          onClick={() => onPick("full")}
        />
      </div>

      {willTranscribe && (
        <div className="mt-5 max-w-3xl mx-auto text-[11px] text-amber-300/80 bg-amber-500/10 border border-amber-500/30 rounded-md p-3">
          Top 5 most-engaged reels will be transcribed first (Groq Whisper).
          This adds ~10–20s before generation starts.
        </div>
      )}
    </div>
  );
}

function ChoiceCard({
  icon: Icon,
  label,
  accent,
  eta,
  description,
  bullets,
  disabled,
  primary,
  onClick,
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="relative group text-left p-5 rounded-xl border transition-all overflow-hidden disabled:opacity-40 disabled:cursor-not-allowed"
      style={
        primary
          ? {
              background:
                "linear-gradient(135deg, rgba(236,72,153,0.18), rgba(168,85,247,0.15))",
              borderColor: "rgba(236,72,153,0.5)",
              boxShadow: "0 16px 40px -16px rgba(236,72,153,0.35)",
            }
          : {
              background: "rgba(255,255,255,0.02)",
              borderColor: `${accent}40`,
            }
      }
    >
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-11 h-11 rounded-lg grid place-items-center"
          style={{ backgroundColor: `${accent}25`, color: accent }}
        >
          <Icon size={20} strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-serif text-lg" style={{ color: accent }}>
            {label}
          </div>
          <div className="text-[11px] text-slate-400 font-mono">{eta}</div>
        </div>
        <Lock
          size={14}
          className="text-slate-600 group-hover:text-white transition-colors"
        />
      </div>

      <p className="text-xs text-slate-300 leading-relaxed mb-3">
        {description}
      </p>

      <ul className="space-y-1 text-[11px] text-slate-400">
        {bullets.map((b) => (
          <li key={b} className="flex items-center gap-2">
            <span
              className="w-1 h-1 rounded-full shrink-0"
              style={{ backgroundColor: accent }}
            />
            {b}
          </li>
        ))}
      </ul>
    </button>
  );
}

function ScriptsConfirmModal({
  scriptCount,
  willTranscribe,
  onCancel,
  onConfirm,
}) {
  return (
    <ModalShell title="Generate Script Variations" onCancel={onCancel}>
      <p className="text-sm text-slate-300 leading-relaxed mb-4">
        The agent will skip Parts 1 & 2 and produce{" "}
        <span className="text-vibe-pink font-semibold">{scriptCount}</span>{" "}
        replicable script blueprint{scriptCount > 1 ? "s" : ""} (Part 3 only).
        Once confirmed,{" "}
        <span className="text-vibe-pink font-semibold">
          the page will be locked
        </span>{" "}
        until the scripts are ready.
      </p>

      <div className="text-xs text-slate-400 mb-4 space-y-1">
        <div>
          Estimated wait:{" "}
          <span className="text-vibe-pink font-mono">20–40 seconds</span>
        </div>
        <div>
          Adjust the count in{" "}
          <span className="text-slate-300">Settings → Generation</span>.
        </div>
      </div>

      {willTranscribe && (
        <div className="text-[11px] text-amber-300/80 bg-amber-500/10 border border-amber-500/30 rounded-md p-3 mb-4">
          Top reels will be transcribed first (Groq Whisper). Adds ~10–20s.
        </div>
      )}

      <ModalActions onCancel={onCancel}>
        <button
          className="btn-vibe text-sm"
          onClick={() => onConfirm("scripts-only")}
        >
          <Lock size={14} />
          Confirm Generating
        </button>
      </ModalActions>
    </ModalShell>
  );
}

function ModalShell({ title, onCancel, children }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center px-4">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden
      />
      <div
        role="dialog"
        aria-label={title}
        className="relative w-full max-w-md panel-elevated p-5"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="font-serif text-lg vibe-text font-bold">{title}</div>
          <button
            onClick={onCancel}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/10"
            aria-label="Cancel"
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalActions({ onCancel, children }) {
  return (
    <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
      <button onClick={onCancel} className="btn-vibe-ghost text-sm">
        Cancel
      </button>
      {children}
    </div>
  );
}

function StreamingStrip({ analyzeMode, bufferedChars }) {
  const titles = {
    fast: "Generating Fast Analysis",
    "scripts-only": "Generating Script Variations",
    full: "Generating Deep Analysis",
  };
  const etas = {
    fast: "≈ 40 seconds",
    "scripts-only": "20–40 seconds",
    full: "1–3 minutes",
  };
  const title = titles[analyzeMode] || "Generating Framework";
  const eta = etas[analyzeMode] || "1–3 minutes";

  return (
    <div
      className="panel p-4 mb-4"
      style={{
        background:
          "linear-gradient(135deg, rgba(236,72,153,0.10), rgba(168,85,247,0.10))",
        borderColor: "rgba(236,72,153,0.4)",
      }}
    >
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full bg-vibe-pink animate-pulse shrink-0" />
          <div className="font-serif text-sm vibe-text font-bold truncate">
            {title}
          </div>
          <span className="text-[10px] uppercase tracking-widest font-bold text-vibe-pink px-1.5 py-0.5 rounded bg-vibe-pink/15 border border-vibe-pink/40 shrink-0">
            LIVE
          </span>
        </div>
        <div className="text-[11px] font-mono text-slate-400 shrink-0">
          {bufferedChars.toLocaleString()} chars · ETA {eta}
        </div>
      </div>
      <p className="text-xs text-slate-300 leading-relaxed mb-2">
        Streaming live — read the report below as it&rsquo;s written. You can
        switch tabs and scroll while generation continues.
      </p>
      <div className="h-1.5 rounded-full overflow-hidden border border-white/10 bg-ink-800 relative">
        <div
          className="absolute inset-y-0 left-0 w-1/3 rounded-full progress-stream"
          style={{
            background: "linear-gradient(90deg, #EC4899, #A855F7)",
          }}
        />
      </div>
    </div>
  );
}

function TranscribePanel({ progress }) {
  const total = progress?.total || 0;
  const completed = progress?.completed || 0;
  const failed = progress?.failed || 0;
  const pct = total ? Math.round((completed / total) * 100) : 0;
  return (
    <div className="panel p-6 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="font-serif text-lg vibe-text font-bold flex items-center gap-2">
            <Mic size={16} /> Transcribing top reels
          </div>
          <div className="text-xs text-slate-400 mt-1">
            {progress?.strategy || "Top engagement (likes + comments)"}
            {progress?.model && (
              <>
                {" "}·{" "}
                <span className="text-vibe-pink font-mono">
                  {progress.model}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-serif vibe-text font-bold leading-none">
            {completed} / {total}
          </div>
          {failed > 0 && (
            <div className="text-xs text-red-300 mt-1">{failed} failed</div>
          )}
        </div>
      </div>
      <div className="h-2 bg-ink-800 rounded-full overflow-hidden border border-white/10">
        <div
          className="h-full transition-all"
          style={{
            width: `${pct}%`,
            background: "linear-gradient(90deg, #EC4899, #A855F7)",
          }}
        />
      </div>
    </div>
  );
}

function Tabs({ activeTab, setActiveTab, hasInsights, onExport, exportEnabled }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-6 border-b border-white/10">
      <div className="flex">
        <TabButton
          active={activeTab === "dataset"}
          onClick={() => setActiveTab("dataset")}
        >
          <LayersIcon size={14} /> Dataset
        </TabButton>
        <TabButton
          active={activeTab === "insights"}
          disabled={!hasInsights}
          onClick={() => setActiveTab("insights")}
        >
          <TrendingUp size={14} /> Insights
        </TabButton>
        <TabButton
          active={activeTab === "framework"}
          onClick={() => setActiveTab("framework")}
        >
          <Sparkles size={14} /> Framework
        </TabButton>
      </div>
      <ExportMenu onExport={onExport} enabled={exportEnabled} />
    </div>
  );
}

function TabButton({ active, disabled, onClick, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative px-4 py-2.5 text-sm font-medium transition-colors -mb-px inline-flex items-center gap-2 ${
        active ? "text-white" : "text-slate-400 hover:text-slate-200"
      } disabled:opacity-30 disabled:cursor-not-allowed`}
    >
      {children}
      {active && (
        <span
          className="absolute left-2 right-2 -bottom-px h-[2px] rounded-full"
          style={{
            background: "linear-gradient(90deg, #EC4899, #A855F7)",
          }}
        />
      )}
    </button>
  );
}

function ExportMenu({ onExport, enabled }) {
  const [open, setOpen] = useState(false);
  const items = [
    {
      key: "insights-csv",
      icon: FileSpreadsheet,
      label: "Insights CSV",
      note: "Top posts, charts data",
    },
    {
      key: "transcribed-csv",
      icon: FileSpreadsheet,
      label: "Transcribed CSV",
      note: "Original + reel-transcript",
    },
  ];
  const anyEnabled = items.some((it) => enabled[it.key]);
  return (
    <div className="relative pb-2">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={!anyEnabled}
        className="btn-vibe-ghost text-sm"
      >
        <Download size={14} />
        Dataset export
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-72 panel-elevated p-2 z-20">
            {items.map((it) => (
              <button
                key={it.key}
                disabled={!enabled[it.key]}
                onClick={() => {
                  setOpen(false);
                  onExport(it.key);
                }}
                className="w-full text-left px-3 py-2.5 rounded hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-start gap-3"
              >
                <it.icon size={16} className="text-vibe-pink mt-0.5" />
                <div>
                  <div className="text-sm text-white font-medium">
                    {it.label}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">{it.note}</div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
