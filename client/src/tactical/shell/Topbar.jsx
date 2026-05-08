import { memo, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { MagnifyingGlass, ArrowCounterClockwise, Bell } from "@phosphor-icons/react";
import { useCsv, STAGE } from "../state/CsvContext.jsx";
import { API_STATE } from "../../components/ApiStatus.jsx";

const SECTION_LABEL = {
  "/": "DASHBOARD",
  "/dataset": "DATASET",
  "/analyze": "ANALYZE",
  "/scripts": "SCRIPTS",
  "/apify": "APIFY",
};

function Topbar({ healthState, onReset, search, onSearchChange }) {
  const { pathname } = useLocation();
  const section = SECTION_LABEL[pathname] || "DASHBOARD";
  const { stage, filename, parsed } = useCsv();
  const rowCount = parsed?.rows?.length || 0;

  const operatorId = useOperatorId();

  const showSearch = pathname === "/dataset";

  const dot =
    healthState === API_STATE.ONLINE
      ? "#4AF626"
      : healthState === API_STATE.DEGRADED
      ? "#fbbf24"
      : healthState === API_STATE.OFFLINE
      ? "#ef4444"
      : "var(--tac-mute)";

  return (
    <header
      style={{
        position: "absolute",
        inset: 0,
        background: "var(--tac-bg)",
        borderBottom: "1px solid var(--tac-border)",
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        alignItems: "stretch",
        gap: 1,
      }}
      className="tac-topbar"
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "0 16px",
          borderRight: "1px solid var(--tac-border)",
          background: "var(--tac-surface2)",
          minWidth: 240,
        }}
      >
        <span className="tac-label" style={{ color: "#4f8dfe" }}>
          [ {section} ]
        </span>
        <span
          style={{
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 11,
            color: "var(--tac-mute)",
          }}
        >
          /
        </span>
        <span
          style={{
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 11,
            color: "var(--tac-fg)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: 280,
          }}
          title={filename || "no dataset"}
        >
          {filename || "no_dataset.csv"}
        </span>
        {stage === STAGE.READY && rowCount > 0 && (
          <span
            style={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 10,
              color: "var(--tac-mute)",
              border: "1px solid var(--tac-border)",
              padding: "2px 6px",
            }}
          >
            {rowCount.toLocaleString()} ROWS
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
              size={12}
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
              placeholder="grep dataset..."
              style={{
                paddingLeft: 28,
                height: 28,
                fontSize: 11,
                background: "var(--tac-surface2)",
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
          gap: 14,
          padding: "0 16px",
          borderLeft: "1px solid var(--tac-border)",
          background: "var(--tac-surface2)",
        }}
      >
        {onReset && stage === STAGE.READY && (
          <button
            type="button"
            onClick={onReset}
            style={{
              background: "transparent",
              border: "1px solid var(--tac-border)",
              color: "var(--tac-fg)",
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              padding: "4px 10px",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              transition: "border-color 120ms",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#4f8dfe")}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--tac-border)")}
          >
            <ArrowCounterClockwise size={11} weight="regular" />
            RESET
          </button>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            color: "var(--tac-mute)",
          }}
          title={`API: ${healthState}`}
        >
          <Bell size={13} weight="regular" />
          <span
            style={{
              width: 6,
              height: 6,
              background: dot,
              animation: dot === "#4AF626" ? "tac-pulse 1.6s ease-in-out infinite" : "none",
            }}
          />
        </div>

        <div
          style={{
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 10,
            color: "var(--tac-mute)",
            letterSpacing: "0.08em",
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
      <span
        style={{
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 11,
          color: "#4f8dfe",
          letterSpacing: "0.06em",
        }}
        className="tac-cursor"
      >
        PARSING
      </span>
    );
  }
  if (stage === STAGE.ERROR) {
    return (
      <span
        style={{
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 11,
          color: "#ef4444",
        }}
      >
        // ERROR
      </span>
    );
  }
  if (stage === STAGE.READY) {
    return (
      <span
        style={{
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 11,
          color: "#4AF626",
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span className="tac-dot-status" />
        DATASET LIVE
      </span>
    );
  }
  return (
    <span
      style={{
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 11,
        color: "var(--tac-mute)",
      }}
    >
      AWAITING INPUT
    </span>
  );
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
