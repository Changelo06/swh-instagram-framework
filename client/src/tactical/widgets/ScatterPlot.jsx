import { memo, useMemo } from "react";
import {
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import WidgetFrame from "./WidgetFrame.jsx";

const DURATION_BUCKETS = [
  { max: 15, color: "#fbbf24", label: "0-15s" },
  { max: 30, color: "#f97316", label: "15-30s" },
  { max: 60, color: "#ec4899", label: "30-60s" },
  { max: 120, color: "#a855f7", label: "60-120s" },
  { max: Infinity, color: "#4f8dfe", label: "120s+" },
];

function bucketColor(duration) {
  for (const b of DURATION_BUCKETS) {
    if (duration < b.max) return b.color;
  }
  return "#4f8dfe";
}

function ScatterPlot({ rows = [], missing = false }) {
  const data = useMemo(() => {
    return rows
      .map((r, i) => {
        const v = num(r.videoViewCount) || num(r.videoPlayCount);
        const e = num(r.likesCount) + num(r.commentsCount);
        return {
          x: v,
          y: e,
          duration: num(r.videoDuration),
          caption: snippet(r.caption, 64),
          url: reelUrl(r),
          idx: i,
        };
      })
      .filter((d) => d.x > 0);
  }, [rows]);

  const onClick = (point) => {
    if (point?.url) {
      window.open(point.url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <WidgetFrame name="REEL PERFORMANCE MAP" type="SCATTER">
      <div style={{ display: "grid", gridTemplateRows: "auto 1fr auto", gap: 10 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 9,
            color: "var(--tac-mute)",
            letterSpacing: "0.1em",
          }}
        >
          <span>X / VIEWS</span>
          <span>Y / ENGAGEMENT (LIKES + COMMENTS)</span>
          <span style={{ color: "#4f8dfe" }}>· {data.length} POINTS</span>
        </div>

        {missing || !data.length ? (
          <div
            style={{
              display: "grid",
              placeItems: "center",
              minHeight: 240,
              background: "var(--tac-surface2)",
              border: "1px dashed var(--tac-border)",
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 11,
              color: "#ef4444",
              letterSpacing: "0.06em",
              textAlign: "center",
              lineHeight: 1.6,
            }}
          >
            // MISSING REQUIRED COLUMNS
            <br />
            <span style={{ color: "var(--tac-mute)" }}>
              scatter plot needs view + engagement data
            </span>
          </div>
        ) : (
          <div style={{ minHeight: 240, background: "var(--tac-bg)", padding: 8 }}>
            <ResponsiveContainer width="100%" height={240}>
              <ScatterChart margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid
                  strokeDasharray="0"
                  stroke="var(--tac-surface)"
                />
                <XAxis
                  type="number"
                  dataKey="x"
                  name="Views"
                  stroke="var(--tac-dim)"
                  tick={{
                    fill: "var(--tac-mute)",
                    fontSize: 9,
                    fontFamily: "JetBrains Mono, monospace",
                  }}
                  tickFormatter={fmt}
                  axisLine={{ stroke: "var(--tac-border)" }}
                  tickLine={{ stroke: "var(--tac-border)" }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="Engagement"
                  stroke="var(--tac-dim)"
                  tick={{
                    fill: "var(--tac-mute)",
                    fontSize: 9,
                    fontFamily: "JetBrains Mono, monospace",
                  }}
                  tickFormatter={fmt}
                  axisLine={{ stroke: "var(--tac-border)" }}
                  tickLine={{ stroke: "var(--tac-border)" }}
                />
                <ZAxis
                  type="number"
                  dataKey="duration"
                  range={[36, 220]}
                  name="Duration"
                />
                <Tooltip
                  cursor={{ stroke: "#4f8dfe", strokeDasharray: "2 2" }}
                  content={<TacticalTooltip />}
                />
                <Scatter
                  data={data}
                  shape="square"
                  onClick={onClick}
                  style={{ cursor: "pointer" }}
                >
                  {data.map((d, i) => (
                    <Cell
                      key={i}
                      fill={bucketColor(d.duration)}
                      fillOpacity={0.85}
                      stroke={bucketColor(d.duration)}
                    />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
            paddingTop: 6,
            borderTop: "1px solid var(--tac-border)",
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 9,
            color: "var(--tac-dim)",
            letterSpacing: "0.06em",
            flexWrap: "wrap",
          }}
        >
          <span>// click any dot to open the reel</span>
          <div style={{ display: "flex", gap: 10 }}>
            {DURATION_BUCKETS.map((b) => (
              <span
                key={b.label}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  color: "var(--tac-mute)",
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    background: b.color,
                    display: "inline-block",
                  }}
                />
                {b.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </WidgetFrame>
  );
}

function TacticalTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const dotColor = bucketColor(p.duration);
  return (
    <div
      style={{
        background: "var(--tac-bg)",
        border: `1px solid ${dotColor}`,
        padding: "8px 10px",
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 11,
        color: "var(--tac-fg)",
        maxWidth: 280,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 12,
          color: "var(--tac-mute)",
          fontSize: 9,
          letterSpacing: "0.1em",
          marginBottom: 4,
        }}
      >
        <span>VIEWS {fmt(p.x)}</span>
        <span style={{ color: "#4f8dfe" }}>·</span>
        <span>ENG {fmt(p.y)}</span>
        <span style={{ color: "#4f8dfe" }}>·</span>
        <span>DUR {p.duration ? `${p.duration.toFixed(0)}s` : "—"}</span>
      </div>
      <div style={{ color: "var(--tac-fg)", lineHeight: 1.4 }}>
        {p.caption || <span style={{ color: "var(--tac-dim)" }}>(no caption)</span>}
      </div>
      <div
        style={{
          marginTop: 6,
          color: "#4f8dfe",
          fontSize: 9,
          letterSpacing: "0.1em",
        }}
      >
        // CLICK TO OPEN
      </div>
    </div>
  );
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmt(n) {
  if (n == null || Number.isNaN(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toLocaleString();
}

function snippet(s, n) {
  const t = (s || "").trim().replace(/\s+/g, " ");
  if (!t) return "";
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

function reelUrl(row) {
  if (row?.url) return row.url;
  if (row?.shortCode) return `https://www.instagram.com/reel/${row.shortCode}/`;
  return null;
}

export default memo(ScatterPlot);
