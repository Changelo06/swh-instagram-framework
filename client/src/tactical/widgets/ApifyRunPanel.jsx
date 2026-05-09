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
  const variant =
    status === "done"
      ? "ok"
      : status === "error"
      ? "err"
      : status === "stopped"
      ? "warn"
      : "accent";
  const label =
    status === "done"
      ? "Dataset loaded"
      : status === "error"
      ? "Failed"
      : status === "stopped"
      ? "Stopped"
      : phase === "submitting"
      ? "Submitting"
      : phase === "queued"
      ? "Queued on Apify"
      : phase === "transcribing"
      ? `Transcribing · ${(run.actorStatus || "running").toLowerCase()}`
      : phase === "scraping"
      ? `Scraping · ${(run.actorStatus || "running").toLowerCase()}`
      : `Running · ${(run.actorStatus || "starting").toLowerCase()}`;

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
        borderRadius: 10,
        padding: "16px 20px",
        display: "grid",
        gap: 12,
        fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
        fontSize: 13,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <span
          className={`tac-pill tac-pill--${variant}`}
          style={{ paddingTop: 4, paddingBottom: 4 }}
        >
          <Icon size={13} weight="regular" />
          {label}
        </span>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              color: "var(--tac-mute)",
              fontSize: 12,
              fontVariantNumeric: "tabular-nums",
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
              className="tac-btn tac-btn-danger"
              style={{ padding: "4px 10px", fontSize: 12 }}
            >
              <Stop size={12} weight="fill" />
              Stop
            </button>
          )}
          {isTerminal && (
            <button
              type="button"
              onClick={clearApifyRun}
              aria-label="Clear last scrape"
              className="tac-btn"
              style={{ padding: "4px 8px", fontSize: 12 }}
            >
              <Trash size={12} weight="regular" />
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
            fontSize: 12,
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            transition: "color 120ms",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.color = "var(--tac-accent)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.color = "var(--tac-mute)")
          }
        >
          Watch run on Apify console
          <ArrowSquareOut size={12} weight="regular" />
        </a>
      )}

      {run.error && (
        <div className="tac-error-banner">
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              wordBreak: "break-word",
            }}
          >
            <Warning
              size={14}
              weight="regular"
              color="var(--tac-danger)"
              style={{ marginTop: 2, flexShrink: 0 }}
            />
            <span>{run.error}</span>
          </div>
        </div>
      )}

      {run.warning && !run.error && (
        <div
          style={{
            color: "var(--tac-warning)",
            fontSize: 12,
            lineHeight: 1.5,
            wordBreak: "break-word",
            background: "rgba(245, 184, 46, 0.1)",
            border: "1px solid rgba(245, 184, 46, 0.25)",
            borderRadius: 6,
            padding: "8px 12px",
          }}
        >
          {run.warning}
        </div>
      )}

      {isRunning && (
        <div
          style={{
            height: 4,
            background: "var(--tac-surface2)",
            borderRadius: 4,
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
              background: "var(--tac-accent)",
              borderRadius: 4,
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
        background: "var(--tac-surface2)",
        border: "1px solid var(--tac-border)",
        borderRadius: 6,
        fontSize: 12,
      }}
    >
      <summary
        style={{
          padding: "8px 12px",
          cursor: "pointer",
          color: "var(--tac-mute)",
          listStyle: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <span>Runtime · {states.length} states</span>
        <span
          style={{
            color: "var(--tac-dim)",
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          }}
        >
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
          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
        }}
      >
        {states.map((s, i) => (
          <li
            key={i}
            style={{
              display: "grid",
              gridTemplateColumns: "70px 12px 1fr",
              gap: 8,
              padding: "6px 12px",
              borderBottom:
                i === states.length - 1
                  ? "none"
                  : "1px solid var(--tac-border)",
              alignItems: "baseline",
              fontSize: 11,
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
                color: s.client
                  ? "var(--tac-warning)"
                  : "var(--tac-accent)",
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
