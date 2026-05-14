import { memo } from "react";
import { NavLink } from "react-router-dom";
import {
  ChartBar,
  Table,
  Sparkle,
  NotePencil,
  CaretLeft,
  CaretRight,
  Gear,
  ListBullets,
} from "@phosphor-icons/react";
import { useCsv } from "../state/CsvContext.jsx";

const NAV = [
  { to: "/", end: true, label: "Dashboard", icon: ChartBar, key: "dashboard" },
  { to: "/dataset", label: "Dataset", icon: Table, key: "dataset" },
  { to: "/analyze", label: "Analyze", icon: Sparkle, key: "analyze" },
  { to: "/scripts", label: "Scripts", icon: NotePencil, key: "scripts" },
  { to: "/runs", label: "Runs", icon: ListBullets, key: "runs" },
];

function Sidebar({ collapsed, onToggleCollapsed, onOpenSettings }) {
  const { rows, analyses, variations, apifyRun } = useCsv();
  const rowCount = rows.length;
  const analyzeRunning = analyses.some((a) => a.status === "running");
  const scriptRunning = variations.some((v) => v.status === "running");
  const apifyRunning = apifyRun?.status === "running";

  return (
    <aside
      className="tac-sidebar"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        bottom: 0,
        width: collapsed ? 56 : 216,
        background: "var(--tac-surface2)",
        borderRight: "1px solid var(--tac-border)",
        zIndex: 20,
        transition: "width 180ms cubic-bezier(0.2, 0.8, 0.2, 1)",
        display: "grid",
        gridTemplateRows: "44px 1fr auto",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: collapsed ? "center" : "flex-start",
          gap: 12,
          padding: collapsed ? "0" : "0 16px",
          borderBottom: "1px solid var(--tac-border)",
        }}
      >
        <img
          src="/chiqo.png"
          alt="Chiqo.ai"
          width={28}
          height={28}
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            objectFit: "cover",
            display: "block",
            flexShrink: 0,
          }}
        />
        <SlideLabel collapsed={collapsed}>
          <div
            style={{
              fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
              fontWeight: 600,
              fontSize: 15,
              color: "var(--tac-fg)",
              lineHeight: 1.2,
              letterSpacing: "-0.01em",
            }}
          >
            Chiqo.ai
          </div>
        </SlideLabel>
      </div>

      <nav style={{ padding: "8px 0", display: "flex", flexDirection: "column", gap: 1 }}>
        {NAV.map((item) => (
          <NavItem
            key={item.key}
            to={item.to}
            end={item.end}
            label={item.label}
            Icon={item.icon}
            collapsed={collapsed}
            badge={
              item.key === "dataset" && rowCount
                ? rowCount.toLocaleString()
                : null
            }
            statusDot={
              (item.key === "scripts" && scriptRunning) ||
              (item.key === "analyze" && analyzeRunning) ||
              (item.key === "dashboard" && apifyRunning)
            }
          />
        ))}
      </nav>

      <div
        style={{
          borderTop: "1px solid var(--tac-border)",
          padding: 8,
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        <FooterAction
          collapsed={collapsed}
          onClick={onOpenSettings}
          Icon={Gear}
          label="Settings"
        />
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: collapsed ? "center" : "flex-end",
            gap: 8,
            padding: "10px 12px",
            background: "transparent",
            border: "none",
            borderTop: "1px solid var(--tac-border)",
            color: "var(--tac-mute)",
            cursor: "pointer",
            transition: "color 120ms",
            marginTop: 4,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--tac-fg)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--tac-mute)")}
        >
          {collapsed ? (
            <CaretRight size={14} weight="regular" />
          ) : (
            <CaretLeft size={14} weight="regular" />
          )}
        </button>
      </div>
    </aside>
  );
}

const NavItem = memo(function NavItem({
  to,
  end,
  label,
  Icon,
  collapsed,
  badge,
  statusDot,
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className="tac-nav-item"
      style={({ isActive }) => ({
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: collapsed ? "9px 0" : "9px 14px",
        marginLeft: collapsed ? 0 : 8,
        marginRight: collapsed ? 0 : 8,
        borderRadius: 8,
        justifyContent: collapsed ? "center" : "flex-start",
        background: isActive ? "var(--tac-surface2)" : "transparent",
        color: isActive ? "var(--tac-fg)" : "var(--tac-mute)",
        textDecoration: "none",
        fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
        fontSize: 13,
        fontWeight: isActive ? 500 : 400,
        letterSpacing: 0,
        textTransform: "none",
        transition: "color 120ms, background 120ms",
      })}
    >
      {({ isActive }) => (
        <>
          <Icon
            size={16}
            weight="regular"
            color={isActive ? "var(--tac-accent)" : "currentColor"}
            style={{ flexShrink: 0 }}
          />
          <SlideLabel collapsed={collapsed}>
            <span style={{ flex: 1 }}>{label}</span>
            {badge && (
              <span
                style={{
                  fontFamily:
                    '"Inter", ui-sans-serif, system-ui, sans-serif',
                  fontVariantNumeric: "tabular-nums",
                  fontSize: 11,
                  fontWeight: 500,
                  color: "var(--tac-mute)",
                  background: "var(--tac-surface-inner)",
                  borderRadius: 9999,
                  padding: "1px 7px",
                }}
              >
                {badge}
              </span>
            )}
            {statusDot && <span className="tac-dot-status" />}
          </SlideLabel>
        </>
      )}
    </NavLink>
  );
});

function FooterAction({ collapsed, onClick, Icon, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: collapsed ? "9px 0" : "9px 12px",
        borderRadius: 6,
        justifyContent: collapsed ? "center" : "flex-start",
        background: "transparent",
        border: "none",
        color: "var(--tac-mute)",
        cursor: onClick ? "pointer" : "default",
        fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
        fontSize: 13,
        fontWeight: 400,
        letterSpacing: 0,
        textTransform: "none",
        transition: "color 120ms, background 120ms",
      }}
      onMouseEnter={(e) => {
        if (onClick) {
          e.currentTarget.style.color = "var(--tac-fg)";
          e.currentTarget.style.background = "var(--tac-surface)";
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = "var(--tac-mute)";
        e.currentTarget.style.background = "transparent";
      }}
    >
      <Icon size={15} weight="regular" />
      <SlideLabel collapsed={collapsed}>{label}</SlideLabel>
    </button>
  );
}

function SlideLabel({ collapsed, children }) {
  // When collapsed, the label is removed from layout entirely so the icon
  // sits centered in its parent flex container instead of being pulled
  // off-center by an invisible-but-present span.
  if (collapsed) return null;
  return (
    <span
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        gap: 8,
        whiteSpace: "nowrap",
        overflow: "hidden",
        transition: "opacity 120ms, transform 180ms",
      }}
    >
      {children}
    </span>
  );
}

export default memo(Sidebar);
