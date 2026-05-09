import { memo, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import WidgetFrame from "./WidgetFrame.jsx";

function IntelligentList({ name, items = [], showRank = true }) {
  const [order, setOrder] = useState(items);

  useEffect(() => {
    setOrder(items);
  }, [items]);

  useEffect(() => {
    if (items.length < 2) return;
    const interval = setInterval(() => {
      setOrder((prev) => {
        if (prev.length < 2) return prev;
        const i = Math.floor(Math.random() * (prev.length - 1));
        const next = [...prev];
        [next[i], next[i + 1]] = [next[i + 1], next[i]];
        return next;
      });
    }, 3500);
    return () => clearInterval(interval);
  }, [items.length]);

  return (
    <WidgetFrame name={name} type="CATEGORICAL">
      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "grid",
          gap: 1,
          background: "var(--tac-border)",
        }}
      >
        <AnimatePresence initial={false}>
          {order.slice(0, 6).map((item, idx) => (
            <motion.li
              key={item.key || item.label}
              layout
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
              style={{
                background: "var(--tac-surface)",
                display: "grid",
                gridTemplateColumns: showRank ? "auto 1fr auto" : "1fr auto",
                alignItems: "center",
                gap: 12,
                padding: "8px 10px",
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: 11,
              }}
            >
              {showRank && (
                <span
                  style={{
                    color: "var(--tac-mute)",
                    width: 18,
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {String(idx + 1).padStart(2, "0")}
                </span>
              )}
              <span
                style={{
                  color: "var(--tac-fg)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                title={item.label}
              >
                {item.label}
              </span>
              <span style={{ color: "var(--tac-accent)", fontVariantNumeric: "tabular-nums" }}>
                {item.value}
              </span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </WidgetFrame>
  );
}

export default memo(IntelligentList);
