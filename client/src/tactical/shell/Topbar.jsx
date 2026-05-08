import { memo, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { MagnifyingGlass, ArrowCounterClockwise } from "@phosphor-icons/react";
import { useCsv, STAGE } from "../state/CsvContext.jsx";
import { API_STATE } from "../../components/ApiStatus.jsx";

const SECTION_LABEL = {
  "/": "Dashboard",
  "/dataset": "Dataset",
  "/analyze": "Analyze",
  "/scripts": "Scripts",
  "/apify": "Apify",
};

const HEALTH_PILL = {
  [API_STATE.ONLINE]: { variant: "ok", label: "Online" },
  [API_STATE.DEGRADED]: { variant: "warn", label: "Groq missing" },
  [API_STATE.OFFLINE]: { variant: "err", label: "Offline" },
  [API_STATE.CHECKING]: { variant: "default", label: "Checking…" },
};

function Topbar({ healthState, onReset, search, onSearchChange }) {
  const { pathname } = useLocation();
  const section = SECTION_LABEL[pathname] || "Dashboard";
  const { stage, filename, parsed } = useCsv();
  const rowCount = parsed?.rows?.length || 0;

  const operatorId = useOperatorId();

  const showSearch = pathname === "/dataset";
  const health = HEALTH_PILL[healthState] || HEALTH_PILL[API_STATE.CHECKING];

  return (
    <header
      className="tac-topbar"
      style={{
        position: "absolute",
        inset: 0,
        background: "var(--tac-bg)",
        borderBottom: "1px solid var(--tac-border)",
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        alignItems: "stretch",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "0 20px",
          minWidth: 240,
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
          {section}
        </span>
        {filename && (
          <>
            <span
              style={{
                width: 1,
                height: 14,
                background: "var(--tac-border)",
              }}
            />
            <span
              title={filename}
              style={{
                fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
                fontSize: 12,
                color: "var(--tac-mute)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: 320,
              }}
            >
              {filename}
            </span>
          </>
        )}
        {stage === STAGE.READY && rowCount > 0 && (
          <span
            className="tac-pill"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {rowCount.toLocaleString()} rows
          </span>
        )}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          background: "var(--tac-bg)",
        }}
      >
        {showSearch ? (
          <div style={{ position: "relative", flex: 1, maxWidth: 480 }}>
            <MagnifyingGlass
              size={14}
              weight="regular"
              style={{
                position: "absolute",
                left: 10,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--tac-dim)",
                pointerEvents: "none",
              }}
            />
            <input
              className="tac-input"
              value={search || ""}
              onChange={(e) => onSearchChange?.(e.target.value)}
              placeholder="Search dataset"
              style={{
                paddingLeft: 32,
                height: 30,
                fontSize: 13,
                background: "var(--tac-surface)",
              }}
            />
          </div>
        ) : (
          <ParseStatus stage={stage} />
        )}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "0 20px",
        }}
      >
        {onReset && stage === STAGE.READY && (
          <button
            type="button"
            onClick={onReset}
            className="tac-btn"
            style={{ fontSize: 12, padding: "5px 10px" }}
          >
            <ArrowCounterClockwise size={13} weight="regular" />
            Reset
          </button>
        )}

        <span
          className={`tac-pill tac-pill--${health.variant === "default" ? "" : health.variant}`}
          title={`API status: ${health.label}`}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: 9999,
              background: "currentColor",
              opacity: 0.9,
              animation:
                health.variant === "ok"
                  ? "tac-pulse 1.6s ease-in-out infinite"
                  : "none",
            }}
          />
          {health.label}
        </span>

        <div
          style={{
            fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
            fontSize: 12,
            color: "var(--tac-mute)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {operatorId}
        </div>
      </div>
    </header>
  );
}

function ParseStatus({ stage }) {
  if (stage === STAGE.PARSING) {
    return (
      <span className="tac-pill tac-pill--accent">
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: 9999,
            background: "currentColor",
            animation: "tac-pulse 1.6s ease-in-out infinite",
          }}
        />
        Parsing
      </span>
    );
  }
  if (stage === STAGE.ERROR) {
    return <span className="tac-pill tac-pill--err">Parse error</span>;
  }
  if (stage === STAGE.READY) {
    return (
      <span className="tac-pill tac-pill--ok">
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: 9999,
            background: "currentColor",
            animation: "tac-pulse 1.6s ease-in-out infinite",
          }}
        />
        Dataset ready
      </span>
    );
  }
  return <span className="tac-pill">Awaiting input</span>;
}

function useOperatorId() {
  const [id, setId] = useState("OP-0000");
  useEffect(() => {
    const stored = localStorage.getItem("tac-operator-id");
    if (stored) {
      setId(stored);
      return;
    }
    const fresh = `OP-${Math.floor(Math.random() * 9000 + 1000)}`;
    localStorage.setItem("tac-operator-id", fresh);
    setId(fresh);
  }, []);
  return id;
}

export default memo(Topbar);
