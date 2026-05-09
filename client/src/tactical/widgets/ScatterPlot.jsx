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

// Brand-controlled ramp — duration is ordinal but the brand wants neon
// data accents, so each bucket gets a distinct hue from the palette while
// still walking from short (green/cyan) to long (purple/pink).
const DURATION_BUCKETS = [
  { max: 15, color: "#21d07a", label: "0–15s" },
  { max: 30, color: "#2ed3ff", label: "15–30s" },
  { max: 60, color: "#f5b82e", label: "30–60s" },
  { max: 120, color: "#7c5cff", label: "60–120s" },
  { max: Infinity, color: "#f03b9f", label: "120s+" },
];

function bucketColor(duration) {
  for (const b of DURATION_BUCKETS) {
    if (duration < b.max) return b.color;
  }
  return "var(--tac-accent)";
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
    <WidgetFrame name="Engagement vs views">
      <div style={{ display: "grid", gridTemplateRows: "1fr auto", gap: 12 }}>
        {missing || !data.length ? (
          <div
            className="tac-empty-grid"
            style={{
              display: "grid",
              placeItems: "center",
              minHeight: 240,
              border: "1px solid var(--tac-border)",
              borderRadius: 8,
              fontFamily:
                '"Inter", ui-sans-serif, system-ui, sans-serif',
              fontSize: 13,
              color: "var(--tac-danger)",
              textAlign: "center",
              lineHeight: 1.6,
            }}
          >
            Required columns missing
            <br />
            <span style={{ color: "var(--tac-mute)", fontSize: 12 }}>
              Add view and engagement columns to plot reels.
            </span>
          </div>
        ) : (
          <div style={{ minHeight: 260 }}>
            <ResponsiveContainer width="100%" height={260}>
              <ScatterChart margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid
                  strokeDasharray="0"
                  stroke="var(--tac-border)"
                  strokeOpacity={0.6}
                />
                <XAxis
                  type="number"
                  dataKey="x"
                  name="Views"
                  stroke="var(--tac-dim)"
                  tickFormatter={fmt}
                  axisLine={{ stroke: "var(--tac-border)" }}
                  tickLine={{ stroke: "var(--tac-border)" }}
                  label={{
                    value: "Views",
                    position: "insideBottom",
                    offset: -4,
                    fill: "var(--tac-mute)",
                    fontSize: 11,
                  }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="Engagement"
                  stroke="var(--tac-dim)"
                  tickFormatter={fmt}
                  axisLine={{ stroke: "var(--tac-border)" }}
                  tickLine={{ stroke: "var(--tac-border)" }}
                  label={{
                    value: "Engagement rate",
                    angle: -90,
                    position: "insideLeft",
                    offset: 12,
                    fill: "var(--tac-mute)",
                    fontSize: 11,
                  }}
                />
                <ZAxis
                  type="number"
                  dataKey="duration"
                  range={[40, 220]}
                  name="Duration"
                />
                <Tooltip
                  cursor={{
                    stroke: "var(--tac-accent)",
                    strokeDasharray: "3 3",
                  }}
                  content={<CleanTooltip />}
                />
                <Scatter
                  data={data}
                  shape="circle"
                  onClick={onClick}
                  style={{ cursor: "pointer" }}
                >
                  {data.map((d, i) => (
                    <Cell
                      key={i}
                      fill={bucketColor(d.duration)}
                      fillOpacity={0.78}
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
            fontFamily:
              '"Inter", ui-sans-serif, system-ui, sans-serif',
            fontSize: 12,
            color: "var(--tac-mute)",
            flexWrap: "wrap",
          }}
        >
          <span>Click a point to open the reel.</span>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {DURATION_BUCKETS.map((b) => (
              <span
                key={b.label}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  color: "var(--tac-mute)",
                }}
              >
                <span
                  style={{
                    width: 9,
                    height: 9,
                    background: b.color,
                    borderRadius: 9999,
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

function CleanTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const dotColor = bucketColor(p.duration);
  return (
    <div
      style={{
        background: "var(--tac-surface2)",
        border: "1px solid var(--tac-border)",
        borderRadius: 8,
        padding: "10px 12px",
        fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
        fontSize: 12,
        color: "var(--tac-fg)",
        maxWidth: 320,
        boxShadow: "0 8px 24px -12px rgba(0, 0, 0, 0.6)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          color: "var(--tac-mute)",
          fontSize: 11,
          marginBottom: 6,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            background: dotColor,
            borderRadius: 9999,
          }}
        />
        <span style={{ fontVariantNumeric: "tabular-nums" }}>
          {fmt(p.x)} views
        </span>
        <span style={{ color: "var(--tac-dim)" }}>·</span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>
          {fmt(p.y)} eng
        </span>
        <span style={{ color: "var(--tac-dim)" }}>·</span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>
          {p.duration ? `${p.duration.toFixed(0)}s` : "—"}
        </span>
      </div>
      <div style={{ color: "var(--tac-fg)", lineHeight: 1.45 }}>
        {p.caption || (
          <span style={{ color: "var(--tac-dim)" }}>(no caption)</span>
        )}
      </div>
      <div
        style={{
          marginTop: 8,
          color: "var(--tac-accent)",
          fontSize: 11,
        }}
      >
        Click to open
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
