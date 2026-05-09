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
  [API_STATE.ONLINE]: { icon: CheckCircle, color: "var(--tac-success)", label: "ONLINE" },
  [API_STATE.DEGRADED]: { icon: Warning, color: "var(--tac-warning)", label: "DEGRADED" },
  [API_STATE.OFFLINE]: { icon: XCircle, color: "var(--tac-danger)", label: "OFFLINE" },
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
                  Display and API status
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
              <span>Chiqo.ai</span>
              <span>v1.2</span>
            </footer>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

// Groq Whisper token UI was removed because it cluttered settings —
// transcript functionality still works server-side via env.

function DisplaySection({ theme, onThemeChange }) {
  const current = theme === "light" ? "light" : "dark";
  const options = [
    {
      id: "dark",
      label: "Dark",
      sub: "Default",
      icon: Moon,
    },
    {
      id: "light",
      label: "Light",
      sub: "Warm off-white",
      icon: Sun,
    },
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
          Theme
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--tac-mute)",
            marginTop: 2,
          }}
        >
          Pick the surface palette
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
          const active = current === opt.id;
          const Icon = opt.icon;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onThemeChange?.(opt.id)}
              aria-pressed={active}
              style={{
                background: active
                  ? "var(--tac-surface)"
                  : "var(--tac-surface2)",
                border: `1px solid ${
                  active ? "var(--tac-accent)" : "var(--tac-border)"
                }`,
                borderRadius: 10,
                color: active ? "var(--tac-fg)" : "var(--tac-mute)",
                padding: "12px 14px",
                fontFamily:
                  '"Inter", ui-sans-serif, system-ui, sans-serif',
                fontSize: 13,
                cursor: "pointer",
                display: "grid",
                gridTemplateColumns: "18px 1fr auto",
                alignItems: "center",
                gap: 12,
                textAlign: "left",
                boxShadow: active
                  ? "0 0 0 3px var(--tac-accent-soft)"
                  : "none",
                transition:
                  "border-color 120ms, background 120ms, color 120ms, box-shadow 120ms",
              }}
            >
              <Icon
                size={16}
                weight="regular"
                color={active ? "var(--tac-accent)" : "var(--tac-mute)"}
              />
              <div>
                <div
                  style={{
                    fontWeight: active ? 600 : 500,
                    color: active ? "var(--tac-fg)" : "var(--tac-fg)",
                  }}
                >
                  {opt.label}
                </div>
                <div
                  style={{
                    fontSize: 11.5,
                    color: "var(--tac-mute)",
                    marginTop: 2,
                    fontWeight: 400,
                  }}
                >
                  {opt.sub}
                </div>
              </div>
              {active && (
                <CheckCircle
                  size={14}
                  weight="fill"
                  color="var(--tac-accent)"
                />
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ApiSection({ health }) {
  const { state, details, error, recheck } = health;
  const anthropicConfigured =
    details?.services?.anthropic?.configured ?? details?.anthropicConfigured;
  const groqConfigured =
    details?.services?.groq?.configured ?? details?.groqConfigured;
  const apifyConfigured =
    details?.services?.apify?.configured ?? details?.apifyConfigured;

  return (
    <section style={{ display: "grid", gap: 12 }}>
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
            API status
          </div>
          <div style={{ fontSize: 12, color: "var(--tac-mute)", marginTop: 2 }}>
            Tokens are configured via server/.env
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

      <div style={{ display: "grid", gap: 8 }}>
        <ServiceRow
          name="Claude"
          subtitle="Powers every framework run"
          ok={!!anthropicConfigured}
          model={details?.model}
          required
        />
        <ServiceRow
          name="Groq"
          subtitle="Transcribes top reels before deep analysis"
          ok={!!groqConfigured}
          model={details?.groqModel}
        />
        <ServiceRow
          name="Apify"
          subtitle="Scrapes Instagram profiles and reels"
          ok={!!apifyConfigured}
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
    </section>
  );
}

function ServiceRow({ name, subtitle, ok, model, required }) {
  const variant = ok ? "ok" : required ? "err" : "warn";
  const status = ok ? "Connected" : required ? "Not configured" : "Optional";

  return (
    <div
      style={{
        background: "var(--tac-surface)",
        border: "1px solid var(--tac-border)",
        borderRadius: 10,
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

