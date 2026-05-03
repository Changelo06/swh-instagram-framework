import { memo } from "react";
import WidgetFrame from "./WidgetFrame.jsx";

function StatusMatrix({ name, cells = [], cols = 12 }) {
  const trueCount = cells.filter((c) => c.state === true).length;
  const falseCount = cells.filter((c) => c.state === false).length;

  return (
    <WidgetFrame name={name} type="BOOLEAN">
      <div style={{ display: "grid", gridTemplateRows: "auto 1fr auto", gap: 10 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
          }}
        >
          <span
            style={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 11,
              color: "#4AF626",
            }}
          >
            PASS {trueCount}
          </span>
          <span
            style={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 11,
              color: "#4f8dfe",
            }}
          >
            FAIL {falseCount}
          </span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gap: 2,
          }}
        >
          {cells.map((c, i) => (
            <div
              key={i}
              title={c.title}
              style={{
                aspectRatio: "1 / 1",
                background:
                  c.state === true
                    ? "#4AF626"
                    : c.state === false
                    ? "#4f8dfe"
                    : "var(--tac-border)",
                opacity: c.state == null ? 0.3 : 1,
                animation:
                  c.state === true
                    ? `tac-pulse ${2 + (i % 5) * 0.2}s ease-in-out infinite`
                    : "none",
              }}
            />
          ))}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            paddingTop: 6,
            borderTop: "1px solid var(--tac-border)",
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 9,
            color: "var(--tac-mute)",
            letterSpacing: "0.1em",
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span
              style={{ width: 8, height: 8, background: "#4AF626", display: "inline-block" }}
            />
            TRUE
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span
              style={{ width: 8, height: 8, background: "#4f8dfe", display: "inline-block" }}
            />
            FALSE
          </span>
        </div>
      </div>
    </WidgetFrame>
  );
}

export default memo(StatusMatrix);
