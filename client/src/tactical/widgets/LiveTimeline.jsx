import { memo, useMemo } from "react";
import { motion } from "framer-motion";
import WidgetFrame from "./WidgetFrame.jsx";
import { neonAt } from "../lib/tokens.js";

function LiveTimeline({ name, events = [] }) {
  const max = useMemo(
    () => events.reduce((m, e) => Math.max(m, e.value || 0), 0) || 1,
    [events]
  );

  const total = events.reduce((s, e) => s + (e.value || 0), 0);

  return (
    <WidgetFrame name={name} type="DATE">
      <div style={{ display: "grid", gridTemplateRows: "auto 1fr auto", gap: 10 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
          }}
        >
          <span className="tac-display" style={{ fontSize: 22, color: "var(--tac-fg)" }}>
            {total.toLocaleString()}
          </span>
          <span
            style={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 9,
              color: "var(--tac-mute)",
              letterSpacing: "0.1em",
            }}
          >
            EVENTS / WINDOW
          </span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${events.length || 1}, 1fr)`,
            gap: 4,
            alignItems: "end",
            minHeight: 56,
          }}
        >
          {events.map((e, i) => {
            const h = ((e.value || 0) / max) * 100;
            const empty = (e.value || 0) === 0;
            const color = empty ? "var(--tac-border)" : neonAt(i);
            return (
              <div
                key={e.label || i}
                style={{
                  display: "grid",
                  gridTemplateRows: "1fr auto",
                  gap: 4,
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
                    background: color,
                    transformOrigin: "bottom",
                  }}
                />
                <div
                  style={{
                    fontFamily: '"JetBrains Mono", monospace',
                    fontSize: 9,
                    color: empty ? "var(--tac-dim)" : color,
                    textAlign: "center",
                    letterSpacing: "0.04em",
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
            display: "flex",
            alignItems: "center",
            gap: 8,
            paddingTop: 6,
            borderTop: "1px solid var(--tac-border)",
          }}
        >
          <span className="tac-dot-status" />
          <span
            style={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 10,
              color: "var(--tac-mute)",
            }}
          >
            STREAM ACTIVE
          </span>
        </div>
      </div>
    </WidgetFrame>
  );
}

export default memo(LiveTimeline);
