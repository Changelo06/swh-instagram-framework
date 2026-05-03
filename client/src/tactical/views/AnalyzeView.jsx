import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Play,
  Stop,
  Sparkle,
  Lightning,
  Trash,
  CheckCircle,
  XCircle,
  Clock,
  Microphone,
  ArrowsCounterClockwise,
  Warning,
} from "@phosphor-icons/react";
import { useCsv, STAGE } from "../state/CsvContext.jsx";
import ExportMenu from "../widgets/ExportMenu.jsx";
import EmptyHint from "../widgets/EmptyHint.jsx";
import ConfirmAction from "../widgets/ConfirmAction.jsx";
import { exportAnalysis } from "../lib/exporters.js";

const TEMPLATES = [
  {
    id: "fast",
    name: "FAST",
    eta: "≈ 40s",
    description: "4 layers · single page",
    icon: Lightning,
    body: `// FAST · single-page diagnostic
// Top performance signals · dominant hooks ·
// structural beats · topic ranking.

run({
  mode: "fast",
  layers: 4,
  blueprintsPart3: false,
});`,
  },
  {
    id: "full",
    name: "DEEP",
    eta: "1–3 min",
    description: "6 layers · script blueprints",
    icon: Sparkle,
    body: `// DEEP · full breakdown
// 6 layers + replicable script blueprints
// for the top voice patterns.

run({
  mode: "full",
  layers: 6,
  blueprintsPart3: true,
});`,
  },
];

export default function AnalyzeView() {
  const {
    stage,
    rows,
    filename,
    selectedCreator,
    analyses,
    activeAnalysisId,
    setActiveAnalysisId,
    runAnalysis,
    stopAnalysis,
    removeAnalysis,
    retryAnalysis,
  } = useCsv();

  const [selectedTemplateId, setSelectedTemplateId] = useState("fast");

  if (stage !== STAGE.READY || !rows.length) {
    return <AnalyzeEmpty />;
  }

  const active = analyses.find((a) => a.id === activeAnalysisId) || null;
  const template = TEMPLATES.find((t) => t.id === selectedTemplateId);

  const showingRun = !!active;
  const baseName = useBaseName(filename, selectedCreator);

  const start = (mode) => {
    const id = runAnalysis({ mode });
    setActiveAnalysisId(id);
  };

  const onPickTemplate = (id) => {
    setSelectedTemplateId(id);
    setActiveAnalysisId(null);
  };

  const onPickRun = (id) => {
    setActiveAnalysisId(id);
  };

  return (
    <section
      style={{
        display: "grid",
        gridTemplateColumns: "260px 1fr",
        gap: 1,
        background: "var(--tac-border)",
        minHeight: "calc(100dvh - 44px)",
      }}
    >
      <aside
        style={{
          background: "var(--tac-surface2)",
          display: "grid",
          gridTemplateRows: "auto auto 1fr",
        }}
      >
        <div
          style={{
            padding: "12px 14px",
            borderBottom: "1px solid var(--tac-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span className="tac-label">TEMPLATES</span>
          <span
            style={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 9,
              color: "var(--tac-dim)",
              letterSpacing: "0.1em",
            }}
          >
            CLICK · CONFIGURE · RUN
          </span>
        </div>

        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {TEMPLATES.map((t) => {
            const Icon = t.icon;
            const isActive = !showingRun && selectedTemplateId === t.id;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => onPickTemplate(t.id)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "12px 14px",
                    background: isActive ? "var(--tac-surface)" : "transparent",
                    borderLeft: isActive
                      ? "2px solid #4f8dfe"
                      : "2px solid transparent",
                    border: "none",
                    color: isActive ? "var(--tac-fg)" : "var(--tac-mute)",
                    cursor: "pointer",
                    display: "grid",
                    gap: 4,
                    fontFamily: '"JetBrains Mono", monospace',
                    fontSize: 11,
                    transition: "color 120ms, background 120ms",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Icon
                      size={12}
                      weight="regular"
                      color={isActive ? "#4f8dfe" : "var(--tac-mute)"}
                    />
                    <span style={{ letterSpacing: "0.04em" }}>{t.name}</span>
                  </div>
                  <div style={{ fontSize: 9, color: "var(--tac-dim)" }}>
                    {t.eta} · {t.description}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>

        <div
          style={{
            borderTop: "1px solid var(--tac-border)",
            display: "grid",
            gridTemplateRows: "auto 1fr",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "10px 14px",
              borderBottom: "1px solid var(--tac-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span className="tac-label">RUN HISTORY</span>
            <span
              style={{
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: 9,
                color: "var(--tac-dim)",
                letterSpacing: "0.1em",
              }}
            >
              {analyses.length}
            </span>
          </div>
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              overflowY: "auto",
            }}
          >
            {analyses.length === 0 && (
              <li
                style={{
                  padding: "16px 14px",
                  color: "var(--tac-dim)",
                  fontFamily: '"JetBrains Mono", monospace',
                  fontSize: 10,
                  letterSpacing: "0.04em",
                  lineHeight: 1.6,
                }}
              >
                // no runs yet · pick a template above and click RUN
              </li>
            )}
            {[...analyses].reverse().map((a) => {
              const isSelected = active?.id === a.id;
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => onPickRun(a.id)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "10px 14px",
                      background: isSelected ? "var(--tac-surface)" : "transparent",
                      borderLeft: isSelected
                        ? "2px solid #4f8dfe"
                        : "2px solid transparent",
                      border: "none",
                      color: isSelected ? "var(--tac-fg)" : "var(--tac-mute)",
                      cursor: "pointer",
                      display: "grid",
                      gap: 3,
                      fontFamily: '"JetBrains Mono", monospace',
                      fontSize: 10,
                      transition: "color 120ms, background 120ms",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <span style={{ letterSpacing: "0.04em" }}>
                        {a.mode === "full" ? "DEEP" : "FAST"}
                      </span>
                      <RunStatusDot status={a.status} />
                    </div>
                    <div style={{ fontSize: 9, color: "var(--tac-dim)" }}>
                      {fmtTime(a.startedAt)} · {fmtChars(a.text.length)}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>

      <div
        style={{
          background: "var(--tac-bg)",
          display: "grid",
          gridTemplateRows: "auto 1fr",
        }}
      >
        {showingRun ? (
          <RunPanel
            analysis={active}
            stop={stopAnalysis}
            remove={removeAnalysis}
            retry={retryAnalysis}
            baseName={baseName}
          />
        ) : (
          <TemplatePanel
            template={template}
            onRun={() => start(template.id)}
            rowCount={rows.length}
            handleLabel={
              selectedCreator
                ? `@${selectedCreator.displayHandle || selectedCreator.handle}`
                : ""
            }
          />
        )}
      </div>
    </section>
  );
}

function TemplatePanel({ template, onRun, rowCount, handleLabel }) {
  return (
    <>
      <header
        style={{
          background: "var(--tac-surface2)",
          borderBottom: "1px solid var(--tac-border)",
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <span className="tac-label">SECTION D-03 / ANALYZE</span>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 12,
              marginTop: 4,
            }}
          >
            <span
              className="tac-display"
              style={{ fontSize: 18, color: "var(--tac-fg)" }}
            >
              {template.name}
            </span>
            <span
              style={{
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: 10,
                color: "var(--tac-mute)",
              }}
            >
              {handleLabel} · {rowCount.toLocaleString()} rows · {template.eta}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onRun}
          className="tac-btn tac-btn-accent"
          style={{ padding: "8px 16px", fontSize: 11 }}
        >
          <Play size={12} weight="fill" />
          RUN {template.name}
        </button>
      </header>

      <div
        style={{
          padding: "16px",
          overflow: "auto",
          fontFamily: '"JetBrains Mono", monospace',
        }}
      >
        <Editor body={template.body} />
        <div
          style={{
            marginTop: 18,
            padding: "12px 14px",
            background: "var(--tac-surface2)",
            border: "1px solid var(--tac-border)",
            fontSize: 10,
            color: "var(--tac-mute)",
            lineHeight: 1.6,
            letterSpacing: "0.02em",
          }}
        >
          // template renders read-only · click RUN to start a streaming pass.
          The REPORT tab updates as deltas arrive — you can switch templates or
          run history while a stream is in flight.
        </div>
      </div>
    </>
  );
}

function RunPanel({ analysis, stop, remove, retry, baseName }) {
  const [tab, setTab] = useState("report");
  const isRunning = analysis.status === "running";

  // Auto-bias to REPORT while streaming/finished; let user switch to CONFIG too.
  useEffect(() => {
    if (analysis.status === "running" || analysis.status === "done") {
      setTab("report");
    }
  }, [analysis.id, analysis.status]);

  const template =
    TEMPLATES.find((t) => t.id === analysis.mode) || TEMPLATES[0];

  return (
    <>
      <header
        style={{
          background: "var(--tac-surface2)",
          borderBottom: "1px solid var(--tac-border)",
          padding: "10px 16px",
          display: "grid",
          gridTemplateColumns: "auto 1fr auto",
          alignItems: "center",
          gap: 16,
        }}
      >
        <div>
          <span className="tac-label">RUN //</span>
          <span
            className="tac-display"
            style={{ fontSize: 14, color: "var(--tac-fg)", marginLeft: 8 }}
          >
            {template.name}
          </span>
        </div>

        <div
          style={{
            display: "flex",
            gap: 1,
            background: "var(--tac-border)",
            border: "1px solid var(--tac-border)",
            justifySelf: "start",
          }}
        >
          <Tab
            id="config"
            active={tab === "config"}
            onClick={() => setTab("config")}
          >
            CONFIG
          </Tab>
          <Tab
            id="report"
            active={tab === "report"}
            onClick={() => setTab("report")}
            indicator={
              isRunning && (
                <span
                  className="tac-dot-status"
                  style={{ background: "#4f8dfe" }}
                />
              )
            }
          >
            REPORT
          </Tab>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <RunMeta analysis={analysis} />
          {isRunning ? (
            <button
              type="button"
              onClick={() => stop(analysis.id)}
              aria-label="Stop run"
              style={{
                background: "#ef4444",
                border: "1px solid #ef4444",
                color: "var(--tac-bg)",
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                padding: "8px 14px",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                transition: "background 120ms, border-color 120ms",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#f87171";
                e.currentTarget.style.borderColor = "#f87171";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#ef4444";
                e.currentTarget.style.borderColor = "#ef4444";
              }}
            >
              <Stop size={12} weight="fill" />
              STOP
            </button>
          ) : (
            <>
              <ConfirmAction
                onConfirm={() => retry(analysis.id)}
                label="RETRY"
                armedLabel="CONFIRM RETRY"
                Icon={ArrowsCounterClockwise}
                tone="warn"
                title="re-run from a fresh transcribe + analyze pass · the current page is replaced"
              />
              <ExportMenu
                disabled={analysis.status !== "done" || !analysis.text}
                onExport={(fmt) => exportAnalysis(fmt, analysis, baseName)}
              />
            </>
          )}
          <button
            type="button"
            onClick={() => remove(analysis.id)}
            aria-label="Delete run"
            disabled={isRunning}
            className="tac-btn"
            style={{ padding: "6px 8px", fontSize: 10, opacity: isRunning ? 0.4 : 1 }}
          >
            <Trash size={11} weight="regular" />
          </button>
        </div>
      </header>

      <div style={{ overflow: "auto", padding: 16 }}>
        {tab === "config" && <Editor body={template.body} />}
        {tab === "report" && (
          <>
            {analysis.phase === "transcribing" && (
              <TranscribeStrip analysis={analysis} />
            )}
            <ReportStream analysis={analysis} />
          </>
        )}
      </div>
    </>
  );
}

function TranscribeStrip({ analysis }) {
  const p = analysis.transcribeProgress || {};
  const total = p.total || 0;
  const completed = p.completed || 0;
  const pct = total ? Math.min(100, Math.round((completed / total) * 100)) : 0;
  const failed = (p.failed || 0) > 0;

  return (
    <div
      style={{
        display: "grid",
        gap: 8,
        marginBottom: 14,
        padding: "12px 14px",
        background: "var(--tac-bg)",
        border: "1px solid var(--tac-border)",
        borderLeft: "3px solid #4f8dfe",
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 11,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Microphone size={13} weight="regular" color="#4f8dfe" />
          <span
            style={{
              color: "var(--tac-fg)",
              fontWeight: 600,
              letterSpacing: "0.04em",
            }}
          >
            TRANSCRIBING TOP REELS
          </span>
          {p.model && (
            <span
              style={{
                fontSize: 9,
                color: "var(--tac-mute)",
                letterSpacing: "0.1em",
                border: "1px solid var(--tac-border)",
                padding: "1px 6px",
              }}
            >
              {p.model}
            </span>
          )}
        </div>
        <span
          style={{
            fontSize: 9,
            color: "var(--tac-mute)",
            letterSpacing: "0.08em",
          }}
        >
          {completed}/{total} · {pct}%
          {failed && (
            <span style={{ color: "#ef4444", marginLeft: 6 }}>
              · {p.failed} failed
            </span>
          )}
        </span>
      </div>
      <div
        style={{
          height: 4,
          background: "var(--tac-surface)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            bottom: 0,
            width: `${pct || 4}%`,
            background: failed ? "#ef4444" : "#4f8dfe",
            transition: "width 240ms ease",
          }}
        />
      </div>
      <div style={{ color: "var(--tac-mute)", fontSize: 10, lineHeight: 1.5 }}>
        // groq whisper · {p.strategy || "top engagement"} · transcripts feed
        the analysis prompt before claude opens the report stream.
      </div>
    </div>
  );
}

function ReportStream({ analysis }) {
  const text = analysis.text || "";
  const isRunning = analysis.status === "running";
  const isTranscribing = analysis.phase === "transcribing";
  const containerRef = useRef(null);
  const lastLenRef = useRef(0);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (!autoScroll || !containerRef.current) return;
    if (text.length === lastLenRef.current) return;
    lastLenRef.current = text.length;
    containerRef.current.scrollTop = containerRef.current.scrollHeight;
  }, [text, autoScroll]);

  if (!text && isTranscribing) {
    return null; // TranscribeStrip is shown above
  }

  if (!text && !isRunning) {
    return (
      <div
        style={{
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 11,
          color: "var(--tac-dim)",
          padding: "16px 0",
        }}
      >
        // no output · run aborted before any deltas arrived
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={(e) => {
        const el = e.currentTarget;
        const atBottom =
          el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        setAutoScroll(atBottom);
      }}
      style={{
        position: "relative",
        background: "var(--tac-surface2)",
        border: "1px solid var(--tac-border)",
        padding: "16px 18px",
        maxHeight: "calc(100dvh - 44px - 200px)",
        overflowY: "auto",
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 12,
        lineHeight: 1.6,
        color: "var(--tac-fg)",
      }}
      className="tac-report"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
        {text || ""}
      </ReactMarkdown>
      {isRunning && (
        <span
          style={{
            display: "inline-block",
            width: 6,
            height: 14,
            background: "#4f8dfe",
            verticalAlign: "middle",
            marginLeft: 4,
            animation: "tac-blink 1s steps(2) infinite",
          }}
          aria-hidden
        />
      )}
      {!autoScroll && isRunning && (
        <button
          type="button"
          onClick={() => {
            setAutoScroll(true);
            if (containerRef.current) {
              containerRef.current.scrollTop =
                containerRef.current.scrollHeight;
            }
          }}
          style={{
            position: "sticky",
            bottom: 8,
            float: "right",
            background: "#4f8dfe",
            color: "var(--tac-bg)",
            border: "1px solid #4f8dfe",
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 9,
            letterSpacing: "0.1em",
            padding: "4px 10px",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          ← JUMP TO LIVE
        </button>
      )}
    </div>
  );
}

const MD_COMPONENTS = {
  h1: (p) => (
    <h1
      style={{
        fontFamily: '"Archivo Black", Impact, sans-serif',
        fontSize: 18,
        color: "var(--tac-fg)",
        textTransform: "uppercase",
        letterSpacing: "-0.02em",
        margin: "16px 0 8px",
        borderBottom: "1px solid var(--tac-border)",
        paddingBottom: 4,
      }}
      {...p}
    />
  ),
  h2: (p) => (
    <h2
      style={{
        fontFamily: '"Archivo Black", Impact, sans-serif',
        fontSize: 14,
        color: "#4f8dfe",
        textTransform: "uppercase",
        letterSpacing: "-0.01em",
        margin: "14px 0 6px",
      }}
      {...p}
    />
  ),
  h3: (p) => (
    <h3
      style={{
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 12,
        color: "var(--tac-fg)",
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        margin: "12px 0 4px",
      }}
      {...p}
    />
  ),
  h4: (p) => (
    <h4
      style={{
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 11,
        color: "var(--tac-mute)",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        margin: "10px 0 4px",
      }}
      {...p}
    />
  ),
  p: (p) => <p style={{ margin: "6px 0", lineHeight: 1.65 }} {...p} />,
  strong: (p) => <strong style={{ color: "#4f8dfe", fontWeight: 600 }} {...p} />,
  em: (p) => <em style={{ color: "#7aaeff" }} {...p} />,
  ul: (p) => (
    <ul style={{ margin: "6px 0 6px 18px", paddingLeft: 4 }} {...p} />
  ),
  ol: (p) => (
    <ol style={{ margin: "6px 0 6px 18px", paddingLeft: 4 }} {...p} />
  ),
  li: (p) => <li style={{ margin: "2px 0", lineHeight: 1.55 }} {...p} />,
  blockquote: (p) => (
    <blockquote
      style={{
        margin: "8px 0",
        padding: "6px 12px",
        borderLeft: "2px solid #4f8dfe",
        background: "var(--tac-bg)",
        color: "var(--tac-fg)",
      }}
      {...p}
    />
  ),
  code: ({ inline, ...p }) =>
    inline ? (
      <code
        style={{
          background: "var(--tac-bg)",
          border: "1px solid var(--tac-border)",
          padding: "0 4px",
          color: "#fbbf24",
          fontSize: 11,
        }}
        {...p}
      />
    ) : (
      <pre
        style={{
          margin: "8px 0",
          padding: "10px 12px",
          background: "var(--tac-bg)",
          border: "1px solid var(--tac-border)",
          color: "var(--tac-fg)",
          fontSize: 11,
          overflow: "auto",
        }}
      >
        <code {...p} />
      </pre>
    ),
  hr: () => (
    <hr
      style={{
        border: "none",
        borderTop: "1px solid var(--tac-border)",
        margin: "12px 0",
      }}
    />
  ),
  table: (p) => (
    <table
      style={{
        borderCollapse: "collapse",
        width: "100%",
        margin: "8px 0",
        fontSize: 11,
      }}
      {...p}
    />
  ),
  th: (p) => (
    <th
      style={{
        textAlign: "left",
        padding: "6px 8px",
        background: "var(--tac-bg)",
        color: "#4f8dfe",
        borderBottom: "1px solid var(--tac-border)",
        fontWeight: 600,
      }}
      {...p}
    />
  ),
  td: (p) => (
    <td
      style={{
        padding: "6px 8px",
        borderBottom: "1px solid var(--tac-surface)",
        color: "var(--tac-fg)",
        verticalAlign: "top",
      }}
      {...p}
    />
  ),
};

function Tab({ active, onClick, children, indicator }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: active ? "var(--tac-bg)" : "var(--tac-surface2)",
        border: "none",
        borderTop: active ? "2px solid #4f8dfe" : "2px solid transparent",
        color: active ? "var(--tac-fg)" : "var(--tac-mute)",
        padding: "8px 14px",
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 10,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      {children}
      {indicator}
    </button>
  );
}

function RunMeta({ analysis }) {
  const ms = Date.now() - (analysis.startedAt || Date.now());
  const status = analysis.status;
  const Icon =
    status === "running"
      ? Clock
      : status === "done"
      ? CheckCircle
      : status === "stopped"
      ? Stop
      : XCircle;
  const color =
    status === "running"
      ? "#4f8dfe"
      : status === "done"
      ? "#4AF626"
      : status === "stopped"
      ? "#fbbf24"
      : "#ef4444";

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 8px",
        border: `1px solid ${color}`,
        background: "var(--tac-bg)",
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 9,
        letterSpacing: "0.1em",
        color,
      }}
    >
      <Icon size={10} weight="regular" />
      {status.toUpperCase()} · {fmtChars(analysis.text.length)}
      {status === "done" && analysis.usage && (
        <span style={{ color: "var(--tac-mute)" }}>
          · {analysis.usage.input_tokens?.toLocaleString() || 0}/
          {analysis.usage.output_tokens?.toLocaleString() || 0}
        </span>
      )}
    </div>
  );
}

function RunStatusDot({ status }) {
  const map = {
    running: "#4f8dfe",
    done: "#4AF626",
    stopped: "#fbbf24",
    error: "#ef4444",
  };
  const color = map[status] || "var(--tac-mute)";
  return (
    <span
      style={{
        width: 6,
        height: 6,
        background: color,
        animation:
          status === "running"
            ? "tac-pulse 1.6s ease-in-out infinite"
            : "none",
      }}
    />
  );
}

function Editor({ body }) {
  const lines = body.split("\n");
  return (
    <pre
      style={{
        margin: 0,
        padding: "12px 0",
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 12,
        lineHeight: 1.7,
        color: "var(--tac-fg)",
        background: "var(--tac-surface2)",
        border: "1px solid var(--tac-border)",
      }}
    >
      {lines.map((line, i) => (
        <div
          key={i}
          style={{ display: "grid", gridTemplateColumns: "44px 1fr" }}
        >
          <span
            style={{
              color: "var(--tac-dim)",
              textAlign: "right",
              paddingRight: 14,
              userSelect: "none",
              borderRight: "1px solid var(--tac-surface)",
            }}
          >
            {String(i + 1).padStart(2, "0")}
          </span>
          <code
            style={{
              paddingLeft: 14,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {syntaxHighlight(line)}
          </code>
        </div>
      ))}
    </pre>
  );
}

function syntaxHighlight(line) {
  if (line.trim().startsWith("//")) {
    return <span style={{ color: "var(--tac-mute)" }}>{line}</span>;
  }
  return line.split(/(\s+|"[^"]*"|true|false|\d+)/).map((part, i) => {
    if (/^"[^"]*"$/.test(part))
      return (
        <span key={i} style={{ color: "#4AF626" }}>
          {part}
        </span>
      );
    if (/^(true|false)$/.test(part))
      return (
        <span
          key={i}
          style={{ color: part === "true" ? "#4AF626" : "#ef4444" }}
        >
          {part}
        </span>
      );
    if (/^\d+$/.test(part))
      return (
        <span key={i} style={{ color: "#fbbf24" }}>
          {part}
        </span>
      );
    return <span key={i}>{part}</span>;
  });
}

function AnalyzeEmpty() {
  return <EmptyHint />;
}

function useBaseName(filename, creator) {
  return useMemo(() => {
    const base = (filename || "swh-framework").replace(/\.csv$/i, "");
    const handle = creator?.handle ? `-${creator.handle}` : "";
    return `${base}${handle}`;
  }, [filename, creator]);
}

function fmtTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function fmtChars(n) {
  if (n == null) return "0";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K chars`;
  return `${n} chars`;
}
