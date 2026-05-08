import { memo } from "react";

function WidgetFrame({ name, children, accent = false, onClick, action }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: "var(--tac-surface)",
        border: `1px solid ${accent ? "var(--tac-accent)" : "var(--tac-border)"}`,
        borderRadius: 10,
        display: "grid",
        gridTemplateRows: name ? "auto 1fr" : "1fr",
        cursor: onClick ? "pointer" : "default",
        position: "relative",
        overflow: "hidden",
        transition: "border-color 120ms, background 120ms",
      }}
    >
      {name && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 20px 12px",
            gap: 12,
          }}
        >
          <span
            style={{
              fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
              fontSize: 14,
              fontWeight: 600,
              color: "var(--tac-fg)",
            }}
          >
            {name}
          </span>
          {action && (
            <div onClick={(e) => e.stopPropagation()}>{action}</div>
          )}
        </div>
      )}
      <div
        style={{
          padding: name ? "0 20px 20px" : 20,
          overflow: "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export default memo(WidgetFrame);
