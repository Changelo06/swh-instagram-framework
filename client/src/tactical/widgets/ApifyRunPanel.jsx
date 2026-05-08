import {
  CheckCircle,
  XCircle,
  Clock,
  Warning,
  Stop,
  ArrowSquareOut,
  Trash,
} from "@phosphor-icons/react";
import { useCsv } from "../state/CsvContext.jsx";

// Shared scrape-status panel, rendered on both the Dashboard and the Apify
// page so the operator can monitor (and abort) a run from whichever view
// they're on. Reads `apifyRun` and the stop/clear callbacks straight from
// the CsvContext — the parent doesn't have to thread them through.
export default function ApifyRunPanel() {
  const { apifyRun, stopApifyScrape, clearApifyRun } = useCsv();
  const run = apifyRun;
  if (!run || run.status === "idle") return null;

  const status = run.status;
  const phase = run.phase;
  const isRunning = status === "running";
  const isTerminal =
    status === "done" || status === "error" || status === "stopped";

  const Icon =
    status === "done"
      ? CheckCircle
      : status === "error"
      ? XCircle
      : status === "stopped"
      ? Stop
      : isRunning
      ? Clock
      : Warning;
  const tone =
    status === "done"
      ? "#4AF626"
      : status === "error"
      ? "#ef4444"
      : status === "stopped"
      ? "#fbbf24"
      : "#4f8dfe";
  const label =
    status === "done"
      ? "DATASET LOADED"
      : status === "error"
      ? "FAILED"
      : status === "stopped"
      ? "STOPPED"
      : phase === "submitting"
      ? "SUBMITTING"
      : phase === "queued"
      ? "QUEUED ON APIFY"
      : phase === "transcribing"
      ? `TRANSCRIBING · ${run.actorStatus || "RUNNING"}`
      : phase === "scraping"
      ? `SCRAPING · ${run.actorStatus || "RUNNING"}`
      : `RUNNING · ${run.actorStatus || "STARTING"}`;

  const elapsed = run.startedAt
    ? Math.max(
        0,
        Math.round(((run.finishedAt || Date.now()) - run.startedAt) / 1000)
      )
    : 0;

  return (
    <div
      style={{
        background: "var(--tac-surface)",
        border: "1px solid var(--tac-border)",
        borderLeft: `3px solid ${tone}`,
        padding: "14px 16px",
        display: "grid",
        gap: 10,
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
          <Icon size={14} weight="regular" color={tone} />
          <span
            style={{
              color: tone,
              fontWeight: 600,
              letterSpacing: "0.08em",
            }}
          >
            {label}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              color: "var(--tac-mute)",
              letterSpacing: "0.06em",
              fontSize: 10,
            }}
          >
            {elapsed}s ·{" "}
            {run.phase === "transcribing" && run.transcribeTotal
              ? `${run.itemCount || 0} / ${run.transcribeTotal} transcribed`
              : `${run.itemCount || 0} items`}
          </span>
          {isRunning && (
            <button
              type="button"
              onClick={stopApifyScrape}
              aria-label="Stop scrape"
              style={{
                background: "#ef4444",
                border: "1px solid #ef4444",
                color: "var(--tac-bg)",
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                padding: "4px 10px",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <Stop size={11} weight="fill" />
              STOP
            </button>
          )}
          {isTerminal && (
            <button
              type="button"
              onClick={clearApifyRun}
              aria-label="Clear last scrape"
              className="tac-btn"
              style={{ padding: "4px 8px", fontSize: 10 }}
            >
              <Trash size={10} weight="regular" />
            </button>
          )}
        </div>
      </div>

      {run.consoleUrl && (
        <a
          href={run.consoleUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: "var(--tac-mute)",
            fontSize: 10,
            letterSpacing: "0.06em",
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          watch run on apify console
          <ArrowSquareOut size={10} weight="regular" />
        </a>
      )}

      {run.error && (
        <div
          style={{
            color: "#ef4444",
            fontSize: 10,
            lineHeight: 1.5,
            wordBreak: "break-word",
            background: "#1f1212",
            padding: "8px 10px",
            border: "1px solid var(--tac-border)",
          }}
        >
          // {run.error}
        </div>
      )}

      {run.warning && !run.error && (
        <div
          style={{
            color: "#fbbf24",
            fontSize: 10,
            lineHeight: 1.5,
            wordBreak: "break-word",
            background: "rgba(251, 191, 36, 0.06)",
            padding: "8px 10px",
            border: "1px solid #fbbf24",
          }}
        >
          // warn: {run.warning}
        </div>
      )}

      {isRunning && (
        <div
          style={{
            height: 4,
            background: "var(--tac-bg)",
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
              width: "30%",
              background: tone,
              animation: "tac-pulse 1.6s ease-in-out infinite",
            }}
          />
        </div>
      )}

      <RuntimeTimeline states={run.states} />
    </div>
  );
}

// Collapsible diagnostic list. Each row shows elapsed-ms since the run
// started, the state label (server- or client-tagged), and an optional
// detail blob. When a run hangs the timeline shows exactly which step is
// holding things up — the operator can paste this into a bug report.
function RuntimeTimeline({ states }) {
  if (!Array.isArray(states) || states.length === 0) return null;
  const last = states[states.length - 1];
  return (
    <details
      style={{
        marginTop: 4,
        background: "var(--tac-bg)",
        border: "1px solid var(--tac-border)",
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 10,
      }}
    >
      <summary
        style={{
          padding: "6px 10px",
          cursor: "pointer",
          color: "var(--tac-mute)",
          letterSpacing: "0.08em",
          listStyle: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <span>RUNTIME · {states.length} states</span>
        <span style={{ color: "var(--tac-dim)" }}>
          last: {last.label} (+{last.t}ms)
        </span>
      </summary>
      <ol
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          maxHeight: 240,
          overflowY: "auto",
          borderTop: "1px solid var(--tac-border)",
        }}
      >
        {states.map((s, i) => (
          <li
            key={i}
            style={{
              display: "grid",
              gridTemplateColumns: "70px 12px 1fr",
              gap: 8,
              padding: "4px 10px",
              borderBottom:
                i === states.length - 1
                  ? "none"
                  : "1px solid var(--tac-surface)",
              alignItems: "baseline",
            }}
          >
            <span
              style={{
                color: "var(--tac-dim)",
                fontVariantNumeric: "tabular-nums",
                textAlign: "right",
              }}
            >
              +{s.t}ms
            </span>
            <span
              title={s.client ? "client-side" : "server-side"}
              style={{
                color: s.client ? "#fbbf24" : "#4f8dfe",
                fontWeight: 700,
                textAlign: "center",
              }}
            >
              {s.client ? "C" : "S"}
            </span>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  color: "var(--tac-fg)",
                  letterSpacing: "0.04em",
                  fontWeight: 500,
                }}
              >
                {s.label}
              </div>
              {s.detail != null && s.detail !== "" && (
                <div
                  style={{
                    color: "var(--tac-mute)",
                    marginTop: 1,
                    wordBreak: "break-word",
                  }}
                >
                  {typeof s.detail === "string"
                    ? s.detail
                    : JSON.stringify(s.detail)}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </details>
  );
}
