import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  ArrowsClockwise,
  CheckCircle,
  XCircle,
  Warning,
  CircleNotch,
  Moon,
  Sun,
} from "@phosphor-icons/react";
import { API_STATE } from "../../components/ApiStatus.jsx";

const STATUS_CONF = {
  [API_STATE.CHECKING]: {
    icon: CircleNotch,
    color: "var(--tac-mute)",
    label: "PROBING",
    spin: true,
  },
  [API_STATE.ONLINE]: { icon: CheckCircle, color: "#4AF626", label: "ONLINE" },
  [API_STATE.DEGRADED]: { icon: Warning, color: "#fbbf24", label: "DEGRADED" },
  [API_STATE.OFFLINE]: { icon: XCircle, color: "#ef4444", label: "OFFLINE" },
};

export default function SettingsDrawer({ open, onClose, health, theme, onThemeChange }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(10, 10, 10, 0.7)",
              zIndex: 40,
            }}
            aria-hidden
          />
          <motion.aside
            key="drawer"
            role="dialog"
            aria-label="Settings"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{
              type: "spring",
              stiffness: 280,
              damping: 32,
            }}
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              bottom: 0,
              width: "min(420px, 100vw)",
              background: "var(--tac-surface2)",
              borderLeft: "1px solid var(--tac-border)",
              zIndex: 41,
              display: "grid",
              gridTemplateRows: "auto 1fr auto",
              fontFamily: '"JetBrains Mono", monospace',
            }}
          >
            <header
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 20px",
                borderBottom: "1px solid var(--tac-border)",
              }}
            >
              <div>
                <div className="tac-label">UNIT D-01 / SETTINGS</div>
                <div
                  className="tac-display"
                  style={{ fontSize: 18, color: "var(--tac-fg)", marginTop: 4 }}
                >
                  CONTROL PANEL
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close settings"
                style={{
                  background: "transparent",
                  border: "1px solid var(--tac-border)",
                  color: "var(--tac-mute)",
                  padding: 6,
                  cursor: "pointer",
                  display: "grid",
                  placeItems: "center",
                  transition: "border-color 120ms, color 120ms",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "#4f8dfe";
                  e.currentTarget.style.color = "var(--tac-fg)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--tac-border)";
                  e.currentTarget.style.color = "var(--tac-mute)";
                }}
              >
                <X size={14} weight="regular" />
              </button>
            </header>

            <div
              style={{
                padding: "20px",
                overflowY: "auto",
                display: "grid",
                gap: 24,
                alignContent: "start",
              }}
            >
              <DisplaySection theme={theme} onThemeChange={onThemeChange} />
              <ApiSection health={health} />
            </div>

            <footer
              style={{
                padding: "10px 20px",
                borderTop: "1px solid var(--tac-border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: 9,
                color: "var(--tac-dim)",
                letterSpacing: "0.18em",
              }}
            >
              <span>SWH // INTERNAL</span>
              <span>v1.2 / TACTICAL</span>
            </footer>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function DisplaySection({ theme, onThemeChange }) {
  const isDark = theme !== "light";
  const options = [
    {
      id: "dark",
      label: "DARK",
      sub: "tactical default",
      icon: Moon,
    },
    {
      id: "light",
      label: "GRAY",
      sub: "low cortisol",
      icon: Sun,
    },
  ];

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <header>
        <div className="tac-label">SECTION D / DISPLAY</div>
        <div
          style={{
            fontSize: 12,
            color: "var(--tac-fg)",
            marginTop: 4,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            fontWeight: 500,
          }}
        >
          THEME
        </div>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 1,
          background: "var(--tac-border)",
          border: "1px solid var(--tac-border)",
        }}
      >
        {options.map((opt) => {
          const active = (opt.id === "light") === !isDark;
          const Icon = opt.icon;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onThemeChange?.(opt.id)}
              style={{
                background: active ? "var(--tac-bg)" : "var(--tac-surface)",
                border: "none",
                borderTop: active
                  ? "2px solid #4f8dfe"
                  : "2px solid transparent",
                color: active ? "var(--tac-fg)" : "var(--tac-mute)",
                padding: "12px 14px",
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: 11,
                letterSpacing: "0.06em",
                cursor: "pointer",
                display: "grid",
                gridTemplateColumns: "16px 1fr auto",
                alignItems: "center",
                gap: 10,
                textAlign: "left",
                transition: "color 120ms",
              }}
            >
              <Icon
                size={13}
                weight="regular"
                color={active ? "#4f8dfe" : "var(--tac-mute)"}
              />
              <div>
                <div style={{ fontWeight: 600 }}>{opt.label}</div>
                <div
                  style={{
                    fontSize: 9,
                    color: "var(--tac-mute)",
                    marginTop: 2,
                    letterSpacing: "0.08em",
                  }}
                >
                  {opt.sub}
                </div>
              </div>
              {active && (
                <span
                  style={{
                    fontSize: 9,
                    color: "#4f8dfe",
                    letterSpacing: "0.1em",
                    fontWeight: 700,
                  }}
                >
                  ACTIVE
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div
        style={{
          padding: "10px 12px",
          background: "var(--tac-bg)",
          border: "1px solid var(--tac-border)",
          fontSize: 10,
          color: "var(--tac-mute)",
          lineHeight: 1.6,
          letterSpacing: "0.02em",
        }}
      >
        Gray mode swaps the substrate to a lighter neutral tone for long
        sessions. Brand accents (signal blue, status green, error red) stay
        constant across themes.
      </div>
    </section>
  );
}

function ApiSection({ health }) {
  const { state, details, error, recheck } = health;
  const conf = STATUS_CONF[state] || STATUS_CONF[API_STATE.OFFLINE];
  const StatusIcon = conf.icon;
  const anthropicConfigured =
    details?.services?.anthropic?.configured ?? details?.anthropicConfigured;
  const groqConfigured =
    details?.services?.groq?.configured ?? details?.groqConfigured;

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div className="tac-label">SECTION A / TELEMETRY</div>
          <div
            style={{
              fontSize: 12,
              color: "var(--tac-fg)",
              marginTop: 4,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              fontWeight: 500,
            }}
          >
            API STATUS
          </div>
        </div>
        <button
          type="button"
          onClick={recheck}
          disabled={state === API_STATE.CHECKING}
          className="tac-btn"
          style={{
            padding: "6px 10px",
            fontSize: 9,
            opacity: state === API_STATE.CHECKING ? 0.4 : 1,
          }}
        >
          <ArrowsClockwise
            size={11}
            weight="regular"
            className={state === API_STATE.CHECKING ? "spin-slow" : ""}
            style={{
              animation:
                state === API_STATE.CHECKING
                  ? "spin 1s linear infinite"
                  : "none",
            }}
          />
          RECHECK
        </button>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr auto",
          alignItems: "center",
          gap: 12,
          padding: "12px 14px",
          background: "var(--tac-surface)",
          border: "1px solid var(--tac-border)",
        }}
      >
        <StatusIcon
          size={18}
          weight="regular"
          color={conf.color}
          style={{
            animation: conf.spin ? "spin 1s linear infinite" : "none",
          }}
        />
        <div>
          <div
            style={{
              fontSize: 11,
              color: "var(--tac-mute)",
              letterSpacing: "0.1em",
            }}
          >
            PIPELINE STATUS
          </div>
          <div
            style={{
              fontSize: 14,
              color: conf.color,
              fontWeight: 600,
              letterSpacing: "0.06em",
              marginTop: 2,
            }}
          >
            {conf.label}
          </div>
        </div>
        <span
          style={{
            width: 8,
            height: 8,
            background: conf.color,
            animation:
              conf.color === "#4AF626"
                ? "tac-pulse 1.6s ease-in-out infinite"
                : "none",
          }}
        />
      </div>

      <div style={{ display: "grid", gap: 1, background: "var(--tac-border)" }}>
        <ServiceRow
          name="ANTHROPIC"
          subtitle="Required · framework analysis"
          ok={!!anthropicConfigured}
          model={details?.model}
          required
        />
        <ServiceRow
          name="GROQ WHISPER"
          subtitle="Optional · top-reel transcription"
          ok={!!groqConfigured}
          model={details?.groqModel}
        />
      </div>

      {error && (
        <div className="tac-error-banner" style={{ fontSize: 11 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <Warning size={13} color="#ef4444" style={{ marginTop: 2, flexShrink: 0 }} />
            <span style={{ wordBreak: "break-all" }}>{error}</span>
          </div>
        </div>
      )}

      <div
        style={{
          padding: "10px 12px",
          background: "var(--tac-bg)",
          border: "1px solid var(--tac-border)",
          fontSize: 10,
          color: "var(--tac-mute)",
          lineHeight: 1.6,
          letterSpacing: "0.02em",
        }}
      >
        Anthropic powers every framework run. Groq is only consulted to transcribe the top-engaged reels before deep analysis. Pipeline runs without Groq — transcripts are skipped.
      </div>
    </section>
  );
}

function ServiceRow({ name, subtitle, ok, model, required }) {
  const tone = ok ? "#4AF626" : required ? "#ef4444" : "#fbbf24";
  const status = ok ? "OK" : required ? "MISSING" : "OPTIONAL";

  return (
    <div
      style={{
        background: "var(--tac-surface)",
        padding: "10px 14px",
        display: "grid",
        gridTemplateColumns: "1fr auto",
        alignItems: "center",
        gap: 10,
      }}
    >
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              background: tone,
              animation: ok ? "tac-pulse 1.6s ease-in-out infinite" : "none",
            }}
          />
          <span
            style={{
              fontSize: 11,
              color: "var(--tac-fg)",
              letterSpacing: "0.06em",
              fontWeight: 500,
            }}
          >
            {name}
          </span>
        </div>
        <div
          style={{
            fontSize: 9,
            color: "var(--tac-mute)",
            marginTop: 4,
            letterSpacing: "0.04em",
          }}
        >
          {subtitle}
        </div>
        {model && (
          <div
            style={{
              fontSize: 9,
              color: "var(--tac-dim)",
              marginTop: 2,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {model}
          </div>
        )}
      </div>
      <span
        style={{
          fontSize: 9,
          color: tone,
          letterSpacing: "0.12em",
          fontWeight: 600,
        }}
      >
        {status}
      </span>
    </div>
  );
}
