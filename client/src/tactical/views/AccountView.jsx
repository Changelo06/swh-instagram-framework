import { useEffect, useState, useCallback, useMemo } from "react";
import { ArrowClockwise, CreditCard } from "@phosphor-icons/react";

// Account / usage page.
//
// Reads chiqo.usage.summary + chiqo.usage.daily. All numbers are
// computed over the runs table in the vault DB, so the page is empty
// until at least one paid run has finished — and it survives lock /
// unlock / restart.
//
// Time windows kept short: 24h, 7d, 30d, all-time. Anything longer
// rarely answers a useful question.

const DAY_MS = 24 * 60 * 60 * 1000;

function fmtUsd(usd) {
  if (!usd) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function fmtTokens(n) {
  if (!n) return "0";
  if (n < 1000) return n.toString();
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

export default function AccountView() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [windows, setWindows] = useState({ all: null, m30: null, d7: null, h24: null });
  const [daily, setDaily] = useState([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const c = typeof window !== "undefined" ? window.chiqo : null;
      if (!c?.usage?.summary) throw new Error("chiqo.ai bridge unavailable");
      const now = Date.now();
      const [all, m30, d7, h24, daily30] = await Promise.all([
        c.usage.summary({}),
        c.usage.summary({ sinceMs: now - 30 * DAY_MS }),
        c.usage.summary({ sinceMs: now - 7 * DAY_MS }),
        c.usage.summary({ sinceMs: now - 24 * 60 * 60 * 1000 }),
        c.usage.daily({ days: 30 }),
      ]);
      setWindows({ all, m30, d7, h24 });
      setDaily(Array.isArray(daily30) ? daily30 : []);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const maxCost = useMemo(
    () => daily.reduce((m, d) => Math.max(m, d.totalCostUsd || 0), 0) || 1,
    [daily]
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
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <CreditCard size={18} weight="regular" /> Account
          </h1>
          <p style={{ fontSize: 13, color: "var(--tac-mute)", marginTop: 4 }}>
            What you've spent on this vault. Numbers come from the runs table —
            nothing leaves your machine.
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <SummaryTile label="Last 24h" data={windows.h24} />
        <SummaryTile label="Last 7 days" data={windows.d7} />
        <SummaryTile label="Last 30 days" data={windows.m30} />
        <SummaryTile label="All time" data={windows.all} accent />
      </div>

      <section
        style={{
          border: "1px solid var(--tac-border)",
          borderRadius: 10,
          background: "var(--tac-surface)",
          padding: 20,
        }}
      >
        <h2
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "var(--tac-mute)",
            margin: 0,
            marginBottom: 16,
            textTransform: "none",
            letterSpacing: 0,
          }}
        >
          Daily spend — last 30 days
        </h2>
        <div
          style={{
            display: "flex",
            gap: 4,
            alignItems: "flex-end",
            height: 120,
          }}
        >
          {daily.map((d) => {
            const heightPct = d.totalCostUsd
              ? Math.max(2, (d.totalCostUsd / maxCost) * 100)
              : 1;
            return (
              <div
                key={d.dayMs}
                title={`${d.dayLabel}: ${fmtUsd(d.totalCostUsd)} · ${d.runs} run${d.runs === 1 ? "" : "s"}`}
                style={{
                  flex: 1,
                  height: `${heightPct}%`,
                  background:
                    d.totalCostUsd > 0
                      ? "var(--tac-accent, #4f8dfe)"
                      : "var(--tac-border)",
                  borderRadius: 2,
                  minHeight: 2,
                  cursor: "default",
                }}
              />
            );
          })}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            color: "var(--tac-mute)",
            fontSize: 11,
            marginTop: 8,
          }}
        >
          <span>{daily[0]?.dayLabel || ""}</span>
          <span>{daily[daily.length - 1]?.dayLabel || ""}</span>
        </div>
      </section>
    </div>
  );
}

function SummaryTile({ label, data, accent }) {
  return (
    <div
      style={{
        border: "1px solid var(--tac-border)",
        borderRadius: 10,
        background: accent ? "var(--tac-surface2)" : "var(--tac-surface)",
        padding: 16,
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: "var(--tac-mute)",
          marginBottom: 6,
          textTransform: "none",
          letterSpacing: 0,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 600,
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "-0.01em",
        }}
      >
        {data ? fmtUsd(data.totalCostUsd || 0) : "—"}
      </div>
      <div
        style={{
          fontSize: 11,
          color: "var(--tac-mute)",
          marginTop: 8,
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        <span>
          {data?.totalRuns || 0} run{data?.totalRuns === 1 ? "" : "s"}
        </span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>
          {fmtTokens(data?.inputTokens || 0)} in · {fmtTokens(data?.outputTokens || 0)} out
        </span>
      </div>
    </div>
  );
}
