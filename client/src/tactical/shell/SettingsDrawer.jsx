import { useEffect, useState } from "react";
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
  Microphone,
  Eye,
  EyeSlash,
  FloppyDisk,
  Trash,
} from "@phosphor-icons/react";
import { API_STATE } from "../../components/ApiStatus.jsx";

// Same key the dashboard / context read on every transcribe + scrape call.
const GROQ_TOKEN_KEY = "swh-groq-token";

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
              fontFamily:
                '"Inter", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
            }}
          >
            <header
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "20px 24px",
                borderBottom: "1px solid var(--tac-border)",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 600,
                    color: "var(--tac-fg)",
                    lineHeight: 1.2,
                  }}
                >
                  Settings
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--tac-mute)",
                    marginTop: 2,
                  }}
                >
                  Display, API tokens, and telemetry
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close settings"
                className="tac-btn"
                style={{ padding: 6 }}
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
              <GroqSection />
              <ApiSection health={health} />
            </div>

            <footer
              style={{
                padding: "12px 24px",
                borderTop: "1px solid var(--tac-border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: 11,
                color: "var(--tac-dim)",
              }}
            >
              <span>SWH Framework</span>
              <span>v1.2</span>
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
    { id: "dark", label: "Dark", sub: "Default", icon: Moon },
    { id: "light", label: "Light", sub: "Low contrast", icon: Sun },
  ];

  return (
    <section style={{ display: "grid", gap: 10 }}>
      <header>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--tac-fg)",
          }}
        >
          Display
        </div>
        <div style={{ fontSize: 12, color: "var(--tac-mute)", marginTop: 2 }}>
          Theme
        </div>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
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
                background: active ? "var(--tac-surface2)" : "var(--tac-surface)",
                border: `1px solid ${active ? "var(--tac-accent)" : "var(--tac-border)"}`,
                borderRadius: 8,
                color: active ? "var(--tac-fg)" : "var(--tac-mute)",
                padding: "10px 12px",
                fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
                fontSize: 13,
                cursor: "pointer",
                display: "grid",
                gridTemplateColumns: "16px 1fr auto",
                alignItems: "center",
                gap: 10,
                textAlign: "left",
                transition: "border-color 120ms, background 120ms, color 120ms",
              }}
            >
              <Icon
                size={14}
                weight="regular"
                color={active ? "var(--tac-accent)" : "var(--tac-mute)"}
              />
              <div>
                <div style={{ fontWeight: 500 }}>{opt.label}</div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--tac-mute)",
                    marginTop: 1,
                    fontWeight: 400,
                  }}
                >
                  {opt.sub}
                </div>
              </div>
              {active && (
                <span className="tac-pill tac-pill--accent">Active</span>
              )}
            </button>
          );
        })}
      </div>

      <div
        style={{
          padding: "10px 12px",
          background: "var(--tac-surface2)",
          border: "1px solid var(--tac-border)",
          borderRadius: 8,
          fontSize: 12,
          color: "var(--tac-mute)",
          lineHeight: 1.5,
        }}
      >
        Light mode swaps to a brighter substrate for long sessions. Brand accent
        and status colors stay constant across themes.
      </div>
    </section>
  );
}


// Groq Whisper transcription token. Stored in this browser only and read
// at request time by the Dashboard (for /api/scrape) and the Analyze /
// Scripts views (for /api/transcribe). The drawer mirrors ApifyView's save
// flow — explicit SAVE button, dirty/clean status chip, no auto-persist.
function GroqSection() {
  const [token, setToken] = useState("");
  const [savedToken, setSavedToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(GROQ_TOKEN_KEY) || "";
    setToken(stored);
    setSavedToken(stored);
  }, []);

  const persist = (next) => {
    if (typeof window === "undefined") return;
    if (next) window.localStorage.setItem(GROQ_TOKEN_KEY, next);
    else window.localStorage.removeItem(GROQ_TOKEN_KEY);
  };

  const onSave = () => {
    const trimmed = token.trim();
    persist(trimmed);
    setSavedToken(trimmed);
    setToken(trimmed);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  };

  const onClear = () => {
    persist("");
    setToken("");
    setSavedToken("");
  };

  const dirty = token.trim() !== savedToken;
  const hasSaved = savedToken.length > 0;
  const canSave = dirty;

  let pillVariant = "";
  let statusLabel = "No token saved — transcripts will be skipped on scrape";
  let StatusIcon = Warning;
  if (savedFlash) {
    pillVariant = "ok";
    statusLabel = "Token saved";
    StatusIcon = CheckCircle;
  } else if (dirty && token) {
    pillVariant = "warn";
    statusLabel = "Unsaved changes — click Save to persist";
  } else if (dirty && !token && hasSaved) {
    pillVariant = "warn";
    statusLabel = "Field cleared — click Save to wipe stored token";
  } else if (!dirty && hasSaved) {
    pillVariant = "ok";
    statusLabel = "Token saved — transcripts enabled";
    StatusIcon = CheckCircle;
  }

  return (
    <section style={{ display: "grid", gap: 10 }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 14,
              fontWeight: 600,
              color: "var(--tac-fg)",
            }}
          >
            <Microphone size={15} weight="regular" color="var(--tac-accent)" />
            Groq Whisper
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--tac-mute)",
              marginTop: 2,
            }}
          >
            Transcriber token
          </div>
        </div>
        <a
          href="https://console.groq.com/keys"
          target="_blank"
          rel="noopener noreferrer"
          className="tac-btn"
          style={{
            fontSize: 12,
            padding: "5px 10px",
            textDecoration: "none",
          }}
        >
          Get key
        </a>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto auto",
          gap: 6,
          alignItems: "stretch",
        }}
      >
        <div style={{ position: "relative" }}>
          <input
            type={showToken ? "text" : "password"}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSave) {
                e.preventDefault();
                onSave();
              }
            }}
            placeholder="gsk_…"
            spellCheck={false}
            autoComplete="off"
            className="tac-input"
            style={{
              fontSize: 12,
              padding: "8px 32px 8px 10px",
              fontFamily:
                '"JetBrains Mono", ui-monospace, monospace',
            }}
          />
          <button
            type="button"
            onClick={() => setShowToken((s) => !s)}
            aria-label={showToken ? "Hide token" : "Show token"}
            style={{
              position: "absolute",
              right: 6,
              top: "50%",
              transform: "translateY(-50%)",
              background: "transparent",
              border: "none",
              color: "var(--tac-mute)",
              cursor: "pointer",
              padding: 4,
              display: "grid",
              placeItems: "center",
            }}
          >
            {showToken ? (
              <EyeSlash size={12} weight="regular" />
            ) : (
              <Eye size={12} weight="regular" />
            )}
          </button>
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          className="tac-btn tac-btn-accent"
          style={{ padding: "0 12px", fontSize: 12 }}
        >
          <FloppyDisk size={12} weight="regular" />
          Save
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={!hasSaved && !token}
          className="tac-btn"
          style={{ padding: "0 12px", fontSize: 12 }}
        >
          <Trash size={12} weight="regular" />
          Clear
        </button>
      </div>

      <div
        className={`tac-pill${pillVariant ? ` tac-pill--${pillVariant}` : ""}`}
        style={{ alignSelf: "start", paddingTop: 4, paddingBottom: 4 }}
      >
        <StatusIcon size={12} weight="regular" />
        {statusLabel}
      </div>

      <div
        style={{
          padding: "10px 12px",
          background: "var(--tac-surface2)",
          border: "1px solid var(--tac-border)",
          borderRadius: 8,
          fontSize: 12,
          color: "var(--tac-mute)",
          lineHeight: 1.5,
        }}
      >
        Token rides in the request body to /api/scrape and /api/transcribe.
        The server forwards it to Groq Whisper and never persists it. When
        unset, scrapes still complete — they just ship without transcripts.
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

  const overallVariant =
    state === API_STATE.ONLINE
      ? "ok"
      : state === API_STATE.DEGRADED
      ? "warn"
      : state === API_STATE.OFFLINE
      ? "err"
      : "";
  const overallLabel =
    state === API_STATE.ONLINE
      ? "All services online"
      : state === API_STATE.DEGRADED
      ? "Anthropic OK · Groq missing"
      : state === API_STATE.OFFLINE
      ? "Offline"
      : "Checking…";

  return (
    <section style={{ display: "grid", gap: 10 }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--tac-fg)",
            }}
          >
            Telemetry
          </div>
          <div style={{ fontSize: 12, color: "var(--tac-mute)", marginTop: 2 }}>
            API status
          </div>
        </div>
        <button
          type="button"
          onClick={recheck}
          disabled={state === API_STATE.CHECKING}
          className="tac-btn"
          style={{ padding: "5px 10px", fontSize: 12 }}
        >
          <ArrowsClockwise
            size={12}
            weight="regular"
            style={{
              animation:
                state === API_STATE.CHECKING
                  ? "spin 1s linear infinite"
                  : "none",
            }}
          />
          Recheck
        </button>
      </header>

      <span
        className={`tac-pill${overallVariant ? ` tac-pill--${overallVariant}` : ""}`}
        style={{ alignSelf: "start", paddingTop: 4, paddingBottom: 4 }}
      >
        <StatusIcon
          size={12}
          weight="regular"
          style={{
            animation: conf.spin ? "spin 1s linear infinite" : "none",
          }}
        />
        {overallLabel}
      </span>

      <div style={{ display: "grid", gap: 8 }}>
        <ServiceRow
          name="Anthropic"
          subtitle="Required · framework analysis"
          ok={!!anthropicConfigured}
          model={details?.model}
          required
        />
        <ServiceRow
          name="Groq Whisper"
          subtitle="Optional · top-reel transcription"
          ok={!!groqConfigured}
          model={details?.groqModel}
        />
      </div>

      {error && (
        <div className="tac-error-banner">
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <Warning
              size={14}
              color="var(--tac-danger)"
              style={{ marginTop: 2, flexShrink: 0 }}
            />
            <span style={{ wordBreak: "break-all" }}>{error}</span>
          </div>
        </div>
      )}

      <div
        style={{
          padding: "10px 12px",
          background: "var(--tac-surface2)",
          border: "1px solid var(--tac-border)",
          borderRadius: 8,
          fontSize: 12,
          color: "var(--tac-mute)",
          lineHeight: 1.5,
        }}
      >
        Anthropic powers every framework run. Groq is only consulted to
        transcribe the top-engaged reels before deep analysis. The pipeline
        still runs without Groq — transcripts are skipped.
      </div>
    </section>
  );
}

function ServiceRow({ name, subtitle, ok, model, required }) {
  const variant = ok ? "ok" : required ? "err" : "warn";
  const status = ok ? "Online" : required ? "Missing" : "Optional";

  return (
    <div
      style={{
        background: "var(--tac-surface)",
        border: "1px solid var(--tac-border)",
        borderRadius: 8,
        padding: "12px 14px",
        display: "grid",
        gridTemplateColumns: "1fr auto",
        alignItems: "center",
        gap: 10,
      }}
    >
      <div>
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "var(--tac-fg)",
          }}
        >
          {name}
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--tac-mute)",
            marginTop: 2,
          }}
        >
          {subtitle}
        </div>
        {model && (
          <div
            style={{
              fontSize: 11,
              color: "var(--tac-dim)",
              marginTop: 2,
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {model}
          </div>
        )}
      </div>
      <span className={`tac-pill tac-pill--${variant}`}>{status}</span>
    </div>
  );
}
