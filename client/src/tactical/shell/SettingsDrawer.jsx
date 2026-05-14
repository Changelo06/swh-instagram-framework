import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  CheckCircle,
  Warning,
  Moon,
  Sun,
  Eye,
  EyeSlash,
  Trash,
  Plus,
  ArrowSquareOut,
  CircleNotch,
} from "@phosphor-icons/react";
import {
  keysList,
  keysSet,
  keysDelete,
  appOpenExternal,
} from "../../lib/chiqo.js";

// Metadata for the three providers we support in the vault. The
// `name` matches keys.cjs's KNOWN_PROVIDERS — keep these in sync.
const PROVIDERS = [
  {
    id: "anthropic",
    label: "Claude",
    subtitle: "Powers every framework run",
    getKeyUrl: "https://console.anthropic.com/settings/keys",
    placeholder: "sk-ant-…",
    required: true,
  },
  {
    id: "groq",
    label: "Groq",
    subtitle: "Transcribes top reels before deep analysis",
    getKeyUrl: "https://console.groq.com/keys",
    placeholder: "gsk_…",
    required: false,
  },
  {
    id: "apify",
    label: "Apify",
    subtitle: "Scrapes Instagram profiles and reels",
    getKeyUrl: "https://console.apify.com/account#/integrations",
    placeholder: "apify_api_…",
    required: false,
  },
];

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
              <SecuritySection />
              <ApiKeysSection />
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

function SecuritySection() {
  const [minutes, setMinutes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const c = typeof window !== "undefined" ? window.chiqo : null;
        if (!c?.vault?.getAutoLock) return;
        const r = await c.vault.getAutoLock();
        if (!cancelled) setMinutes(Number(r?.autoLockMinutes) || 0);
      } catch (e) {
        if (!cancelled) setError(e.message || String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const update = async (next) => {
    setBusy(true);
    setError(null);
    try {
      const c = typeof window !== "undefined" ? window.chiqo : null;
      if (!c?.vault?.setAutoLock) throw new Error("bridge unavailable");
      const r = await c.vault.setAutoLock(Number(next) || 0);
      setMinutes(Number(r?.autoLockMinutes) || 0);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

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
          Security
        </div>
        <div style={{ fontSize: 12, color: "var(--tac-mute)", marginTop: 2 }}>
          Lock the vault automatically when you walk away.
        </div>
      </header>

      <label
        style={{
          display: "grid",
          gap: 6,
          fontSize: 12,
          color: "var(--tac-mute)",
        }}
      >
        Auto-lock after
        <select
          className="tac-input"
          disabled={busy || minutes === null}
          value={minutes ?? 0}
          onChange={(e) => update(e.target.value)}
          style={{ width: 220 }}
        >
          <option value={0}>Off — only manual lock</option>
          <option value={5}>5 minutes idle</option>
          <option value={15}>15 minutes idle</option>
          <option value={30}>30 minutes idle</option>
          <option value={60}>1 hour idle</option>
          <option value={240}>4 hours idle</option>
        </select>
      </label>

      {error && (
        <div className="tac-error-banner" style={{ fontSize: 12 }}>
          {error}
        </div>
      )}
    </section>
  );
}

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

// API keys (Phase 2.5).
//
// Replaces the old "/api/health" probe — keys now live inside the
// encrypted vault, managed via chiqo.keys.{list,set,delete} IPC. The
// renderer NEVER receives the plaintext value back. listKeys() returns
// only `{ provider, fingerprint, last4, createdAt, updatedAt }` per
// configured key; the actual value sits in the encrypted DB and is
// only read by the main-process provider-call code (which lands in
// Phase 2.6).
//
// Each provider row knows three states:
//   * not configured  →  shows "Add key" CTA
//   * configured + idle → shows fingerprint·last4 + Replace / Delete
//   * editing         →  opens the KeyEditModal
function ApiKeysSection() {
  const [keys, setKeys] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [editing, setEditing] = useState(null); // provider id or null

  const refresh = async () => {
    try {
      const rows = await keysList();
      setKeys(rows);
      setLoadError(null);
    } catch (e) {
      setLoadError(e);
      setKeys([]);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const byProvider = (id) => keys?.find((r) => r.provider === id) || null;

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <header>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--tac-fg)",
          }}
        >
          API keys
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--tac-mute)",
            marginTop: 2,
          }}
        >
          Stored encrypted inside this vault. Never sent to chiqo.ai.
        </div>
      </header>

      {keys === null ? (
        <div
          style={{
            padding: "14px",
            display: "grid",
            placeItems: "center",
            color: "var(--tac-mute)",
            fontSize: 12,
          }}
        >
          <CircleNotch
            size={14}
            color="var(--tac-accent)"
            style={{ animation: "spin 1s linear infinite" }}
          />
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {PROVIDERS.map((p) => (
            <ProviderRow
              key={p.id}
              meta={p}
              stored={byProvider(p.id)}
              onEdit={() => setEditing(p.id)}
              onDeleted={refresh}
            />
          ))}
        </div>
      )}

      {loadError && (
        <div className="tac-error-banner">
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <Warning
              size={14}
              color="var(--tac-danger)"
              style={{ marginTop: 2, flexShrink: 0 }}
            />
            <span style={{ wordBreak: "break-word" }}>
              {loadError.message ||
                "Couldn't load saved keys — try unlocking your vault again."}
            </span>
          </div>
        </div>
      )}

      {editing && (
        <KeyEditModal
          providerMeta={PROVIDERS.find((p) => p.id === editing)}
          existing={byProvider(editing)}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
    </section>
  );
}

function ProviderRow({ meta, stored, onEdit, onDeleted }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const onDelete = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await keysDelete(meta.id);
      onDeleted?.();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const status = stored
    ? { variant: "ok", label: "Connected" }
    : { variant: meta.required ? "err" : "warn", label: meta.required ? "Required" : "Optional" };

  return (
    <div
      style={{
        background: "var(--tac-surface)",
        border: "1px solid var(--tac-border)",
        borderRadius: 10,
        padding: "12px 14px",
        display: "grid",
        gap: 8,
      }}
    >
      <div
        style={{
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
            {meta.label}
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--tac-mute)",
              marginTop: 2,
            }}
          >
            {meta.subtitle}
          </div>
          {stored && (
            <div
              style={{
                fontSize: 11,
                color: "var(--tac-dim)",
                marginTop: 4,
                fontFamily:
                  '"JetBrains Mono", ui-monospace, monospace',
                fontVariantNumeric: "tabular-nums",
              }}
              title={`Fingerprint: ${stored.fingerprint} · stored ${new Date(
                stored.updatedAt
              ).toLocaleDateString()}`}
            >
              {stored.fingerprint} · …{stored.last4}
            </div>
          )}
        </div>
        <span className={`tac-pill tac-pill--${status.variant}`}>
          {status.label}
        </span>
      </div>

      <div
        style={{
          display: "flex",
          gap: 6,
          justifyContent: "flex-end",
          alignItems: "center",
        }}
      >
        <button
          type="button"
          onClick={() => appOpenExternal(meta.getKeyUrl)}
          className="tac-btn"
          style={{
            fontSize: 11,
            padding: "4px 8px",
            color: "var(--tac-mute)",
          }}
          title={`Open ${meta.label}'s console in your browser`}
        >
          Get key
          <ArrowSquareOut size={10} weight="regular" />
        </button>
        {stored ? (
          <>
            <button
              type="button"
              onClick={onDelete}
              disabled={busy}
              className="tac-btn"
              style={{
                fontSize: 11,
                padding: "4px 8px",
                opacity: busy ? 0.5 : 1,
              }}
              title="Remove this key from the vault"
            >
              <Trash size={11} weight="regular" />
              Remove
            </button>
            <button
              type="button"
              onClick={onEdit}
              disabled={busy}
              className="tac-btn tac-btn-accent"
              style={{ fontSize: 11, padding: "4px 10px" }}
            >
              Replace
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onEdit}
            className="tac-btn tac-btn-accent"
            style={{ fontSize: 11, padding: "4px 10px" }}
          >
            <Plus size={11} weight="regular" />
            Add key
          </button>
        )}
      </div>

      {error && (
        <div
          style={{
            fontSize: 11.5,
            color: "var(--tac-danger)",
            marginTop: 4,
          }}
        >
          {error.message || "Couldn't update — try again."}
        </div>
      )}
    </div>
  );
}

// Modal for add/replace. The user pastes the key, we IPC it to main,
// main encrypts to DB, main returns the public-safe row. The pasted
// value briefly lives in React state while the form is open; that's
// the same exposure window as any HTML password field. Once the
// modal closes, the local state is dropped.
function KeyEditModal({ providerMeta, existing, onClose, onSaved }) {
  const [value, setValue] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [warning, setWarning] = useState(null);

  const submit = async (e) => {
    e?.preventDefault?.();
    const trimmed = value.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    setWarning(null);
    try {
      const r = await keysSet(providerMeta.id, trimmed);
      if (!r.looksValid) {
        setWarning(
          `That doesn't look like an ${providerMeta.label} key (expected prefix is "${expectedPrefix(
            providerMeta.id
          )}"). Saved anyway.`
        );
        // Still treat this as success — we save what the user pasted.
        // Give them a moment to see the warning, then close.
        setTimeout(() => onSaved?.(), 1200);
      } else {
        onSaved?.();
      }
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(10, 10, 10, 0.78)",
          zIndex: 60,
        }}
      />
      <motion.div
        initial={{ y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 26 }}
        role="dialog"
        aria-label={`${existing ? "Replace" : "Add"} ${providerMeta.label} key`}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 61,
          display: "grid",
          placeItems: "center",
          padding: 24,
          pointerEvents: "none",
        }}
      >
        <form
          onSubmit={submit}
          style={{
            pointerEvents: "auto",
            width: "min(440px, 100%)",
            background: "var(--tac-surface)",
            border: "1px solid var(--tac-border)",
            borderRadius: 12,
            overflow: "hidden",
            boxShadow: "0 24px 60px -20px rgba(0, 0, 0, 0.6)",
          }}
        >
          <div
            style={{
              padding: "18px 22px",
              borderBottom: "1px solid var(--tac-border)",
            }}
          >
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: "var(--tac-fg)",
              }}
            >
              {existing ? "Replace" : "Add"} {providerMeta.label} key
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--tac-mute)",
                marginTop: 4,
              }}
            >
              {existing
                ? `Replaces the key ending in …${existing.last4}.`
                : `Paste your ${providerMeta.label} API key. It goes into the encrypted vault.`}
            </div>
          </div>

          <div style={{ padding: "18px 22px", display: "grid", gap: 12 }}>
            <div style={{ position: "relative" }}>
              <input
                type={show ? "text" : "password"}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={providerMeta.placeholder}
                autoFocus
                spellCheck={false}
                autoComplete="off"
                className="tac-input"
                style={{
                  fontSize: 13,
                  padding: "10px 36px 10px 12px",
                  fontFamily:
                    '"JetBrains Mono", ui-monospace, monospace',
                }}
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                aria-label={show ? "Hide key" : "Show key"}
                style={{
                  position: "absolute",
                  right: 8,
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
                {show ? (
                  <EyeSlash size={14} weight="regular" />
                ) : (
                  <Eye size={14} weight="regular" />
                )}
              </button>
            </div>

            <button
              type="button"
              onClick={() => appOpenExternal(providerMeta.getKeyUrl)}
              className="tac-btn"
              style={{
                fontSize: 12,
                padding: "5px 10px",
                justifySelf: "start",
              }}
            >
              Get a key
              <ArrowSquareOut size={11} weight="regular" />
            </button>

            {error && (
              <div className="tac-error-banner">
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Warning size={14} color="var(--tac-danger)" />
                  <span>{error.message || "Couldn't save."}</span>
                </div>
              </div>
            )}
            {warning && (
              <div
                role="alert"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 12px",
                  background: "rgba(245, 184, 46, 0.08)",
                  border: "1px solid rgba(245, 184, 46, 0.25)",
                  borderRadius: 8,
                  fontSize: 12.5,
                  color: "var(--tac-fg)",
                }}
              >
                <Warning size={14} color="var(--tac-warning)" />
                <span>{warning}</span>
              </div>
            )}
          </div>

          <div
            style={{
              padding: "14px 22px",
              borderTop: "1px solid var(--tac-border)",
              background: "var(--tac-surface2)",
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
            }}
          >
            <button
              type="button"
              onClick={onClose}
              className="tac-btn"
              disabled={busy}
              style={{ padding: "8px 14px", fontSize: 13 }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!value.trim() || busy}
              className="tac-btn tac-btn-accent"
              style={{
                padding: "8px 18px",
                fontSize: 13,
                opacity: !value.trim() || busy ? 0.5 : 1,
                cursor: !value.trim() || busy ? "not-allowed" : "pointer",
              }}
            >
              <CheckCircle size={14} weight="regular" />
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </motion.div>
    </>
  );
}

function expectedPrefix(providerId) {
  switch (providerId) {
    case "anthropic":
      return "sk-ant-";
    case "groq":
      return "gsk_";
    case "apify":
      return "apify_api_";
    default:
      return "";
  }
}
