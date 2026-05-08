import { memo, useMemo } from "react";
import { TrendUp, TrendDown, Minus } from "@phosphor-icons/react";
import WidgetFrame from "./WidgetFrame.jsx";

function SparklineCard({ name, kpi, delta, series = [], unit = "" }) {
  const dir = delta == null || delta === 0 ? "flat" : delta > 0 ? "up" : "down";
  const deltaColor =
    dir === "up"
      ? "var(--tac-success)"
      : dir === "down"
      ? "var(--tac-danger)"
      : "var(--tac-mute)";
  const DeltaIcon = dir === "up" ? TrendUp : dir === "down" ? TrendDown : Minus;

  const path = useSparklinePath(series);

  return (
    <WidgetFrame name={name}>
      <div
        style={{
          display: "grid",
          gridTemplateRows: "auto auto",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <span
            style={{
              fontFamily:
                '"Inter", ui-sans-serif, system-ui, sans-serif',
              fontSize: 30,
              fontWeight: 600,
              color: "var(--tac-fg)",
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "-0.01em",
              lineHeight: 1.05,
            }}
          >
            {formatKpi(kpi)}
            {unit && (
              <span
                style={{
                  fontSize: 16,
                  color: "var(--tac-mute)",
                  marginLeft: 4,
                  fontWeight: 500,
                }}
              >
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
                fontFamily:
                  '"Inter", ui-sans-serif, system-ui, sans-serif',
                fontSize: 12,
                fontWeight: 500,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              <DeltaIcon size={12} weight="bold" />
              {dir === "flat" ? "0%" : `${delta > 0 ? "+" : ""}${delta}%`}
            </span>
          )}
        </div>

        <div
          style={{
            position: "relative",
            height: 36,
            overflow: "hidden",
          }}
        >
          {path && (
            <div
              className="tac-marquee-track"
              style={{ height: "100%", gap: 0 }}
            >
              {[0, 1, 2].map((i) => (
                <svg
                  key={i}
                  viewBox="0 0 100 30"
                  preserveAspectRatio="none"
                  style={{ width: 200, height: "100%", display: "block" }}
                  aria-hidden={i > 0}
                >
                  <path
                    d={path}
                    fill="none"
                    stroke="var(--tac-accent)"
                    strokeWidth={1.25}
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              ))}
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
