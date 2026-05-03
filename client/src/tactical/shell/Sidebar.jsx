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
  User,
} from "@phosphor-icons/react";
import { useCsv } from "../state/CsvContext.jsx";

const NAV = [
  { to: "/app", end: true, label: "Dashboard", icon: ChartBar, key: "dashboard" },
  { to: "/app/dataset", label: "Dataset", icon: Table, key: "dataset" },
  { to: "/app/analyze", label: "Analyze", icon: Sparkle, key: "analyze" },
  { to: "/app/scripts", label: "Scripts", icon: NotePencil, key: "scripts" },
];

function Sidebar({ collapsed, onToggleCollapsed, onOpenSettings }) {
  const { rows, analyses, variations } = useCsv();
  const rowCount = rows.length;
  const analyzeRunning = analyses.some((a) => a.status === "running");
  const scriptRunning = variations.some((v) => v.status === "running");

  return (
    <aside
      className="tac-sidebar"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        bottom: 0,
        width: collapsed ? 56 : 200,
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
          gap: 12,
          padding: "0 16px",
          borderBottom: "1px solid var(--tac-border)",
        }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            background: "#4f8dfe",
            display: "grid",
            placeItems: "center",
            color: "var(--tac-bg)",
            fontFamily: '"Archivo Black", Impact, sans-serif',
            fontSize: 14,
            letterSpacing: "-0.04em",
            flexShrink: 0,
          }}
        >
          S
        </div>
        <SlideLabel collapsed={collapsed}>
          <div className="tac-display" style={{ fontSize: 12 }}>SWH</div>
          <div
            style={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 9,
              color: "var(--tac-mute)",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
            }}
          >
            UNIT D-01
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
              (item.key === "analyze" && analyzeRunning)
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
        <FooterAction
          collapsed={collapsed}
          Icon={User}
          label="Operator"
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
        gap: 14,
        padding: collapsed ? "10px 0" : "10px 16px",
        justifyContent: collapsed ? "center" : "flex-start",
        background: isActive ? "var(--tac-surface)" : "transparent",
        borderLeft: isActive ? "2px solid #4f8dfe" : "2px solid transparent",
        color: isActive ? "var(--tac-fg)" : "var(--tac-mute)",
        textDecoration: "none",
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        fontWeight: 500,
        transition: "color 120ms, background 120ms",
      })}
      onMouseDown={(e) => {
        e.currentTarget.style.transform = "scale(0.97)";
      }}
      onMouseUp={(e) => {
        e.currentTarget.style.transform = "scale(1)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "scale(1)";
      }}
    >
      <Icon size={16} weight="regular" />
      <SlideLabel collapsed={collapsed}>
        <span style={{ flex: 1 }}>{label}</span>
        {badge && (
          <span
            style={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 9,
              color: "#4f8dfe",
              border: "1px solid var(--tac-border)",
              padding: "1px 4px",
            }}
          >
            {badge}
          </span>
        )}
        {statusDot && <span className="tac-dot-status" />}
      </SlideLabel>
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
        padding: collapsed ? "10px 0" : "10px 12px",
        justifyContent: collapsed ? "center" : "flex-start",
        background: "transparent",
        border: "none",
        color: "var(--tac-mute)",
        cursor: onClick ? "pointer" : "default",
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        transition: "color 120ms",
      }}
      onMouseEnter={(e) => onClick && (e.currentTarget.style.color = "var(--tac-fg)")}
      onMouseLeave={(e) => (e.currentTarget.style.color = "var(--tac-mute)")}
    >
      <Icon size={14} weight="regular" />
      <SlideLabel collapsed={collapsed}>{label}</SlideLabel>
    </button>
  );
}

function SlideLabel({ collapsed, children }) {
  return (
    <span
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        gap: 8,
        opacity: collapsed ? 0 : 1,
        transform: collapsed ? "translateX(-8px)" : "translateX(0)",
        transition: "opacity 120ms, transform 180ms",
        whiteSpace: "nowrap",
        overflow: "hidden",
        pointerEvents: collapsed ? "none" : "auto",
      }}
    >
      {children}
    </span>
  );
}

export default memo(Sidebar);
