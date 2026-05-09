import { memo, useMemo } from "react";
import { TrendUp, TrendDown, Minus } from "@phosphor-icons/react";
import WidgetFrame from "./WidgetFrame.jsx";

function SparklineCard({
  name,
  kpi,
  delta,
  series = [],
  unit = "",
  accent = false,
  icon,
  iconTone = "accent",
}) {
  const dir = delta == null || delta === 0 ? "flat" : delta > 0 ? "up" : "down";
  const deltaVariant =
    dir === "up" ? "ok" : dir === "down" ? "err" : "default";
  const DeltaIcon = dir === "up" ? TrendUp : dir === "down" ? TrendDown : Minus;
  const formatted = formatKpi(kpi);
  const isMissing = formatted === "Missing";

  const path = useSparklinePath(series);

  return (
    <WidgetFrame
      name={name}
      accent={accent}
      iconBadge={icon}
      iconTone={iconTone}
    >
      <div
        style={{
          display: "grid",
          gridTemplateRows: "auto auto",
          gap: 14,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <span
            className="tac-kpi-value"
            style={{
              color: isMissing ? "var(--tac-mute)" : "var(--tac-fg)",
            }}
          >
            {formatted}
            {unit && !isMissing && (
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
              className={
                deltaVariant === "default"
                  ? "tac-pill"
                  : `tac-pill tac-pill--${deltaVariant}`
              }
              style={{ alignSelf: "center" }}
            >
              <DeltaIcon size={11} weight="bold" />
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
          {path && !isMissing && (
            <svg
              viewBox="0 0 100 30"
              preserveAspectRatio="none"
              style={{
                width: "100%",
                height: "100%",
                display: "block",
              }}
            >
              <defs>
                <linearGradient
                  id="spark-fill"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    stopColor="var(--tac-accent)"
                    stopOpacity="0.18"
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--tac-accent)"
                    stopOpacity="0"
                  />
                </linearGradient>
              </defs>
              <path
                d={`${path} L 100 30 L 0 30 Z`}
                fill="url(#spark-fill)"
                stroke="none"
              />
              <path
                d={path}
                fill="none"
                stroke="var(--tac-accent)"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
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
  if (typeof v === "string") {
    if (v.toUpperCase() === "MISSING") return "Missing";
    return v;
  }
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toLocaleString();
}

export default memo(SparklineCard);
