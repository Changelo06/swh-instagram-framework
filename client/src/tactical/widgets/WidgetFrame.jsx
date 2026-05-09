import { memo } from "react";

function WidgetFrame({
  name,
  children,
  accent = false,
  onClick,
  action,
  iconBadge,
  iconTone = "default",
}) {
  const interactive = typeof onClick === "function";
  return (
    <div
      onClick={onClick}
      className={accent ? "tac-card tac-panel-active" : "tac-card"}
      style={{
        display: "grid",
        gridTemplateRows: name ? "auto 1fr" : "1fr",
        cursor: interactive ? "pointer" : "default",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {name && (
        <div
          className="tac-card-header"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              minWidth: 0,
            }}
          >
            {iconBadge && <IconBadge icon={iconBadge} tone={iconTone} />}
            <span
              className="tac-section-title"
              style={{
                fontSize: 14,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {name}
            </span>
          </div>
          {action && <div onClick={(e) => e.stopPropagation()}>{action}</div>}
        </div>
      )}
      <div
        className={name ? "tac-card-body" : "tac-card-body--first"}
        style={{ overflow: "hidden" }}
      >
        {children}
      </div>
    </div>
  );
}

const TONE_TO_VAR = {
  default: "var(--tac-mute)",
  accent: "var(--tac-accent)",
  cyan: "var(--tac-cyan)",
  pink: "var(--tac-pink)",
  purple: "var(--tac-purple)",
  warning: "var(--tac-warning)",
  danger: "var(--tac-danger)",
};

const TONE_TO_BG = {
  default: "var(--tac-surface2)",
  accent: "rgba(33, 208, 122, 0.13)",
  cyan: "rgba(46, 211, 255, 0.13)",
  pink: "rgba(240, 59, 159, 0.13)",
  purple: "rgba(124, 92, 255, 0.13)",
  warning: "rgba(245, 184, 46, 0.13)",
  danger: "rgba(240, 68, 94, 0.13)",
};

function IconBadge({ icon: Icon, tone }) {
  const color = TONE_TO_VAR[tone] || TONE_TO_VAR.default;
  const bg = TONE_TO_BG[tone] || TONE_TO_BG.default;
  return (
    <span
      style={{
        display: "grid",
        placeItems: "center",
        width: 26,
        height: 26,
        background: bg,
        borderRadius: 7,
        color,
        flexShrink: 0,
      }}
      aria-hidden
    >
      <Icon size={13} weight="regular" />
    </span>
  );
}

export default memo(WidgetFrame);
