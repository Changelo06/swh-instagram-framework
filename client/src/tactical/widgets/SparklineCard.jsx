import { memo, useMemo } from "react";
import { TrendUp, TrendDown, Minus } from "@phosphor-icons/react";
import WidgetFrame from "./WidgetFrame.jsx";

function SparklineCard({ name, kpi, delta, series = [], unit = "" }) {
  const dir = delta == null || delta === 0 ? "flat" : delta > 0 ? "up" : "down";
  const deltaColor =
    dir === "up" ? "#4AF626" : dir === "down" ? "#ef4444" : "var(--tac-mute)";
  const DeltaIcon = dir === "up" ? TrendUp : dir === "down" ? TrendDown : Minus;

  const path = useSparklinePath(series);

  return (
    <WidgetFrame name={name} type="NUMERIC">
      <div
        style={{
          display: "grid",
          gridTemplateRows: "auto auto",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <span
            className="tac-display"
            style={{ fontSize: 30, color: "var(--tac-fg)" }}
          >
            {formatKpi(kpi)}
            {unit && (
              <span style={{ fontSize: 14, color: "var(--tac-mute)", marginLeft: 4 }}>
                {unit}
              </span>
            )}
          </span>
          {delta != null && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                color: deltaColor,
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: 11,
                fontWeight: 500,
              }}
            >
              <DeltaIcon size={11} weight="bold" />
              {dir === "flat" ? "0" : `${delta > 0 ? "+" : ""}${delta}%`}
            </span>
          )}
        </div>

        <div
          style={{
            position: "relative",
            height: 38,
            overflow: "hidden",
            borderTop: "1px solid var(--tac-border)",
            paddingTop: 8,
          }}
        >
          {path && (
            <div
              className="tac-marquee-track"
              style={{
                height: "100%",
                gap: 0,
              }}
            >
              <svg
                viewBox="0 0 100 30"
                preserveAspectRatio="none"
                style={{ width: 200, height: "100%", display: "block" }}
              >
                <path
                  d={path}
                  fill="none"
                  stroke="#4f8dfe"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              <svg
                viewBox="0 0 100 30"
                preserveAspectRatio="none"
                style={{ width: 200, height: "100%", display: "block" }}
                aria-hidden
              >
                <path
                  d={path}
                  fill="none"
                  stroke="#4f8dfe"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              <svg
                viewBox="0 0 100 30"
                preserveAspectRatio="none"
                style={{ width: 200, height: "100%", display: "block" }}
                aria-hidden
              >
                <path
                  d={path}
                  fill="none"
                  stroke="#4f8dfe"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            </div>
          )}
        </div>
      </div>
    </WidgetFrame>
  );
}

function useSparklinePath(series) {
  return useMemo(() => {
    if (!series.length) return null;
    const max = Math.max(...series);
    const min = Math.min(...series);
    const range = max - min || 1;
    const step = 100 / Math.max(series.length - 1, 1);
    return series
      .map((v, i) => {
        const x = (i * step).toFixed(2);
        const y = (28 - ((v - min) / range) * 26).toFixed(2);
        return `${i === 0 ? "M" : "L"} ${x} ${y}`;
      })
      .join(" ");
  }, [series]);
}

function formatKpi(v) {
  if (v == null) return "—";
  if (typeof v === "string") return v;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toLocaleString();
}

export default memo(SparklineCard);
