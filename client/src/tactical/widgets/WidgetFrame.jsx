import { memo, useState } from "react";
import { Minus, Plus } from "@phosphor-icons/react";

function WidgetFrame({ name, type, children, accent = false, onClick }) {
  const [minimized, setMinimized] = useState(false);

  return (
    <div
      onClick={onClick}
      style={{
        background: "var(--tac-surface)",
        border: accent ? "2px solid #4f8dfe" : "1px solid var(--tac-border)",
        display: "grid",
        gridTemplateRows: "auto 1fr",
        cursor: onClick ? "pointer" : "default",
        position: "relative",
        overflow: "hidden",
        transition: "border-color 120ms",
      }}
      onMouseEnter={(e) => {
        if (!accent) e.currentTarget.style.borderColor = "#4f8dfe";
      }}
      onMouseLeave={(e) => {
        if (!accent) e.currentTarget.style.borderColor = "var(--tac-border)";
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          borderBottom: "1px solid var(--tac-border)",
          background: "var(--tac-surface2)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 10,
              color: "var(--tac-fg)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              fontWeight: 500,
            }}
          >
            {name}
          </span>
          {type && (
            <span
              style={{
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: 9,
                color: "#4f8dfe",
                border: "1px solid var(--tac-border)",
                padding: "1px 5px",
                letterSpacing: "0.1em",
              }}
            >
              [ {type} ]
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setMinimized((m) => !m);
          }}
          aria-label={minimized ? "Expand" : "Minimize"}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--tac-mute)",
            cursor: "pointer",
            padding: 2,
            display: "grid",
            placeItems: "center",
            transition: "color 120ms",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#4f8dfe")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--tac-mute)")}
        >
          {minimized ? <Plus size={11} /> : <Minus size={11} />}
        </button>
      </div>
      <div
        style={{
          padding: 14,
          display: minimized ? "none" : "block",
          overflow: "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export default memo(WidgetFrame);
