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
  FolderOpen,
  FileText,
  FileCode,
} from "@phosphor-icons/react";
import { useCsv, STAGE, ALL_HANDLE } from "../state/CsvContext.jsx";
import ExportMenu from "../widgets/ExportMenu.jsx";
import EmptyHint from "../widgets/EmptyHint.jsx";
import ConfirmAction from "../widgets/ConfirmAction.jsx";
import { exportAnalysis } from "../lib/exporters.js";
import { parseAnalysisLayers } from "../lib/analysisLayers.js";

const TEMPLATES = [
  {
    id: "fast",
    name: "Fast",
    eta: "≈ 40 seconds",
    description: "4 layers · compact, action-oriented",
    icon: Lightning,
    summary:
      "A quick-read diagnosis: performance snapshot, the winning hook pattern, the structural pattern behind top performers, and a prioritized list of next moves.",
    sections: [
      "Performance Snapshot — top vs bottom tier, duration, best day",
      "Winning Hook Pattern — the dominant formula with quoted examples",
      "Content Structure Pattern — the recurring beat shape across top performers",
      "Next Moves — repeat, stop, test next",
    ],
  },
  {
    id: "full",
    name: "Deep",
    eta: "1–3 minutes",
    description: "6 layers · strategic report on content + audience",
    icon: Sparkle,
    summary:
      "A strategic report covering content diagnosis, creator strategy, and how this creator builds and conditions their audience over time. No scripts — script generation lives in the Scripts workflow.",
    sections: [
      "Performance Signals — durable hits vs viral flukes",
      "Hook & Scroll Stopper — written-vs-spoken mismatches, reusable templates",
      "Structure & Retention — pacing arc and retention drivers",
      "Emotional & Identity Triggers — worldview, in-group framing, vulnerability",
      "Follower-Base Dynamics — loyalty loops, parasocial trust, loyal vs viral reach",
      "Strategic Moves — 30-90 day posture, content gaps, audience-building bets",
    ],
  },
];

export default function AnalyzeView() {
  const {
    stage,
    rows,
    filename,
    selectedCreator,
    selectedHandle,
    setSelectedHandle,
    creators,
    analyses,
    activeAnalysisId,
    setActiveAnalysisId,
    runAnalysis,
    stopAnalysis,
    removeAnalysis,
    retryAnalysis,
  } = useCsv();

  const [selectedTemplateId, setSelectedTemplateId] = useState("fast");

  // Analyze runs against a single creator's reels (top-N transcribe + scripts).
  // If the user lands here while the unified ALL filter is active, drop back
  // to the first creator so the run has a coherent target.
  useEffect(() => {
    if (selectedHandle === ALL_HANDLE && creators.length > 0) {
      setSelectedHandle(creators[0].handle);
    }
  }, [selectedHandle, creators, setSelectedHandle]);

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
        gridTemplateRows: "auto 1fr",
        gap: 1,
        background: "var(--tac-border)",
        minHeight: "calc(100dvh - 44px)",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "260px 1fr",
          gap: 1,
          background: "var(--tac-border)",
        }}
      >
      <aside
        style={{
          background: "var(--tac-surface)",
          display: "grid",
          gridTemplateRows: "auto auto 1fr",
        }}
      >
        <div
          style={{
            padding: "14px 14px 12px",
            borderBottom: "1px solid var(--tac-border)",
          }}
        >
          <span
            style={{
              fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
              fontSize: 12,
              fontWeight: 500,
              color: "var(--tac-mute)",
            }}
          >
            Templates
          </span>
        </div>

        <ul style={{ listStyle: "none", margin: 0, padding: "6px 0" }}>
          {TEMPLATES.map((t) => {
            const Icon = t.icon;
            const isActive = !showingRun && selectedTemplateId === t.id;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => onPickTemplate(t.id)}
                  style={{
                    width: "calc(100% - 12px)",
                    textAlign: "left",
                    padding: "10px 14px",
                    margin: "1px 6px",
                    background: isActive
                      ? "var(--tac-surface2)"
                      : "transparent",
                    borderRadius: 6,
                    border: "none",
                    borderLeft: isActive
                      ? "2px solid var(--tac-accent)"
                      : "2px solid transparent",
                    color: isActive ? "var(--tac-fg)" : "var(--tac-mute)",
                    cursor: "pointer",
                    display: "grid",
                    gap: 4,
                    fontFamily:
                      '"Inter", ui-sans-serif, system-ui, sans-serif',
                    fontSize: 13,
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
                      size={14}
                      weight="regular"
                      color={
                        isActive ? "var(--tac-accent)" : "var(--tac-mute)"
                      }
                    />
                    <span style={{ fontWeight: isActive ? 500 : 400 }}>
                      {t.name}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--tac-mute)" }}>
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
              padding: "12px 14px",
              borderTop: "1px solid var(--tac-border)",
              borderBottom: "1px solid var(--tac-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span
              style={{
                fontFamily:
                  '"Inter", ui-sans-serif, system-ui, sans-serif',
                fontSize: 12,
                fontWeight: 500,
                color: "var(--tac-mute)",
              }}
            >
              Run history
            </span>
            <span
              style={{
                fontFamily:
                  '"Inter", ui-sans-serif, system-ui, sans-serif',
                fontSize: 12,
                color: "var(--tac-mute)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {analyses.length}
            </span>
          </div>
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: "6px 0",
              overflowY: "auto",
            }}
          >
            {analyses.length === 0 && (
              <li
                style={{
                  padding: "12px 14px",
                  color: "var(--tac-mute)",
                  fontFamily:
                    '"Inter", ui-sans-serif, system-ui, sans-serif',
                  fontSize: 12,
                  lineHeight: 1.6,
                }}
              >
                No runs yet. Pick a template above, then click Run.
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
                      width: "calc(100% - 12px)",
                      textAlign: "left",
                      padding: "8px 14px",
                      margin: "1px 6px",
                      borderRadius: 6,
                      background: isSelected
                        ? "var(--tac-surface2)"
                        : "transparent",
                      borderLeft: isSelected
                        ? "2px solid var(--tac-accent)"
                        : "2px solid transparent",
                      border: "none",
                      color: isSelected ? "var(--tac-fg)" : "var(--tac-mute)",
                      cursor: "pointer",
                      display: "grid",
                      gap: 3,
                      fontFamily:
                        '"Inter", ui-sans-serif, system-ui, sans-serif',
                      fontSize: 12.5,
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
                      <span style={{ fontWeight: isSelected ? 500 : 400 }}>
                        {a.mode === "full" ? "Deep" : "Fast"}
                      </span>
                      <RunStatusDot status={a.status} />
                    </div>
                    <div style={{ fontSize: 11, color: "var(--tac-mute)" }}>
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
      </div>
    </section>
  );
}

function TemplatePanel({ template, onRun, rowCount, handleLabel }) {
  return (
    <>
      <header
        style={{
          background: "var(--tac-surface)",
          borderBottom: "1px solid var(--tac-border)",
          padding: "16px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div>
          <div className="tac-section-title">{template.name} analysis</div>
          <div className="tac-section-copy">
            {handleLabel} · {rowCount.toLocaleString()} rows · {template.eta}
          </div>
        </div>
        <button
          type="button"
          onClick={onRun}
          className="tac-btn tac-btn-accent"
          style={{ padding: "8px 16px", fontSize: 13 }}
        >
          <Play size={13} weight="fill" />
          Run {template.name.toLowerCase()}
        </button>
      </header>

      <div
        style={{
          padding: "24px",
          overflow: "auto",
        }}
      >
        <div
          className="tac-card"
          style={{
            maxWidth: 720,
            padding: "20px 22px",
            display: "grid",
            gap: 14,
          }}
        >
          <div>
            <div
              style={{
                fontFamily:
                  '"Inter", ui-sans-serif, system-ui, sans-serif',
                fontSize: 14,
                fontWeight: 600,
                color: "var(--tac-fg)",
                marginBottom: 6,
              }}
            >
              What this run produces
            </div>
            <div
              style={{
                fontSize: 13,
                color: "var(--tac-mute)",
                lineHeight: 1.6,
              }}
            >
              {template.summary}
            </div>
          </div>
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "grid",
              gap: 8,
            }}
          >
            {template.sections.map((section, i) => (
              <li
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: "20px 1fr",
                  gap: 10,
                  alignItems: "baseline",
                  fontSize: 13,
                  color: "var(--tac-fg)",
                  lineHeight: 1.55,
                }}
              >
                <span
                  style={{
                    fontFamily:
                      '"Inter", ui-sans-serif, system-ui, sans-serif',
                    fontVariantNumeric: "tabular-nums",
                    color: "var(--tac-mute)",
                    fontSize: 12,
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>{section}</span>
              </li>
            ))}
          </ul>
        </div>
        <div
          style={{
            marginTop: 14,
            maxWidth: 720,
            padding: "10px 14px",
            background: "var(--tac-surface2)",
            border: "1px solid var(--tac-border)",
            borderRadius: 8,
            fontSize: 12,
            color: "var(--tac-mute)",
            lineHeight: 1.55,
          }}
        >
          Click Run to start streaming. You can switch templates or open a
          past run while a stream is in flight.
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
          background: "var(--tac-surface)",
          borderBottom: "1px solid var(--tac-border)",
          padding: "12px 24px",
          display: "grid",
          gridTemplateColumns: "auto 1fr auto",
          alignItems: "center",
          gap: 16,
        }}
      >
        <div>
          <div className="tac-section-title" style={{ fontSize: 15 }}>
            {template.name} analysis
          </div>
          <div className="tac-section-copy">
            {analysis.mode === "full" ? "6 layers" : "4 layers"} ·{" "}
            {fmtTime(analysis.startedAt)}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 4,
            justifySelf: "start",
            padding: 3,
            background: "var(--tac-surface-inner)",
            border: "1px solid var(--tac-border)",
            borderRadius: 8,
          }}
        >
          <Tab
            id="config"
            active={tab === "config"}
            onClick={() => setTab("config")}
          >
            Config
          </Tab>
          <Tab
            id="report"
            active={tab === "report"}
            onClick={() => setTab("report")}
            indicator={
              isRunning && (
                <span
                  className="tac-dot-status"
                  style={{ background: "var(--tac-accent)" }}
                />
              )
            }
          >
            Report
          </Tab>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <RunMeta analysis={analysis} />
          {isRunning ? (
            <button
              type="button"
              onClick={() => stop(analysis.id)}
              aria-label="Stop run"
              className="tac-btn tac-btn-danger"
              style={{ padding: "6px 12px", fontSize: 12 }}
            >
              <Stop size={12} weight="fill" />
              Stop
            </button>
          ) : (
            <>
              <ConfirmAction
                onConfirm={() => retry(analysis.id)}
                label="Retry"
                armedLabel="Confirm retry"
                Icon={ArrowsCounterClockwise}
                tone="warn"
                title="Re-run from a fresh transcribe + analyze pass — the current run is replaced."
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
            style={{
              padding: "6px 10px",
              fontSize: 12,
              opacity: isRunning ? 0.4 : 1,
            }}
          >
            <Trash size={12} weight="regular" />
          </button>
        </div>
      </header>

      {tab === "config" && (
        <div style={{ overflow: "auto", padding: 24 }}>
          <div
            className="tac-card"
            style={{
              maxWidth: 720,
              padding: "20px 22px",
              display: "grid",
              gap: 14,
            }}
          >
            <div>
              <div
                style={{
                  fontFamily:
                    '"Inter", ui-sans-serif, system-ui, sans-serif',
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--tac-fg)",
                  marginBottom: 6,
                }}
              >
                What this run produces
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--tac-mute)",
                  lineHeight: 1.6,
                }}
              >
                {template.summary}
              </div>
            </div>
            <ul
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                display: "grid",
                gap: 8,
              }}
            >
              {template.sections.map((section, i) => (
                <li
                  key={i}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "20px 1fr",
                    gap: 10,
                    alignItems: "baseline",
                    fontSize: 13,
                    color: "var(--tac-fg)",
                    lineHeight: 1.55,
                  }}
                >
                  <span
                    style={{
                      fontFamily:
                        '"Inter", ui-sans-serif, system-ui, sans-serif',
                      fontVariantNumeric: "tabular-nums",
                      color: "var(--tac-mute)",
                      fontSize: 12,
                    }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span>{section}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {tab === "report" && (
        <ReportLayers analysis={analysis} isRunning={isRunning} />
      )}
    </>
  );
}

// ============================================================
// Layer explorer — splits a streamed/streamed analysis into a
// folder of focused layer files. Phase 1: UI-only parsing.
// ============================================================
function ReportLayers({ analysis, isRunning }) {
  const text = analysis.text || "";
  const parsed = useMemo(
    () => parseAnalysisLayers(text, analysis.mode),
    [text, analysis.mode]
  );

  const items = useMemo(() => {
    const list = [parsed.overview, ...parsed.layers];
    list.push({
      id: "raw",
      title: "Full report",
      markdown: parsed.raw || "",
      isFallback: true,
    });
    return list;
  }, [parsed]);

  const [selectedId, setSelectedId] = useState("overview");
  useEffect(() => {
    if (!items.find((i) => i.id === selectedId)) setSelectedId("overview");
  }, [items, selectedId]);

  const selected = items.find((i) => i.id === selectedId) || items[0];
  const containerRef = useRef(null);
  const lastLenRef = useRef(0);
  const [autoScroll, setAutoScroll] = useState(true);
  useEffect(() => {
    if (!autoScroll || !containerRef.current) return;
    if (text.length === lastLenRef.current) return;
    lastLenRef.current = text.length;
    containerRef.current.scrollTop = containerRef.current.scrollHeight;
  }, [text, autoScroll]);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "240px 1fr",
        gap: 0,
        flex: 1,
        minHeight: 0,
      }}
    >
      <aside
        style={{
          background: "var(--tac-surface)",
          borderRight: "1px solid var(--tac-border)",
          overflowY: "auto",
          padding: "10px 0",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 14px 10px",
            fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
            fontSize: 12,
          }}
        >
          <FolderOpen size={14} weight="regular" color="var(--tac-mute)" />
          <span style={{ color: "var(--tac-fg)", fontWeight: 600 }}>
            {analysis.mode === "fast" ? "Fast" : "Deep"} analysis
          </span>
        </div>
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {items.map((item) => (
            <LayerRow
              key={item.id}
              item={item}
              isSelected={item.id === selectedId}
              isAvailable={
                item.isFallback ? !!parsed.raw : !!item.markdown
              }
              onSelect={() => setSelectedId(item.id)}
            />
          ))}
        </ul>
      </aside>

      <div
        ref={containerRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          const atBottom =
            el.scrollHeight - el.scrollTop - el.clientHeight < 24;
          setAutoScroll(atBottom);
        }}
        style={{
          background: "var(--tac-bg)",
          overflowY: "auto",
          padding: 24,
        }}
      >
        {analysis.phase === "transcribing" && (
          <div style={{ maxWidth: 820, margin: "0 auto 16px" }}>
            <TranscribeStrip analysis={analysis} />
          </div>
        )}
        <article
          className="tac-report"
          style={{
            maxWidth: 820,
            margin: "0 auto",
            background: "var(--tac-surface)",
            border: "1px solid var(--tac-border)",
            borderRadius: 12,
            padding: "24px 28px",
            color: "var(--tac-fg)",
            fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
            fontSize: 14,
            lineHeight: 1.65,
            minHeight: 200,
          }}
        >
          {selected.markdown ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={MD_COMPONENTS}
            >
              {selected.markdown}
            </ReactMarkdown>
          ) : isRunning ? (
            <span style={{ color: "var(--tac-mute)" }}>
              Streaming — this layer hasn't landed yet.
            </span>
          ) : !text ? (
            <span style={{ color: "var(--tac-mute)" }}>
              No output. The run was aborted before any deltas arrived.
            </span>
          ) : (
            <span style={{ color: "var(--tac-mute)" }}>
              {selected.title} not found in this report. Open{" "}
              <em>Full report</em> for the raw output.
            </span>
          )}
          {isRunning && selected.id !== "raw" && (
            <span
              style={{
                display: "inline-block",
                width: 6,
                height: 14,
                background: "var(--tac-accent)",
                verticalAlign: "middle",
                marginLeft: 4,
                animation: "tac-pulse 1s ease-in-out infinite",
              }}
              aria-hidden
            />
          )}
        </article>
      </div>
    </div>
  );
}

function LayerRow({ item, isSelected, isAvailable, onSelect }) {
  const Icon = item.isFallback ? FileCode : FileText;
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        style={{
          width: "calc(100% - 12px)",
          textAlign: "left",
          display: "grid",
          gridTemplateColumns: "16px 1fr",
          alignItems: "center",
          gap: 10,
          padding: "8px 10px 8px 22px",
          margin: "1px 6px",
          borderRadius: 6,
          background: isSelected ? "var(--tac-surface2)" : "transparent",
          borderLeft: isSelected
            ? "2px solid var(--tac-accent)"
            : "2px solid transparent",
          border: "none",
          color: isSelected
            ? "var(--tac-fg)"
            : isAvailable
            ? "var(--tac-mute)"
            : "var(--tac-dim)",
          cursor: "pointer",
          fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
          fontSize: 12.5,
          letterSpacing: 0,
          transition: "background 100ms, color 100ms",
        }}
        title={item.title}
      >
        <Icon
          size={13}
          weight="regular"
          color={
            isSelected
              ? "var(--tac-accent)"
              : isAvailable
              ? "var(--tac-mute)"
              : "var(--tac-dim)"
          }
        />
        <span
          style={{
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            fontWeight: isSelected ? 500 : 400,
            opacity: isAvailable ? 1 : 0.7,
          }}
        >
          {item.title}
        </span>
      </button>
    </li>
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
        gap: 10,
        marginBottom: 14,
        padding: "14px 16px",
        background: "var(--tac-surface)",
        border: "1px solid var(--tac-border)",
        borderRadius: 10,
        fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
        fontSize: 12.5,
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
          <Microphone size={14} weight="regular" color="var(--tac-accent)" />
          <span style={{ color: "var(--tac-fg)", fontWeight: 500 }}>
            Transcribing top reels
          </span>
          {p.model && (
            <span
              style={{
                fontSize: 11,
                color: "var(--tac-mute)",
                background: "var(--tac-surface2)",
                border: "1px solid var(--tac-border)",
                borderRadius: 999,
                padding: "1px 8px",
              }}
            >
              {p.model}
            </span>
          )}
        </div>
        <span
          style={{
            fontSize: 12,
            color: "var(--tac-mute)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {completed}/{total} · {pct}%
          {failed && (
            <span style={{ color: "var(--tac-danger)", marginLeft: 6 }}>
              · {p.failed} failed
            </span>
          )}
        </span>
      </div>
      <div
        style={{
          height: 4,
          background: "var(--tac-surface2)",
          borderRadius: 2,
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
            background: failed ? "var(--tac-danger)" : "var(--tac-accent)",
            transition: "width 240ms ease",
          }}
        />
      </div>
      <div style={{ color: "var(--tac-mute)", fontSize: 11.5, lineHeight: 1.55 }}>
        Groq Whisper · {p.strategy || "top engagement"} · transcripts feed the
        analysis prompt before the report stream opens.
      </div>
    </div>
  );
}

const MD_COMPONENTS = {
  h1: (p) => (
    <h1
      style={{
        fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
        fontSize: 19,
        fontWeight: 600,
        color: "var(--tac-fg)",
        margin: "20px 0 10px",
        borderBottom: "1px solid var(--tac-border)",
        paddingBottom: 8,
      }}
      {...p}
    />
  ),
  h2: (p) => (
    <h2
      style={{
        fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
        fontSize: 16,
        fontWeight: 600,
        color: "var(--tac-fg)",
        margin: "18px 0 8px",
      }}
      {...p}
    />
  ),
  h3: (p) => (
    <h3
      style={{
        fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
        fontSize: 14,
        fontWeight: 600,
        color: "var(--tac-fg)",
        margin: "14px 0 6px",
      }}
      {...p}
    />
  ),
  h4: (p) => (
    <h4
      style={{
        fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
        fontSize: 13,
        fontWeight: 600,
        color: "var(--tac-mute)",
        margin: "12px 0 4px",
      }}
      {...p}
    />
  ),
  p: (p) => <p style={{ margin: "8px 0", lineHeight: 1.65 }} {...p} />,
  strong: (p) => <strong style={{ color: "var(--tac-fg)", fontWeight: 600 }} {...p} />,
  em: (p) => <em style={{ color: "var(--tac-fg)" }} {...p} />,
  ul: (p) => (
    <ul style={{ margin: "8px 0 8px 20px", paddingLeft: 4 }} {...p} />
  ),
  ol: (p) => (
    <ol style={{ margin: "8px 0 8px 20px", paddingLeft: 4 }} {...p} />
  ),
  li: (p) => <li style={{ margin: "3px 0", lineHeight: 1.6 }} {...p} />,
  blockquote: (p) => (
    <blockquote
      style={{
        margin: "10px 0",
        padding: "8px 14px",
        borderLeft: "3px solid var(--tac-accent)",
        background: "var(--tac-surface2)",
        borderRadius: 4,
        color: "var(--tac-fg)",
      }}
      {...p}
    />
  ),
  code: ({ inline, ...p }) =>
    inline ? (
      <code
        style={{
          background: "var(--tac-surface2)",
          border: "1px solid var(--tac-border)",
          borderRadius: 4,
          padding: "1px 5px",
          color: "var(--tac-fg)",
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 12,
        }}
        {...p}
      />
    ) : (
      <pre
        style={{
          margin: "10px 0",
          padding: "12px 14px",
          background: "var(--tac-surface2)",
          border: "1px solid var(--tac-border)",
          borderRadius: 6,
          color: "var(--tac-fg)",
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 12,
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
        margin: "16px 0",
      }}
    />
  ),
  table: (p) => (
    <table
      style={{
        borderCollapse: "collapse",
        width: "100%",
        margin: "12px 0",
        fontSize: 13,
      }}
      {...p}
    />
  ),
  th: (p) => (
    <th
      style={{
        textAlign: "left",
        padding: "8px 10px",
        background: "var(--tac-surface2)",
        color: "var(--tac-mute)",
        borderBottom: "1px solid var(--tac-border)",
        fontWeight: 500,
        fontSize: 12,
      }}
      {...p}
    />
  ),
  td: (p) => (
    <td
      style={{
        padding: "8px 10px",
        borderBottom: "1px solid var(--tac-border)",
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
        background: active ? "var(--tac-bg)" : "transparent",
        border: "none",
        color: active ? "var(--tac-fg)" : "var(--tac-mute)",
        padding: "6px 14px",
        fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
        fontSize: 12.5,
        fontWeight: active ? 500 : 400,
        borderRadius: 6,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        transition: "background 120ms, color 120ms",
      }}
    >
      {children}
      {indicator}
    </button>
  );
}

function RunMeta({ analysis }) {
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
      ? "var(--tac-accent)"
      : status === "done"
      ? "var(--tac-success)"
      : status === "stopped"
      ? "var(--tac-warning)"
      : "var(--tac-danger)";
  const label =
    status === "running"
      ? "Running"
      : status === "done"
      ? "Done"
      : status === "stopped"
      ? "Stopped"
      : "Error";

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        background: "var(--tac-surface2)",
        border: "1px solid var(--tac-border)",
        borderRadius: 999,
        fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
        fontSize: 11,
        color,
      }}
    >
      <Icon size={11} weight="regular" />
      <span style={{ fontWeight: 500 }}>{label}</span>
      <span style={{ color: "var(--tac-mute)" }}>
        · {fmtChars(analysis.text.length)}
      </span>
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
    running: "var(--tac-accent)",
    done: "var(--tac-success)",
    stopped: "var(--tac-warning)",
    error: "var(--tac-danger)",
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

function AnalyzeEmpty() {
  return <EmptyHint />;
}

function useBaseName(filename, creator) {
  return useMemo(() => {
    const base = (filename || "chiqo").replace(/\.csv$/i, "");
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
