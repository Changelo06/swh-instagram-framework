import { memo, useMemo } from "react";
import { motion } from "framer-motion";
import WidgetFrame from "./WidgetFrame.jsx";

function LiveTimeline({ name, events = [] }) {
  const max = useMemo(
    () => events.reduce((m, e) => Math.max(m, e.value || 0), 0) || 1,
    [events]
  );

  const total = events.reduce((s, e) => s + (e.value || 0), 0);

  return (
    <WidgetFrame name={name}>
      <div
        style={{
          display: "grid",
          gridTemplateRows: "auto 1fr auto",
          gap: 14,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
          }}
        >
          <span
            style={{
              fontFamily:
                '"Inter", ui-sans-serif, system-ui, sans-serif',
              fontSize: 24,
              fontWeight: 600,
              color: "var(--tac-fg)",
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1.05,
              letterSpacing: "-0.01em",
            }}
          >
            {total.toLocaleString()}
          </span>
          <span style={{ fontSize: 12, color: "var(--tac-mute)" }}>
            posts in window
          </span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${events.length || 1}, 1fr)`,
            gap: 6,
            alignItems: "end",
            minHeight: 64,
          }}
        >
          {events.map((e, i) => {
            const h = ((e.value || 0) / max) * 100;
            const empty = (e.value || 0) === 0;
            return (
              <div
                key={e.label || i}
                style={{
                  display: "grid",
                  gridTemplateRows: "1fr auto",
                  gap: 6,
                  alignItems: "end",
                }}
              >
                <motion.div
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{
                    type: "spring",
                    stiffness: 100,
                    damping: 20,
                    delay: i * 0.04,
                  }}
                  style={{
                    height: `${Math.max(h, 4)}%`,
                    background: empty
                      ? "var(--tac-border)"
                      : "var(--tac-accent)",
                    borderRadius: "4px 4px 0 0",
                    transformOrigin: "bottom",
                    minHeight: 4,
                  }}
                />
                <div
                  style={{
                    fontFamily:
                      '"Inter", ui-sans-serif, system-ui, sans-serif',
                    fontSize: 11,
                    color: empty ? "var(--tac-dim)" : "var(--tac-mute)",
                    textAlign: "center",
                  }}
                >
                  {e.label}
                </div>
              </div>
            );
          })}
        </div>

        <div
          style={{
            fontSize: 12,
            color: "var(--tac-mute)",
            lineHeight: 1.5,
          }}
        >
          Based on posts in this dataset.
        </div>
      </div>
    </WidgetFrame>
  );
}

export default memo(LiveTimeline);
