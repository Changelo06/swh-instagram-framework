import { useCallback, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const STAGE = {
  IDLE: "idle",
  PARSING: "parsing",
  READY: "ready",
  ANALYZING: "analyzing",
  DONE: "done",
  ERROR: "error",
};

export default function App() {
  const [stage, setStage] = useState(STAGE.IDLE);
  const [filename, setFilename] = useState("");
  const [parsed, setParsed] = useState(null);
  const [report, setReport] = useState("");
  const [error, setError] = useState("");
  const [usage, setUsage] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef(null);
  const abortRef = useRef(null);

  const reset = () => {
    abortRef.current?.abort();
    setStage(STAGE.IDLE);
    setFilename("");
    setParsed(null);
    setReport("");
    setError("");
    setUsage(null);
  };

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) {
      setError("Please upload a .csv file exported from Sort Feed.");
      setStage(STAGE.ERROR);
      return;
    }
    setError("");
    setReport("");
    setUsage(null);
    setFilename(file.name);
    setStage(STAGE.PARSING);

    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/parse", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Parse failed");
      setParsed(data);
      setStage(STAGE.READY);
    } catch (e) {
      setError(e.message);
      setStage(STAGE.ERROR);
    }
  }, []);

  const onDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    handleFile(e.dataTransfer.files?.[0]);
  };

  const runAnalysis = async () => {
    if (!parsed) return;
    setStage(STAGE.ANALYZING);
    setReport("");
    setError("");
    setUsage(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: parsed.rows, filename }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `Analyze failed (HTTP ${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const block of events) {
          const lines = block.split("\n");
          let event = "message";
          let dataLine = "";
          for (const line of lines) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) dataLine += line.slice(5).trim();
          }
          if (!dataLine) continue;
          const payload = JSON.parse(dataLine);
          if (event === "delta") {
            setReport((prev) => prev + payload.text);
          } else if (event === "done") {
            setUsage(payload.usage);
            setStage(STAGE.DONE);
          } else if (event === "error") {
            throw new Error(payload.message || "Analysis error");
          }
        }
      }
      // If stream ended without an explicit `done` event, mark complete.
      setStage((s) => (s === STAGE.ANALYZING ? STAGE.DONE : s));
    } catch (e) {
      if (e.name === "AbortError") return;
      setError(e.message);
      setStage(STAGE.ERROR);
    }
  };

  const downloadMarkdown = () => {
    const safeBase = (filename || "swh-framework").replace(/\.csv$/i, "");
    const blob = new Blob([report], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeBase}-framework.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const summary = parsed?.summary;

  return (
    <div className="min-h-screen flex flex-col">
      <Header onReset={reset} canReset={stage !== STAGE.IDLE} />

      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-10">
        {(stage === STAGE.IDLE || stage === STAGE.PARSING || stage === STAGE.ERROR) && !parsed && (
          <UploadZone
            dragActive={dragActive}
            setDragActive={setDragActive}
            onDrop={onDrop}
            onPick={() => inputRef.current?.click()}
            stage={stage}
            error={error}
          />
        )}

        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />

        {parsed && (
          <DatasetCard
            filename={filename}
            summary={summary}
            stage={stage}
            onAnalyze={runAnalysis}
            onChangeFile={() => inputRef.current?.click()}
          />
        )}

        {error && stage === STAGE.ERROR && parsed && (
          <div className="card p-4 mt-6 border-red-500/40 text-red-300 text-sm">
            {error}
          </div>
        )}

        {(stage === STAGE.ANALYZING || stage === STAGE.DONE) && (
          <ReportPanel
            report={report}
            stage={stage}
            usage={usage}
            onDownload={downloadMarkdown}
          />
        )}
      </main>

      <Footer />
    </div>
  );
}

function Header({ onReset, canReset }) {
  return (
    <header className="border-b border-gold-500/15 bg-navy-950/60 backdrop-blur sticky top-0 z-10">
      <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gold-500 text-navy-950 font-serif font-bold text-xl grid place-items-center">
            S
          </div>
          <div>
            <div className="font-serif text-lg leading-none gold-text">SWH</div>
            <div className="text-xs text-slate-400 tracking-wider uppercase">
              Instagram Framework Builder
            </div>
          </div>
        </div>
        {canReset && (
          <button onClick={onReset} className="btn-ghost text-sm">
            New Analysis
          </button>
        )}
      </div>
    </header>
  );
}

function UploadZone({ dragActive, setDragActive, onDrop, onPick, stage, error }) {
  const parsing = stage === STAGE.PARSING;
  return (
    <div className="text-center">
      <h1 className="font-serif text-4xl md:text-5xl mb-3">
        Decode Any <span className="gold-text">Instagram Profile</span>
      </h1>
      <p className="text-slate-400 max-w-2xl mx-auto mb-10">
        Upload a Sort Feed CSV export to generate a complete, evidence-based
        Content Framework. Six analysis layers. Ten-section report. Every claim
        traceable to the data.
      </p>

      <div
        onClick={onPick}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        className={`card p-12 cursor-pointer transition-all ${
          dragActive ? "border-gold-500 bg-navy-800/70 scale-[1.01]" : "hover:border-gold-500/40"
        }`}
      >
        <div className="mx-auto w-14 h-14 rounded-full border-2 border-gold-500/50 grid place-items-center mb-4">
          <svg className="w-6 h-6 text-gold-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 16V4M12 4l-4 4M12 4l4 4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="font-serif text-xl mb-1">
          {parsing ? "Parsing CSV…" : "Drop your Sort Feed CSV here"}
        </div>
        <div className="text-sm text-slate-400">
          {parsing ? "Extracting fields and building dataset preview" : "or click to browse — .csv files only"}
        </div>
      </div>

      {error && (
        <div className="mt-4 text-sm text-red-300">{error}</div>
      )}

      <FeatureGrid />
    </div>
  );
}

function FeatureGrid() {
  const items = [
    { t: "6 Analysis Layers", d: "Performance, language, hooks, structure, emotion, topics." },
    { t: "Evidence-Backed", d: "Every pattern requires 3+ supporting examples from your data." },
    { t: "Voice-Preserving", d: "Captures signature phrases and emoji patterns to keep their voice intact." },
  ];
  return (
    <div className="mt-12 grid md:grid-cols-3 gap-4">
      {items.map((it) => (
        <div key={it.t} className="card p-5 text-left">
          <div className="text-gold-500 font-semibold mb-1">{it.t}</div>
          <div className="text-sm text-slate-400">{it.d}</div>
        </div>
      ))}
    </div>
  );
}

function DatasetCard({ filename, summary, stage, onAnalyze, onChangeFile }) {
  const analyzing = stage === STAGE.ANALYZING;
  const done = stage === STAGE.DONE;
  return (
    <div className="card p-6 mb-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Dataset</div>
          <div className="font-serif text-xl text-gold-400">{filename}</div>
        </div>
        <div className="flex gap-2">
          <button onClick={onChangeFile} className="btn-ghost text-sm" disabled={analyzing}>
            Change file
          </button>
          {!done && (
            <button onClick={onAnalyze} className="btn-gold text-sm" disabled={analyzing}>
              {analyzing ? "Analyzing…" : "Run Framework Analysis"}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <Stat label="Posts" value={summary?.totalPosts ?? "—"} />
        <Stat label="Fields detected" value={summary?.fieldsPresent.length ?? "—"} />
        <Stat label="Transcripts" value={`${summary?.transcriptCoveragePct ?? 0}%`} />
        <Stat label="View data" value={`${summary?.viewCoveragePct ?? 0}%`} />
      </div>

      {summary?.fieldsMissing?.length > 0 && (
        <div className="mt-4 text-xs text-slate-400">
          <span className="text-slate-500">Missing fields: </span>
          {summary.fieldsMissing.join(", ")}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-navy-800/60 border border-gold-500/10 rounded-lg p-3">
      <div className="text-xs text-slate-400 uppercase tracking-wider">{label}</div>
      <div className="text-lg font-semibold text-gold-400 mt-1">{value}</div>
    </div>
  );
}

function ReportPanel({ report, stage, usage, onDownload }) {
  const analyzing = stage === STAGE.ANALYZING;
  const wordCount = useMemo(() => report.trim().split(/\s+/).filter(Boolean).length, [report]);

  return (
    <div className="card p-6 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6 border-b border-gold-500/15 pb-4">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${analyzing ? "bg-gold-500 animate-pulse" : "bg-green-400"}`} />
          <div>
            <div className="font-serif text-lg gold-text">
              {analyzing ? "Generating Framework…" : "Framework Report"}
            </div>
            <div className="text-xs text-slate-400">
              {wordCount.toLocaleString()} words
              {usage && (
                <span className="ml-2">
                  · {usage.input_tokens?.toLocaleString()} in / {usage.output_tokens?.toLocaleString()} out
                </span>
              )}
            </div>
          </div>
        </div>
        <button onClick={onDownload} disabled={!report} className="btn-gold text-sm">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 4v12m0 0l-4-4m4 4l4-4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 20h16" strokeLinecap="round" />
          </svg>
          Download .md
        </button>
      </div>

      {!report && analyzing && (
        <div className="text-slate-400 text-sm py-12 text-center">
          <div className="inline-block w-6 h-6 border-2 border-gold-500/30 border-t-gold-500 rounded-full animate-spin mb-3" />
          <div>Sending dataset to Claude. The first tokens will appear shortly.</div>
        </div>
      )}

      {report && (
        <div className="report">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{report}</ReactMarkdown>
          {analyzing && (
            <span className="inline-block w-2 h-5 ml-1 bg-gold-500 animate-pulse align-middle" />
          )}
        </div>
      )}
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t border-gold-500/10 py-6 text-center text-xs text-slate-500">
      SWH Content Intelligence Engine · Scaling With High Ticket
    </footer>
  );
}
