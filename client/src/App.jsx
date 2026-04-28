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
  Settings as SettingsIcon,
  BarChart3,
  PenLine,
  ShieldAlert,
  Save,
  Zap,
  ListChecks,
  X,
  Lock,
} from "lucide-react";
import InsightsPanel from "./components/InsightsPanel.jsx";
import DatasetBadge from "./components/DatasetBadge.jsx";
import FrameworkTabs from "./components/FrameworkTabs.jsx";
import SettingsDrawer from "./components/SettingsDrawer.jsx";
import { useApiHealth, API_STATE } from "./components/ApiStatus.jsx";
import { classifyDataset, detectHandle } from "./lib/datasetClassifier.js";
import { splitFrameworkStream } from "./lib/frameworkParser.js";
import {
  downloadEnrichedCsv,
  downloadInsightsCsv,
  downloadTranscriptsTxt,
} from "./lib/exporters.js";

const STAGE = {
  IDLE: "idle",
  PARSING: "parsing",
  READY: "ready",
  TRANSCRIBING: "transcribing",
  ANALYZING: "analyzing",
  DONE: "done",
  ERROR: "error",
};

const TRANSCRIBE_TOP_N = 5;
const TRANSCRIPT_KEY = "reel-transcript";

export default function App() {
  const health = useApiHealth();
  const [stage, setStage] = useState(STAGE.IDLE);
  const [filename, setFilename] = useState("");
  const [parsed, setParsed] = useState(null);
  const [enrichedRows, setEnrichedRows] = useState(null);
  const [framework, setFramework] = useState(null);
  const [analyzeMode, setAnalyzeMode] = useState("full"); // "full" | "fast" | "scripts-only"
  const [error, setError] = useState("");
  const [usage, setUsage] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [transcribeProgress, setTranscribeProgress] = useState(null);
  const [activeTab, setActiveTab] = useState("dataset");
  const [scriptCount, setScriptCount] = useState(3);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // confirmIntent: null | { kind: "framework" | "scripts", mode?: "fast"|"full" }
  const [confirmIntent, setConfirmIntent] = useState(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);

  const apiBlocked = health.state === API_STATE.OFFLINE;

  const reset = () => {
    abortRef.current?.abort();
    setStage(STAGE.IDLE);
    setFilename("");
    setParsed(null);
    setEnrichedRows(null);
    setFramework(null);
    setError("");
    setUsage(null);
    setTranscribeProgress(null);
    setActiveTab("dataset");
    setAnalyzeMode("full");
    setConfirmIntent(null);
  };

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

  const runTranscribe = async (rowsIn) => {
    setStage(STAGE.TRANSCRIBING);
    setTranscribeProgress({ completed: 0, total: 0, failed: 0 });
    const controller = new AbortController();
    abortRef.current = controller;

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
        setTranscribeProgress({
          completed: 0,
          total: payload.total,
          failed: 0,
          skipped: payload.skipped,
          audioField: payload.audioField,
          model: payload.model,
          strategy: payload.strategy,
        });
      } else if (event === "progress") {
        if (!payload.ok) failed++;
        setTranscribeProgress((p) => ({ ...p, completed: payload.completed, failed }));
      } else if (event === "done") {
        resultRows = payload.rows;
        setTranscribeProgress((p) => ({
          ...p,
          completed: payload.transcribed + payload.failed,
          failed: payload.failed,
        }));
      } else if (event === "error") {
        throw new Error(payload.message || "Transcribe error");
      }
    });

    return resultRows;
  };

  const runAnalyze = async (rowsIn, fnameOverride, mode) => {
    setStage(STAGE.ANALYZING);
    setFramework(null);
    setUsage(null);
    setActiveTab("framework");
    setAnalyzeMode(mode);
    const controller = new AbortController();
    abortRef.current = controller;

    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rows: rowsIn,
        filename: fnameOverride || filename,
        scriptCount,
        mode,
      }),
      signal: controller.signal,
    });
    if (!res.ok || !res.body) {
      const txt = await res.text().catch(() => "");
      throw new Error(txt || `Analyze failed (HTTP ${res.status})`);
    }

    let buffered = "";
    // Throttle setFramework updates so we re-render at most every ~120ms while
    // tokens stream in (avoids re-flowing markdown on every single token).
    let lastFlush = 0;
    const flush = (force = false) => {
      const now = Date.now();
      if (!force && now - lastFlush < 120) return;
      lastFlush = now;
      setFramework(splitFrameworkStream(buffered));
    };

    await consumeSSE(res, (event, payload) => {
      if (event === "delta") {
        buffered += payload.text;
        flush();
      } else if (event === "done") {
        flush(true);
        setUsage(payload.usage);
        setStage(STAGE.DONE);
      } else if (event === "error") {
        throw new Error(payload.message || "Analyze error");
      }
    });

    setStage((s) => (s === STAGE.ANALYZING ? STAGE.DONE : s));
  };

  const handleFile = useCallback(
    async (file) => {
      if (!file) return;
      if (apiBlocked) {
        setError("Cannot upload — backend APIs are offline. Open Settings to recheck.");
        setStage(STAGE.ERROR);
        return;
      }
      if (!/\.csv$/i.test(file.name)) {
        setError("Please upload a .csv file.");
        setStage(STAGE.ERROR);
        return;
      }
      setError("");
      setFramework(null);
      setUsage(null);
      setEnrichedRows(null);
      setTranscribeProgress(null);
      setFilename(file.name);
      setStage(STAGE.PARSING);

      const fd = new FormData();
      fd.append("file", file);
      try {
        const res = await fetch("/api/parse", { method: "POST", body: fd });
        const parsedData = await res.json();
        if (!res.ok) throw new Error(parsedData.error || "Parse failed");
        setParsed(parsedData);
        setStage(STAGE.READY);
        setActiveTab("dataset");
      } catch (e) {
        setError(e.message);
        setStage(STAGE.ERROR);
      }
    },
    [apiBlocked]
  );

  // Confirmed run — called after the user confirms the modal.
  const runConfirmed = async (mode) => {
    setConfirmIntent(null);
    if (!parsed) return;
    if (apiBlocked) {
      setError("Backend offline. Open Settings to recheck.");
      setStage(STAGE.ERROR);
      return;
    }

    // Re-verify health right before kicking off.
    try {
      const ping = await fetch("/api/health", { cache: "no-store" });
      const data = await ping.json();
      const anthropicOk = data.services?.anthropic?.configured ?? data.anthropicConfigured;
      if (!anthropicOk) {
        setError("Anthropic API key not configured on server.");
        setStage(STAGE.ERROR);
        return;
      }
    } catch (e) {
      setError(`Health check failed: ${e.message}`);
      setStage(STAGE.ERROR);
      return;
    }

    try {
      let rows = enrichedRows || parsed.rows;
      const audioField = parsed.summary?.audioField;
      const needsTranscribe =
        !!audioField && rows.some((r) => r._audioUrl && !r[TRANSCRIPT_KEY]);

      if (needsTranscribe) {
        rows = await runTranscribe(rows);
        setEnrichedRows(rows);
      }

      await runAnalyze(rows, parsed.filename, mode);
    } catch (e) {
      if (e.name === "AbortError") return;
      setError(e.message);
      setStage(STAGE.ERROR);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    handleFile(e.dataTransfer.files?.[0]);
  };

  const baseName = (filename || "swh-framework").replace(/\.csv$/i, "");
  const rowsForCharts = enrichedRows || parsed?.rows || [];
  const summary = parsed?.summary;
  const showWorkspace = parsed && stage !== STAGE.PARSING;

  const classification = useMemo(
    () => (rowsForCharts.length ? classifyDataset(rowsForCharts) : null),
    [rowsForCharts]
  );
  const handle = useMemo(
    () => (rowsForCharts.length ? detectHandle(rowsForCharts) : "creator"),
    [rowsForCharts]
  );

  const busy = stage === STAGE.TRANSCRIBING || stage === STAGE.ANALYZING;
  const canActOnDataset = !!parsed && !busy && !apiBlocked;
  const hasFramework = !!framework;
  const hasTranscripts = rowsForCharts.some(
    (r) => r[TRANSCRIPT_KEY] && String(r[TRANSCRIPT_KEY]).trim()
  );

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        onReset={reset}
        canReset={stage !== STAGE.IDLE}
        onOpenSettings={() => setSettingsOpen(true)}
        healthState={health.state}
      />

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        scriptCount={scriptCount}
        setScriptCount={setScriptCount}
        health={health}
      />

      {confirmIntent && confirmIntent.kind === "scripts" && (
        <ScriptsConfirmModal
          scriptCount={scriptCount}
          willTranscribe={!!summary?.audioField && !hasTranscripts}
          onCancel={() => setConfirmIntent(null)}
          onConfirm={(mode) => runConfirmed(mode)}
        />
      )}

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-10">
        {apiBlocked && (
          <ApiOfflineBanner
            error={health.error}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        )}

        {!parsed && (
          <UploadZone
            dragActive={dragActive}
            setDragActive={setDragActive}
            onDrop={onDrop}
            onPick={() => inputRef.current?.click()}
            stage={stage}
            error={error}
            disabled={apiBlocked}
          />
        )}

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
            <DatasetCard
              filename={filename}
              summary={summary}
              transcribeTopN={TRANSCRIBE_TOP_N}
              onChangeFile={() => inputRef.current?.click()}
              classification={classification}
              posts={rowsForCharts}
              hasTranscripts={hasTranscripts}
              busy={busy}
            />

            {error && stage === STAGE.ERROR && (
              <div className="card p-4 mt-2 mb-6 border-red-500/40 text-red-300 text-sm">
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
              onGenerateScripts={() => setConfirmIntent({ kind: "scripts" })}
              onSaveTranscripts={
                hasTranscripts ? () => downloadTranscriptsTxt(rowsForCharts, handle) : null
              }
            />

            <Tabs
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              hasInsights={rowsForCharts.length > 0}
              onExport={(kind) => {
                if (kind === "insights-csv") downloadInsightsCsv(rowsForCharts, baseName);
                if (kind === "transcribed-csv") downloadEnrichedCsv(rowsForCharts, baseName);
              }}
              exportEnabled={{
                "insights-csv": rowsForCharts.length > 0,
                "transcribed-csv": !!enrichedRows,
              }}
            />

            {activeTab === "dataset" && (
              <DatasetPreview rows={rowsForCharts} rawColumns={summary?.rawColumns} />
            )}

            {activeTab === "insights" && rowsForCharts.length > 0 && (
              <InsightsPanel rows={rowsForCharts} />
            )}

            {activeTab === "framework" && (
              <>
                {stage === STAGE.TRANSCRIBING && (
                  <TranscribePanel progress={transcribeProgress} />
                )}

                {stage === STAGE.ANALYZING && (
                  <StreamingStrip
                    analyzeMode={analyzeMode}
                    streaming={true}
                    bufferedChars={
                      (framework?.part1?.length || 0) +
                      (framework?.part2?.length || 0) +
                      (framework?.part3?.length || 0)
                    }
                  />
                )}

                {hasFramework && (
                  <FrameworkTabs
                    framework={framework}
                    handle={handle}
                    streaming={stage === STAGE.ANALYZING}
                    initialPart={analyzeMode === "scripts-only" ? "part3" : "part1"}
                  />
                )}

                {!hasFramework && stage !== STAGE.ANALYZING && stage !== STAGE.TRANSCRIBING && (
                  <FrameworkChoice
                    disabled={!canActOnDataset}
                    willTranscribe={!!summary?.audioField && !hasTranscripts}
                    onPick={(mode) => runConfirmed(mode)}
                  />
                )}

                {stage === STAGE.DONE && usage && (
                  <div className="text-[11px] text-slate-500 mt-3 text-right font-mono">
                    {usage.input_tokens?.toLocaleString()} in /{" "}
                    {usage.output_tokens?.toLocaleString()} out
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}

// ----- subcomponents -----

function Header({ onReset, canReset, onOpenSettings, healthState }) {
  // The header no longer shows the full status pill — just a small dot
  // when the API is in trouble, so the user knows to open Settings.
  const dotColor =
    healthState === API_STATE.ONLINE
      ? null
      : healthState === API_STATE.DEGRADED
      ? "#F39C12"
      : healthState === API_STATE.OFFLINE
      ? "#E74C3C"
      : "#8892A4";

  return (
    <header className="border-b border-gold-500/15 bg-navy-950/70 backdrop-blur sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-gold-500 text-navy-950 font-serif font-bold text-xl grid place-items-center shrink-0">
            S
          </div>
          <div className="min-w-0">
            <div className="font-serif text-lg leading-none gold-text">SWH</div>
            <div className="text-[10px] text-slate-400 tracking-[0.2em] uppercase mt-0.5">
              Instagram Framework Builder
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {canReset && (
            <button onClick={onReset} className="btn-ghost text-sm">
              New Analysis
            </button>
          )}
          <button
            onClick={onOpenSettings}
            className="relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-gold-500/25 text-slate-200 hover:bg-gold-500/10 hover:border-gold-500/45 text-sm transition-colors"
            aria-label="Open settings"
          >
            <SettingsIcon size={14} />
            <span className="hidden sm:inline">Settings</span>
            {dotColor && (
              <span
                className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-navy-950"
                style={{ backgroundColor: dotColor }}
                aria-hidden
              />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}

function ApiOfflineBanner({ error, onOpenSettings }) {
  return (
    <div className="card p-4 mb-6 border-red-500/40 bg-red-500/5 flex items-start gap-3">
      <ShieldAlert size={20} className="text-red-400 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-red-300 font-semibold text-sm">Backend APIs are offline</div>
        <div className="text-xs text-red-300/80 mt-1">
          {error || "Unable to reach the analysis backend."} Dataset uploads and analysis are
          disabled until the server can verify <span className="font-mono">ANTHROPIC_API_KEY</span>.
        </div>
      </div>
      <button onClick={onOpenSettings} className="btn-ghost text-xs shrink-0">
        Open Settings
      </button>
    </div>
  );
}

function UploadZone({ dragActive, setDragActive, onDrop, onPick, stage, error, disabled }) {
  const parsing = stage === STAGE.PARSING;
  return (
    <div className="text-center py-6">
      <h1 className="font-serif text-4xl md:text-5xl mb-4 leading-tight">
        Decode Any <span className="gold-text">Instagram Profile</span>
      </h1>
      <p className="text-slate-400 max-w-2xl mx-auto mb-12 leading-relaxed">
        Upload an Apify Instagram CSV. We&rsquo;ll transcribe the top 5
        most-engaged reels with Groq Whisper, then run a complete six-layer SWH
        Content Framework analysis. Charts, full report, exportable to PDF / CSV /
        Markdown.
      </p>

      <div
        onClick={disabled ? undefined : onPick}
        onDragOver={(e) => {
          if (disabled) return;
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={disabled ? undefined : onDrop}
        className={`card p-12 transition-all ${
          disabled
            ? "opacity-40 cursor-not-allowed"
            : `cursor-pointer ${
                dragActive
                  ? "border-gold-500 bg-navy-800/70 scale-[1.01]"
                  : "hover:border-gold-500/40"
              }`
        }`}
      >
        <div className="mx-auto w-14 h-14 rounded-full border-2 border-gold-500/50 grid place-items-center mb-4">
          <Upload className="w-6 h-6 text-gold-500" strokeWidth={1.8} />
        </div>
        <div className="font-serif text-xl mb-1">
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

      <FeatureGrid />
    </div>
  );
}

function FeatureGrid() {
  const items = [
    {
      icon: Mic,
      t: "Audio → Transcript",
      d: "Groq Whisper transcribes the top 5 most-engaged reels for free.",
    },
    {
      icon: TrendingUp,
      t: "Visual Insights",
      d: "Charts for tier split, duration, day-of-week, audio source, hashtags.",
    },
    {
      icon: Download,
      t: "Multi-format Export",
      d: "Per-part .md / .txt / .pdf, full ZIP, transcripts, insights CSV.",
    },
  ];
  return (
    <div className="mt-12 grid md:grid-cols-3 gap-4">
      {items.map((it) => (
        <div key={it.t} className="card p-5 text-left">
          <div className="flex items-center gap-2 text-gold-500 font-semibold mb-1">
            <it.icon size={16} />
            {it.t}
          </div>
          <div className="text-sm text-slate-400 leading-relaxed">{it.d}</div>
        </div>
      ))}
    </div>
  );
}

function DatasetCard({
  filename,
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
    <div className="card p-6 mb-4">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] text-slate-400 uppercase tracking-[0.2em] mb-1">Dataset</div>
          <div className="font-serif text-xl text-gold-400 break-all">{filename}</div>
          {classification && <DatasetBadge classification={classification} posts={posts} />}
        </div>
        <button onClick={onChangeFile} className="btn-ghost text-sm" disabled={busy}>
          Change file
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
        <Stat icon={LayersIcon} label="Posts" value={summary?.totalPosts ?? "—"} />
        <Stat icon={Hash} label="Captions" value={`${captionPct}%`} />
        <Stat icon={Music} label="Audio URLs" value={summary?.audioFieldHits ?? 0} />
        <Stat
          icon={Mic}
          label="Transcripts"
          value={hasTranscripts ? `${summary?.transcriptCoveragePct ?? 0}%` : "0%"}
        />
        <Stat icon={Eye} label="View data" value={`${summary?.viewCoveragePct ?? 0}%`} />
      </div>

      <div className="mt-4 text-xs text-slate-400 space-y-1">
        {audioField ? (
          <div>
            <span className="text-slate-500">Audio URL field:</span>{" "}
            <span className="text-gold-400 font-mono">{audioField}</span>
            <span className="text-slate-500 mx-2">·</span>
            <span className="text-slate-300">
              top {transcribeTopN} most-engaged reels will be transcribed when you start a run
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

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="bg-navy-800/60 border border-gold-500/10 rounded-lg p-3">
      <div className="flex items-center gap-1.5 text-[10px] text-slate-400 uppercase tracking-[0.15em]">
        {Icon && <Icon size={11} className="text-gold-500/70" />}
        {label}
      </div>
      <div className="text-lg font-semibold text-gold-400 mt-1">{value}</div>
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
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
      <ActionButton
        icon={BarChart3}
        title="Insights"
        subtitle="Charts, tiers, hashtags"
        onClick={onInsights}
        active={activeTab === "insights"}
        disabled={busy}
        accent="#3498DB"
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
        accent="#2ECC71"
      />
      {onSaveTranscripts && (
        <ActionButton
          icon={Save}
          title="Save Transcripts"
          subtitle="Top reels · .txt"
          onClick={onSaveTranscripts}
          disabled={busy}
          accent="#9B59B6"
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
  const accentColor = accent || "#d4af37";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`text-left p-4 rounded-xl border transition-all relative overflow-hidden ${
        primary
          ? "bg-gold-500 text-navy-950 border-gold-400 hover:bg-gold-400"
          : active
          ? "bg-navy-800/80 border-gold-500/30"
          : "card hover:border-gold-500/40 hover:bg-navy-800/60"
      } disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-inherit`}
      style={!primary && !active ? { borderColor: `${accentColor}30` } : undefined}
    >
      <div className="flex items-center gap-3">
        <div
          className={`w-10 h-10 rounded-lg grid place-items-center shrink-0 ${
            primary ? "bg-navy-950/15" : ""
          }`}
          style={!primary ? { backgroundColor: `${accentColor}20`, color: accentColor } : undefined}
        >
          <Icon size={18} strokeWidth={2} />
        </div>
        <div className="min-w-0">
          <div className={`font-semibold text-sm ${primary ? "text-navy-950" : "text-slate-100"}`}>
            {loading ? "Working…" : title}
          </div>
          <div className={`text-xs mt-0.5 ${primary ? "text-navy-950/70" : "text-slate-400"}`}>
            {subtitle}
          </div>
        </div>
      </div>
    </button>
  );
}

// ----- DATASET PREVIEW (rows / columns table) -----

function DatasetPreview({ rows, rawColumns }) {
  const [showAll, setShowAll] = useState(false);
  const visibleRows = showAll ? rows : rows.slice(0, 25);

  // Pick a useful subset of columns to display (drop internal fields).
  const columns = useMemo(() => {
    if (!rows.length) return [];
    const allKeys = [...new Set(rows.flatMap((r) => Object.keys(r)))]
      .filter((k) => !k.startsWith("_") && k !== "transcript")
      .filter((k) => k !== "reel-transcript");
    // Preferred order, then everything else
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
      "musicInfo/song_name",
      "musicInfo/artist_name",
      "musicInfo/uses_original_audio",
    ];
    const ordered = [
      ...preferred.filter((k) => allKeys.includes(k)),
      ...allKeys.filter((k) => !preferred.includes(k)),
    ];
    return ordered;
  }, [rows]);

  return (
    <div className="card p-0 overflow-hidden">
      <div className="px-5 py-3 border-b border-gold-500/15 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ListChecks size={14} className="text-gold-400" />
          <div className="font-serif text-base gold-text">Dataset preview</div>
          <span className="text-xs text-slate-400">
            · {rows.length} rows · {columns.length} columns shown
            {rawColumns?.length ? ` of ${rawColumns.length} total` : ""}
          </span>
        </div>
        {rows.length > 25 && (
          <button
            onClick={() => setShowAll((s) => !s)}
            className="text-xs text-gold-400 hover:text-gold-300 underline-offset-2 hover:underline"
          >
            {showAll ? `Show first 25` : `Show all ${rows.length}`}
          </button>
        )}
      </div>

      <div className="overflow-auto max-h-[60vh]">
        <table className="w-full text-xs font-mono">
          <thead className="sticky top-0 bg-navy-900/95 backdrop-blur z-[1]">
            <tr>
              <th className="text-left px-3 py-2 text-gold-400 font-semibold border-b border-gold-500/20 w-10">
                #
              </th>
              {columns.map((col) => (
                <th
                  key={col}
                  className="text-left px-3 py-2 text-gold-400 font-semibold border-b border-gold-500/20 whitespace-nowrap"
                  title={col}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, i) => (
              <tr key={i} className="hover:bg-navy-800/40 border-b border-gold-500/5">
                <td className="px-3 py-2 text-slate-500">{i + 1}</td>
                {columns.map((col) => (
                  <td key={col} className="px-3 py-2 text-slate-200 align-top">
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
    return <span className="text-slate-600">—</span>;
  }
  const str = String(value);
  if (str.length > 140) {
    return (
      <span title={str}>
        {str.slice(0, 137)}
        <span className="text-slate-500">…</span>
      </span>
    );
  }
  return <span>{str}</span>;
}

// ----- INLINE FRAMEWORK CHOICE (rendered inside the Framework tab body) -----

function FrameworkChoice({ disabled, willTranscribe, onPick }) {
  return (
    <div className="card p-6 md:p-8">
      <div className="text-center max-w-lg mx-auto mb-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gold-500/10 border border-gold-500/30 text-[10px] uppercase tracking-widest text-gold-400 font-semibold mb-4">
          <Sparkles size={12} />
          Run Framework Analysis
        </div>
        <h2 className="font-serif text-2xl gold-text mb-2">
          Pick your analysis depth
        </h2>
        <p className="text-sm text-slate-400 leading-relaxed">
          Click a button below to start. The page will lock while the agent works — no partial
          output, you&rsquo;ll see the full report when it&rsquo;s ready.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-3 max-w-3xl mx-auto">
        <ChoiceCard
          icon={Zap}
          label="Fast Analysis"
          accent="#F39C12"
          eta="≈ 40 seconds"
          description="One condensed part: top performance signals, dominant hook pattern, emotional arc, and one ready-to-use script blueprint."
          bullets={[
            "1 part · single page",
            "Skips layered breakdown",
            "Best for a quick read",
          ]}
          disabled={disabled}
          onClick={() => onPick("fast")}
        />
        <ChoiceCard
          icon={Sparkles}
          label="Deep Analysis"
          accent="#d4af37"
          eta="1–3 minutes"
          description="Full six-layer breakdown rendered in three parts: Data Analysis, Content Strategy, Script Blueprints."
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
          Top 5 most-engaged reels will be transcribed first (Groq Whisper). This adds ~10–20s
          before generation starts.
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
      className={`relative group text-left p-5 rounded-xl border transition-all overflow-hidden ${
        primary
          ? "bg-gold-500/10 border-gold-500/50 hover:bg-gold-500/15 hover:border-gold-500"
          : "bg-navy-800/40 border-gold-500/15 hover:border-gold-500/40 hover:bg-navy-800/60"
      } disabled:opacity-40 disabled:cursor-not-allowed`}
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
          className="text-slate-500 group-hover:text-gold-400 transition-colors"
        />
      </div>

      <p className="text-xs text-slate-300 leading-relaxed mb-3">{description}</p>

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

// ----- CONFIRMATION MODAL (scripts-only flow) -----

function ScriptsConfirmModal({ scriptCount, willTranscribe, onCancel, onConfirm }) {
  return (
    <ModalShell title="Generate Script Variations" onCancel={onCancel}>
      <p className="text-sm text-slate-300 leading-relaxed mb-4">
        The agent will skip Parts 1 & 2 and produce <span className="text-gold-400 font-semibold">{scriptCount}</span>{" "}
        replicable script blueprint{scriptCount > 1 ? "s" : ""} (Part 3 only). Once confirmed,{" "}
        <span className="text-gold-400 font-semibold">the page will be locked</span> until the
        scripts are ready.
      </p>

      <div className="text-xs text-slate-400 mb-4 space-y-1">
        <div>Estimated wait: <span className="text-gold-400 font-mono">20–40 seconds</span></div>
        <div>Adjust the count in <span className="text-slate-300">Settings → Generation</span>.</div>
      </div>

      {willTranscribe && (
        <div className="text-[11px] text-amber-300/80 bg-amber-500/10 border border-amber-500/30 rounded-md p-3 mb-4">
          Top reels will be transcribed first (Groq Whisper). Adds ~10–20s.
        </div>
      )}

      <ModalActions onCancel={onCancel}>
        <button
          className="btn-gold text-sm"
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
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden
      />
      <div
        role="dialog"
        aria-label={title}
        className="relative w-full max-w-md card p-5"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="font-serif text-lg gold-text">{title}</div>
          <button
            onClick={onCancel}
            className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-navy-700/60"
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
    <div className="flex justify-end gap-2 pt-3 border-t border-gold-500/10">
      <button onClick={onCancel} className="btn-ghost text-sm">
        Cancel
      </button>
      {children}
    </div>
  );
}

// ----- STREAMING STRIP (slim banner shown above the live-streaming report) -----

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
    <div className="card p-4 mb-4 border-gold-500/30 bg-gold-500/5">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full bg-gold-500 animate-pulse shrink-0" />
          <div className="font-serif text-sm gold-text truncate">{title}</div>
          <span className="text-[10px] uppercase tracking-widest font-bold text-gold-400 px-1.5 py-0.5 rounded bg-gold-500/15 border border-gold-500/30 shrink-0">
            LIVE
          </span>
        </div>
        <div className="text-[11px] font-mono text-slate-400 shrink-0">
          {bufferedChars.toLocaleString()} chars · ETA {eta}
        </div>
      </div>
      <p className="text-xs text-slate-300 leading-relaxed mb-2">
        Streaming live — read the report below as it&rsquo;s written. You can switch tabs and
        scroll while generation continues.
      </p>
      <div className="h-1.5 rounded-full overflow-hidden border border-gold-500/20 bg-navy-800 relative">
        <div className="absolute inset-y-0 left-0 w-1/3 bg-gold-500/70 rounded-full progress-stream" />
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
    <div className="card p-6 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="font-serif text-lg gold-text flex items-center gap-2">
            <Mic size={16} /> Transcribing top reels
          </div>
          <div className="text-xs text-slate-400 mt-1">
            {progress?.strategy || "Top engagement (likes + comments)"}
            {progress?.model && (
              <>
                {" "}
                · <span className="text-gold-400 font-mono">{progress.model}</span>
              </>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-serif gold-text leading-none">
            {completed} / {total}
          </div>
          {failed > 0 && <div className="text-xs text-red-300 mt-1">{failed} failed</div>}
        </div>
      </div>
      <div className="h-2 bg-navy-800 rounded-full overflow-hidden border border-gold-500/15">
        <div className="h-full bg-gold-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Tabs({ activeTab, setActiveTab, hasInsights, onExport, exportEnabled }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-6 border-b border-gold-500/15">
      <div className="flex">
        <TabButton active={activeTab === "dataset"} onClick={() => setActiveTab("dataset")}>
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
      className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px inline-flex items-center gap-2 ${
        active
          ? "border-gold-500 text-gold-400"
          : "border-transparent text-slate-400 hover:text-slate-200"
      } disabled:opacity-30 disabled:cursor-not-allowed`}
    >
      {children}
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
        className="btn-ghost text-sm"
      >
        <Download size={14} />
        Dataset export
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-72 card p-2 z-20 shadow-2xl">
            {items.map((it) => (
              <button
                key={it.key}
                disabled={!enabled[it.key]}
                onClick={() => {
                  setOpen(false);
                  onExport(it.key);
                }}
                className="w-full text-left px-3 py-2.5 rounded hover:bg-navy-700/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-start gap-3"
              >
                <it.icon size={16} className="text-gold-400 mt-0.5" />
                <div>
                  <div className="text-sm text-gold-400 font-medium">{it.label}</div>
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

function Footer() {
  return (
    <footer className="border-t border-gold-500/10 py-6 text-center text-[11px] text-slate-500 tracking-wider">
      SWH CONTENT INTELLIGENCE ENGINE · SCALING WITH HIGH TICKET
    </footer>
  );
}
