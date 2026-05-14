import { useEffect, useState, useCallback, useMemo } from "react";
import {
  CheckCircle,
  XCircle,
  Stop,
  Clock,
  Trash,
  ArrowClockwise,
} from "@phosphor-icons/react";

// Runs history page.
//
// Reads from chiqo.runs.list() — backed by the vault DB after Phase 3
// landed. Each row shows the run's provider/type, status, model,
// started time, duration, and the cost (denormalized at write time).
//
// We deliberately don't try to be too clever here: no live filtering
// down to a single provider, no in-place editing, no detail view yet.
// This is the historical record — the live state for in-flight runs
// stays in the AnalyzeView / ApifyView panels.

const STATUS_PILL = {
  done: { color: "#22c55e", icon: CheckCircle, label: "Done" },
  error: { color: "#ef4444", icon: XCircle, label: "Error" },
  stopped: { color: "#f59e0b", icon: Stop, label: "Stopped" },
  starting: { color: "#4f8dfe", icon: Clock, label: "Starting" },
  streaming: { color: "#4f8dfe", icon: Clock, label: "Running" },
};

function fmtTime(ms) {
  if (!ms) return "—";
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return String(ms);
  }
}

function fmtDuration(startMs, endMs) {
  if (!startMs) return "—";
  const end = endMs || Date.now();
  const s = Math.max(0, end - startMs) / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s - m * 60);
  return `${m}m ${rem}s`;
}

function fmtCost(usd) {
  if (!usd) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

export default function RunsView() {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const c = typeof window !== "undefined" ? window.chiqo : null;
      if (!c?.runs?.list) throw new Error("chiqo.ai bridge unavailable");
      const list = await c.runs.list();
      setRuns(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const remove = useCallback(
    async (id) => {
      const c = typeof window !== "undefined" ? window.chiqo : null;
      if (!c?.runs?.delete) return;
      try {
        await c.runs.delete(id);
        await refresh();
      } catch (e) {
        setError(e.message || String(e));
      }
    },
    [refresh]
  );

  const totalCost = useMemo(
    () => runs.reduce((acc, r) => acc + (r.costUsd || 0), 0),
    [runs]
  );

  return (
    <div style={{ padding: "24px 32px", color: "var(--tac-fg)" }}>
      <header
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 24,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: "-0.01em",
              margin: 0,
            }}
          >
            Runs
          </h1>
          <p
            style={{
              fontSize: 13,
              color: "var(--tac-mute)",
              marginTop: 4,
            }}
          >
            Every paid model call you've made on this vault.{" "}
            {runs.length > 0 && (
              <>
                {runs.length} run{runs.length === 1 ? "" : "s"} ·{" "}
                <span style={{ fontVariantNumeric: "tabular-nums" }}>
                  {fmtCost(totalCost)} total
                </span>
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          className="tac-btn"
          onClick={refresh}
          disabled={loading}
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <ArrowClockwise
            size={13}
            className={loading ? "animate-spin" : ""}
            weight="regular"
          />
          Refresh
        </button>
      </header>

      {error && (
        <div className="tac-error-banner" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}

      {!loading && runs.length === 0 && !error && (
        <p style={{ color: "var(--tac-mute)", fontSize: 13 }}>
          No runs yet. Start an analyze or scrape and they'll show up here.
        </p>
      )}

      {runs.length > 0 && (
        <div
          style={{
            border: "1px solid var(--tac-border)",
            borderRadius: 10,
            overflow: "hidden",
            background: "var(--tac-surface)",
          }}
        >
          <table
            className="tac-table"
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 13,
            }}
          >
            <thead>
              <tr
                style={{
                  background: "var(--tac-surface2)",
                  color: "var(--tac-mute)",
                  fontSize: 11,
                  fontWeight: 500,
                  textAlign: "left",
                }}
              >
                <th style={{ padding: "10px 14px" }}>Run</th>
                <th style={{ padding: "10px 14px" }}>Status</th>
                <th style={{ padding: "10px 14px" }}>Model</th>
                <th style={{ padding: "10px 14px" }}>Started</th>
                <th style={{ padding: "10px 14px" }}>Duration</th>
                <th
                  style={{
                    padding: "10px 14px",
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  Cost
                </th>
                <th style={{ padding: "10px 14px", width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => {
                const pill = STATUS_PILL[r.status] || STATUS_PILL.done;
                const PillIcon = pill.icon;
                const inFlight =
                  r.status === "starting" || r.status === "streaming";
                return (
                  <tr
                    key={r.id}
                    style={{
                      borderTop: "1px solid var(--tac-border)",
                    }}
                  >
                    <td
                      style={{
                        padding: "12px 14px",
                        fontFamily:
                          '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
                        fontSize: 12,
                        color: "var(--tac-mute)",
                      }}
                    >
                      <div style={{ color: "var(--tac-fg)", fontFamily: "inherit" }}>
                        {r.type || "—"}
                      </div>
                      <div style={{ fontSize: 11 }}>{r.id}</div>
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <span
                        title={r.error || pill.label}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "2px 8px",
                          borderRadius: 9999,
                          fontSize: 11,
                          color: pill.color,
                          background: `${pill.color}15`,
                          border: `1px solid ${pill.color}55`,
                        }}
                      >
                        <PillIcon size={11} weight="regular" />
                        {pill.label}
                      </span>
                    </td>
                    <td style={{ padding: "12px 14px", color: "var(--tac-mute)" }}>
                      {r.model || "—"}
                    </td>
                    <td
                      style={{
                        padding: "12px 14px",
                        color: "var(--tac-mute)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {fmtTime(r.startedAt)}
                    </td>
                    <td
                      style={{
                        padding: "12px 14px",
                        color: "var(--tac-mute)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {fmtDuration(r.startedAt, r.finishedAt)}
                    </td>
                    <td
                      style={{
                        padding: "12px 14px",
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {fmtCost(r.costUsd)}
                    </td>
                    <td style={{ padding: "8px 14px", textAlign: "right" }}>
                      {!inFlight && (
                        <button
                          type="button"
                          onClick={() => remove(r.id)}
                          title="Delete this run"
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "var(--tac-mute)",
                            cursor: "pointer",
                            padding: 6,
                          }}
                        >
                          <Trash size={13} weight="regular" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
