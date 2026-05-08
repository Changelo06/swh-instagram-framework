import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Plus,
  Stop,
  Trash,
  ArrowSquareOut,
  Eye,
  Heart,
  ChatCircle,
  CheckCircle,
  XCircle,
  Clock,
  Microphone,
  Sparkle,
  ArrowsCounterClockwise,
} from "@phosphor-icons/react";
import { useCsv, STAGE, ALL_HANDLE } from "../state/CsvContext.jsx";
import EmptyHint from "../widgets/EmptyHint.jsx";
import ExportMenu from "../widgets/ExportMenu.jsx";
import CreateVariationModal from "../widgets/CreateVariationModal.jsx";
import ConfirmAction from "../widgets/ConfirmAction.jsx";
import CreatorTabs from "../widgets/CreatorTabs.jsx";
import { exportVariation } from "../lib/exporters.js";

export default function ScriptsView() {
  const {
    stage,
    rows,
    filename,
    selectedCreator,
    selectedHandle,
    setSelectedHandle,
    creators,
    variations,
    activeVariationId,
    setActiveVariationId,
    stopVariation,
    removeVariation,
    retryVariation,
  } = useCsv();

  const [modalOpen, setModalOpen] = useState(false);

  // Variation forging targets a single creator's reels — drop out of the
  // unified ALL filter back to the first creator on entry so the modal's
  // source-video list isn't a confused blend.
  useEffect(() => {
    if (selectedHandle === ALL_HANDLE && creators.length > 0) {
      setSelectedHandle(creators[0].handle);
    }
  }, [selectedHandle, creators, setSelectedHandle]);

  if (stage !== STAGE.READY || !rows.length) {
    return <EmptyHint />;
  }

  const active = variations.find((v) => v.id === activeVariationId) || null;
  const baseName = `${(filename || "swh-variation").replace(/\.csv$/i, "")}${
    selectedCreator?.handle ? `-${selectedCreator.handle}` : ""
  }`;

  // Page cap holds the notepad to a comfortable scan size while still leaving
  // room for cross-creator batches (e.g. forge a script from each of 5
  // creators in one shot). Reaching the cap disables the [+ NEW] entry
  // until the operator removes pages.
  const PAGE_CAP = 12;
  const atCap = variations.length >= PAGE_CAP;
  const tryOpen = () => {
    if (!atCap) setModalOpen(true);
  };

  return (
    <>
      <section
        style={{
          display: "grid",
          gridTemplateRows: "auto 1fr",
          gap: 1,
          background: "var(--tac-border)",
          minHeight: "calc(100dvh - 44px)",
        }}
      >
        <CreatorTabs label="SCRIPTS // CREATOR" />

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
            background: "var(--tac-surface2)",
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
              gap: 8,
            }}
          >
            <span className="tac-label">
              PAGES · {variations.length}/{PAGE_CAP}
            </span>
            <button
              type="button"
              onClick={tryOpen}
              disabled={atCap}
              className="tac-btn tac-btn-accent"
              style={{
                padding: "4px 8px",
                fontSize: 9,
                opacity: atCap ? 0.4 : 1,
                cursor: atCap ? "not-allowed" : "pointer",
              }}
              title={atCap ? "Page cap reached (3 max)" : "Forge a new script page"}
            >
              <Plus size={10} weight="bold" />
              NEW
            </button>
          </div>

          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              overflowY: "auto",
            }}
          >
            {variations.length === 0 && (
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
                // notepad is empty · click [+ NEW] to forge a script variation
                page from any reel in the dataset.
              </li>
            )}
            {[...variations].reverse().map((v) => {
              const isSelected = active?.id === v.id;
              return (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => setActiveVariationId(v.id)}
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
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <span
                        style={{
                          letterSpacing: "0.04em",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          minWidth: 0,
                        }}
                        title={v.name}
                      >
                        {v.name}
                      </span>
                      <StatusDot status={v.status} />
                    </div>
                    <div style={{ fontSize: 9, color: "var(--tac-dim)" }}>
                      {fmtTime(v.startedAt)} · {v.count}× · {fmtChars(v.text.length)}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <div
          style={{
            background: "var(--tac-bg)",
            display: "grid",
            gridTemplateRows: "auto 1fr",
            overflow: "hidden",
          }}
        >
          {active ? (
            <PagePanel
              variation={active}
              stop={stopVariation}
              remove={removeVariation}
              retry={retryVariation}
              baseName={baseName}
            />
          ) : (
            <BlankPage onCreate={tryOpen} atCap={atCap} cap={PAGE_CAP} />
          )}
        </div>
        </div>
      </section>

      <CreateVariationModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={(id) => setActiveVariationId(id)}
        slotsAvailable={Math.max(0, PAGE_CAP - variations.length)}
      />
    </>
  );
}

function BlankPage({ onCreate, atCap, cap }) {
  return (
    <div
      style={{
        display: "grid",
        placeItems: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          textAlign: "center",
          fontFamily: '"JetBrains Mono", monospace',
          color: "var(--tac-mute)",
          fontSize: 12,
          lineHeight: 1.7,
        }}
      >
        // notepad
        <br />
        // pick a page from the left or click + to forge a new variation
        <br />
        <span style={{ color: "var(--tac-dim)", fontSize: 10 }}>
          // cap: {cap} pages · 5 variations per page
        </span>
        <br />
        <button
          type="button"
          onClick={onCreate}
          disabled={atCap}
          className="tac-btn tac-btn-accent"
          style={{
            marginTop: 18,
            padding: "8px 16px",
            fontSize: 11,
            opacity: atCap ? 0.4 : 1,
            cursor: atCap ? "not-allowed" : "pointer",
          }}
        >
          <Plus size={12} weight="bold" />
          {atCap ? "PAGE CAP REACHED" : "NEW SCRIPT PAGE"}
        </button>
      </div>
    </div>
  );
}

function PagePanel({ variation, stop, remove, retry, baseName }) {
  const isRunning = variation.status === "running";
  const containerRef = useRef(null);
  const lastLenRef = useRef(0);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (!autoScroll || !containerRef.current) return;
    if (variation.text.length === lastLenRef.current) return;
    lastLenRef.current = variation.text.length;
    containerRef.current.scrollTop = containerRef.current.scrollHeight;
  }, [variation.text, autoScroll]);

  const src = variation.sourceVideo || {};

  return (
    <>
      <header
        style={{
          background: "var(--tac-surface2)",
          borderBottom: "1px solid var(--tac-border)",
          padding: "12px 16px",
          display: "grid",
          gridTemplateColumns: "1fr auto",
          alignItems: "center",
          gap: 16,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <span className="tac-label">SCRIPT PAGE //</span>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 12,
              marginTop: 4,
              flexWrap: "wrap",
            }}
          >
            <span
              className="tac-display"
              style={{
                fontSize: 18,
                color: "var(--tac-fg)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: 400,
              }}
              title={variation.name}
            >
              {variation.name}
            </span>
            <SourceCard src={src} count={variation.count} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <RunMeta variation={variation} />
          {isRunning ? (
            <button
              type="button"
              onClick={() => stop(variation.id)}
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
                onConfirm={() => retry(variation.id)}
                label="RETRY"
                armedLabel="CONFIRM RETRY"
                Icon={ArrowsCounterClockwise}
                tone="warn"
                title="re-run transcribe + blueprint pass · current page is replaced"
              />
              <ExportMenu
                disabled={variation.status !== "done" || !variation.text}
                onExport={(fmt) => exportVariation(fmt, variation, baseName)}
              />
            </>
          )}
          <button
            type="button"
            onClick={() => remove(variation.id)}
            disabled={isRunning}
            aria-label="Delete page"
            className="tac-btn"
            style={{ padding: "6px 8px", fontSize: 10, opacity: isRunning ? 0.4 : 1 }}
          >
            <Trash size={11} weight="regular" />
          </button>
        </div>
      </header>

      <div
        ref={containerRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          const atBottom =
            el.scrollHeight - el.scrollTop - el.clientHeight < 24;
          setAutoScroll(atBottom);
        }}
        style={{
          padding: 18,
          overflowY: "auto",
        }}
      >
        <div
          style={{
            background: "var(--tac-surface2)",
            border: "1px solid var(--tac-border)",
            padding: "16px 18px",
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 12,
            lineHeight: 1.65,
            color: "var(--tac-fg)",
            minHeight: 200,
          }}
        >
          {variation.phase === "transcribing" && <TranscribePanel variation={variation} />}

          {variation.text ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD}>
              {variation.text}
            </ReactMarkdown>
          ) : variation.phase === "analyzing" ? (
            <span style={{ color: "var(--tac-mute)" }}>
              // claude online · streaming reel blueprint
            </span>
          ) : isRunning && variation.phase !== "transcribing" ? (
            <span style={{ color: "var(--tac-mute)" }}>
              // queued
            </span>
          ) : !isRunning && !variation.text ? (
            <span style={{ color: "var(--tac-dim)" }}>
              // empty page · run aborted before any output arrived
            </span>
          ) : null}
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
            />
          )}
        </div>
      </div>
    </>
  );
}

function SourceCard({ src, count }) {
  if (!src || (!src.url && !src.shortCode)) return null;
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 12,
        padding: "5px 10px",
        background: "var(--tac-surface)",
        border: "1px solid var(--tac-border)",
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 9,
        color: "var(--tac-mute)",
        letterSpacing: "0.06em",
      }}
    >
      <span style={{ color: "#4f8dfe" }}>{count}× BLUEPRINTS</span>
      <Stat icon={Eye} value={fmt(src.views)} label="VWS" />
      <Stat icon={Heart} value={fmt(src.likes)} label="LKS" />
      <Stat icon={ChatCircle} value={fmt(src.comments)} label="CMT" />
      {src.url && (
        <a
          href={src.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: "var(--tac-mute)",
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            transition: "color 120ms",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--tac-fg)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--tac-mute)")}
        >
          SOURCE
          <ArrowSquareOut size={9} weight="regular" />
        </a>
      )}
    </div>
  );
}

function Stat({ icon: Icon, value, label }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
      <Icon size={9} weight="regular" />
      <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--tac-fg)" }}>
        {value}
      </span>
      <span style={{ color: "var(--tac-dim)" }}>{label}</span>
    </span>
  );
}

function RunMeta({ variation }) {
  const status = variation.status;
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
      {status.toUpperCase()} · {fmtChars(variation.text.length)}
      {status === "done" && variation.usage && (
        <span style={{ color: "var(--tac-mute)" }}>
          · {variation.usage.input_tokens?.toLocaleString() || 0}/
          {variation.usage.output_tokens?.toLocaleString() || 0}
        </span>
      )}
    </div>
  );
}

function TranscribePanel({ variation }) {
  const p = variation.transcribeProgress || {};
  const total = p.total || 1;
  const completed = p.completed || 0;
  const pct = Math.min(100, Math.round((completed / Math.max(total, 1)) * 100));
  const failed = p.ok === false;
  const done = completed >= total && p.ok !== false;

  return (
    <div
      style={{
        display: "grid",
        gap: 8,
        marginBottom: 14,
        padding: "12px 14px",
        background: "var(--tac-bg)",
        border: "1px solid var(--tac-border)",
        borderLeft: failed
          ? "3px solid #ef4444"
          : done
          ? "3px solid #4AF626"
          : "3px solid #4f8dfe",
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
          <Microphone
            size={13}
            weight="regular"
            color={failed ? "#ef4444" : done ? "#4AF626" : "#4f8dfe"}
          />
          <span style={{ color: "var(--tac-fg)", fontWeight: 600, letterSpacing: "0.04em" }}>
            {failed ? "TRANSCRIBE FAILED" : done ? "TRANSCRIBE COMPLETE" : "TRANSCRIBING SOURCE REEL"}
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
            background: failed ? "#ef4444" : done ? "#4AF626" : "#4f8dfe",
            transition: "width 240ms ease",
            animation: !done && !failed ? "tac-pulse 1.6s ease-in-out infinite" : "none",
          }}
        />
      </div>

      {p.error && (
        <div style={{ color: "#ef4444", fontSize: 10, lineHeight: 1.5 }}>
          // {p.error}
        </div>
      )}

      <div style={{ color: "var(--tac-mute)", fontSize: 10, lineHeight: 1.5 }}>
        // groq whisper · single-reel transcription · funneled into the
        variation context window before claude opens the blueprint stream.
      </div>
    </div>
  );
}

function StatusDot({ status }) {
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

const MD = {
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
  strong: (p) => (
    <strong style={{ color: "#4f8dfe", fontWeight: 600 }} {...p} />
  ),
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
  hr: () => (
    <hr
      style={{
        border: "none",
        borderTop: "1px solid var(--tac-border)",
        margin: "12px 0",
      }}
    />
  ),
};

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

function fmt(n) {
  if (n == null || Number.isNaN(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}
