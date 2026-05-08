import { useEffect, useRef, useState } from "react";
import {
  Robot,
  Eye,
  EyeSlash,
  ArrowSquareOut,
  ArrowsClockwise,
  CircleNotch,
  CheckCircle,
  Warning,
  FloppyDisk,
  Trash,
} from "@phosphor-icons/react";
import ApifyRunPanel from "../widgets/ApifyRunPanel.jsx";

// localStorage slot for the operator's Apify token. The previous
// `swh-apify-config` key (which stored URL list / results / date filters)
// is migrated away on mount — those inputs now live on the Dashboard.
const APIFY_TOKEN_KEY = "swh-apify-token";
const LEGACY_CONFIG_KEY = "swh-apify-config";

export default function ApifyView() {
  // `token` is the live input value the operator is editing.
  // `savedToken` is what's actually persisted in localStorage right now.
  // Decoupling them gives us an explicit dirty/clean state — the SAVE button
  // is the only thing that writes to localStorage, so the operator can always
  // see whether their input has been committed.
  const [token, setToken] = useState("");
  const [savedToken, setSavedToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  // Hydrate from localStorage + clear the legacy form-state slot on mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(APIFY_TOKEN_KEY) || "";
    setToken(stored);
    setSavedToken(stored);
    window.localStorage.removeItem(LEGACY_CONFIG_KEY);
  }, []);

  const persistToken = (next) => {
    if (typeof window === "undefined") return;
    if (next) window.localStorage.setItem(APIFY_TOKEN_KEY, next);
    else window.localStorage.removeItem(APIFY_TOKEN_KEY);
  };

  const onSaveToken = () => {
    const trimmed = token.trim();
    persistToken(trimmed);
    setSavedToken(trimmed);
    setToken(trimmed); // normalize the input so a stray trailing space doesn't keep `dirty` true
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  };

  const onClearToken = () => {
    persistToken("");
    setToken("");
    setSavedToken("");
  };

  const dirty = token.trim() !== savedToken;
  const hasSaved = savedToken.length > 0;
  const canSave = dirty;

  return (
    <section
      style={{
        display: "grid",
        gridTemplateRows: "auto 1fr",
        gap: 1,
        background: "var(--tac-border)",
        minHeight: "calc(100dvh - 44px)",
      }}
    >
      <header
        style={{
          background: "var(--tac-bg)",
          padding: "16px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div>
          <div className="tac-label">SECTION D-05 / APIFY</div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginTop: 4,
            }}
          >
            <Robot size={20} weight="regular" color="#4f8dfe" />
            <h1
              className="tac-display"
              style={{ fontSize: 22, color: "var(--tac-fg)", margin: 0 }}
            >
              ACCOUNT · USAGE
            </h1>
          </div>
        </div>
        <a
          href="https://console.apify.com/account#/integrations"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: 10,
            color: "var(--tac-mute)",
            letterSpacing: "0.12em",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            textDecoration: "none",
            border: "1px solid var(--tac-border)",
            padding: "6px 12px",
            transition: "color 120ms, border-color 120ms",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--tac-fg)";
            e.currentTarget.style.borderColor = "#4f8dfe";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--tac-mute)";
            e.currentTarget.style.borderColor = "var(--tac-border)";
          }}
        >
          GET TOKEN
          <ArrowSquareOut size={11} weight="regular" />
        </a>
      </header>

      <div
        style={{
          background: "var(--tac-bg)",
          padding: "24px",
          overflow: "auto",
        }}
      >
        <div
          style={{
            maxWidth: 720,
            margin: "0 auto",
            display: "grid",
            gap: 18,
          }}
        >
          <Section
            label="01 / API TOKEN"
            sub="apify.com → Settings → Integrations · stored in this browser only"
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto auto",
                gap: 8,
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
                      onSaveToken();
                    }
                  }}
                  placeholder="apify_api_…"
                  spellCheck={false}
                  autoComplete="off"
                  className="tac-input"
                  style={{
                    fontSize: 12,
                    padding: "10px 36px 10px 12px",
                    letterSpacing: "0.02em",
                    fontFamily: '"JetBrains Mono", monospace',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowToken((s) => !s)}
                  aria-label={showToken ? "Hide token" : "Show token"}
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
                  {showToken ? (
                    <EyeSlash size={14} weight="regular" />
                  ) : (
                    <Eye size={14} weight="regular" />
                  )}
                </button>
              </div>
              <button
                type="button"
                onClick={onSaveToken}
                disabled={!canSave}
                className="tac-btn tac-btn-accent"
                title={
                  canSave
                    ? "Persist this token to localStorage (Enter)"
                    : hasSaved
                    ? "Already saved"
                    : "Paste a token first"
                }
                style={{
                  padding: "0 14px",
                  fontSize: 11,
                  letterSpacing: "0.08em",
                  opacity: canSave ? 1 : 0.4,
                  cursor: canSave ? "pointer" : "not-allowed",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <FloppyDisk size={13} weight="regular" />
                SAVE
              </button>
              <button
                type="button"
                onClick={onClearToken}
                disabled={!hasSaved && !token}
                className="tac-btn"
                title="Wipe the saved token from this browser"
                style={{
                  padding: "0 12px",
                  fontSize: 11,
                  letterSpacing: "0.08em",
                  opacity: !hasSaved && !token ? 0.4 : 1,
                  cursor: !hasSaved && !token ? "not-allowed" : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Trash size={12} weight="regular" />
                CLEAR
              </button>
            </div>

            <TokenStatus
              dirty={dirty}
              hasSaved={hasSaved}
              flash={savedFlash}
              hasInput={!!token}
            />

            <Hint>
              Token is forwarded to api.apify.com per request and never persisted
              server-side. Scrapes are kicked off from the{" "}
              <span style={{ color: "#4f8dfe" }}>Dashboard</span>.
            </Hint>
          </Section>

          <AccountSection token={savedToken} />

          <ApifyRunPanel />
        </div>
      </div>
    </section>
  );
}

function AccountSection({ token }) {
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refreshedAt, setRefreshedAt] = useState(null);
  // Stamp tied to the latest in-flight fetch so a stale response can never
  // overwrite a newer one (rapid token edits in the input field).
  const inflightRef = useRef(0);

  const fetchAccount = async (rawToken) => {
    const cleanToken = String(rawToken || "").trim();
    if (!cleanToken) {
      setAccount(null);
      setError("");
      return;
    }
    const stamp = ++inflightRef.current;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/apify/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: cleanToken }),
      });
      const data = await res.json().catch(() => ({}));
      if (stamp !== inflightRef.current) return;
      if (!res.ok) {
        setAccount(null);
        setError(data?.error || `HTTP ${res.status}`);
      } else {
        setAccount(data);
        setRefreshedAt(Date.now());
      }
    } catch (e) {
      if (stamp !== inflightRef.current) return;
      setAccount(null);
      setError(e.message || "fetch failed");
    } finally {
      if (stamp === inflightRef.current) setLoading(false);
    }
  };

  // Debounced fetch on token edits so we don't spam Apify while the user
  // pastes / corrects the value.
  useEffect(() => {
    const trimmed = token.trim();
    if (!trimmed) {
      setAccount(null);
      setError("");
      return;
    }
    const t = setTimeout(() => fetchAccount(trimmed), 600);
    return () => clearTimeout(t);
  }, [token]);

  const tokenSet = token.trim().length > 0;
  const user = account?.user;
  const usage = account?.usage;

  return (
    <Section
      label="02 / ACCOUNT · USAGE"
      sub="live readout from /v2/users/me"
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <span
          style={{
            fontSize: 9,
            color: tokenSet ? "var(--tac-mute)" : "var(--tac-dim)",
            letterSpacing: "0.06em",
            fontFamily: '"JetBrains Mono", monospace',
          }}
        >
          {refreshedAt
            ? `last refreshed ${fmtAgo(refreshedAt)}`
            : tokenSet
            ? "loading…"
            : "// enter a token above to load account data"}
        </span>
        <button
          type="button"
          onClick={() => fetchAccount(token)}
          disabled={!tokenSet || loading}
          className="tac-btn"
          style={{
            padding: "6px 10px",
            fontSize: 9,
            opacity: !tokenSet || loading ? 0.4 : 1,
            cursor: !tokenSet || loading ? "not-allowed" : "pointer",
          }}
        >
          <ArrowsClockwise
            size={11}
            weight="regular"
            style={{
              animation: loading ? "spin 1s linear infinite" : "none",
            }}
          />
          REFRESH
        </button>
      </div>

      {error && (
        <div
          style={{
            padding: "10px 12px",
            background: "#1f1212",
            border: "1px solid #ef4444",
            color: "#ef4444",
            fontSize: 11,
            fontFamily: '"JetBrains Mono", monospace',
            letterSpacing: "0.04em",
            lineHeight: 1.5,
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
          }}
        >
          <Warning size={13} weight="regular" style={{ marginTop: 1, flexShrink: 0 }} />
          <span style={{ wordBreak: "break-word" }}>// {error}</span>
        </div>
      )}

      {!error && tokenSet && loading && !user && (
        <div
          style={{
            padding: "20px",
            display: "grid",
            placeItems: "center",
            color: "var(--tac-mute)",
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 11,
          }}
        >
          <CircleNotch
            size={16}
            weight="regular"
            color="#4f8dfe"
            style={{ animation: "spin 1s linear infinite" }}
          />
        </div>
      )}

      {user && (
        <div style={{ display: "grid", gap: 1, background: "var(--tac-border)" }}>
          <KV
            k="USERNAME"
            v={
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  color: "#4f8dfe",
                }}
              >
                <CheckCircle size={11} weight="regular" />
                {user.username || user.profile?.name || "—"}
              </span>
            }
            accent
          />
          {user.email && <KV k="EMAIL" v={user.email} />}
          {(user.plan?.id || user.plan) && (
            <KV
              k="PLAN"
              v={(user.plan?.id || user.plan || "").toString().toUpperCase()}
            />
          )}
          <UsageRows usage={usage} user={user} />
        </div>
      )}
    </Section>
  );
}

// Apify's /usage/monthly response shape varies by plan — older accounts
// expose `monthlyUsageUsd`, newer ones expose `usageCycle.usageBaseUsd`.
// Be defensive so a missing field renders "—" instead of throwing.
function UsageRows({ usage, user }) {
  if (!usage && !user?.limits) return null;
  const usdUsed = pickNumber(
    usage?.monthlyUsageUsd,
    usage?.monthlyServiceUsageUsd,
    usage?.usageCycle?.usageBaseUsd
  );
  const usdLimit = pickNumber(
    user?.limits?.maxMonthlyUsageUsd,
    usage?.monthlyServiceUsageLimitUsd
  );
  const computeUsed = pickNumber(
    usage?.actorComputeUnits,
    usage?.computeUnits,
    usage?.usageCycle?.actorComputeUnits
  );
  const computeLimit = pickNumber(
    user?.limits?.maxMonthlyActorComputeUnits,
    user?.limits?.maxActorComputeUnits
  );
  const datasetReads = pickNumber(usage?.datasetReads, usage?.datasetReadEvents);
  const proxyServiceUsage = pickNumber(usage?.proxyResidentialUsageGb);

  return (
    <>
      {usdUsed != null && (
        <KV
          k="MONTHLY USD"
          v={
            <UsageBar
              used={usdUsed}
              limit={usdLimit}
              format={(n) => `$${(Number(n) || 0).toFixed(2)}`}
            />
          }
        />
      )}
      {computeUsed != null && (
        <KV
          k="COMPUTE UNITS"
          v={
            <UsageBar
              used={computeUsed}
              limit={computeLimit}
              format={(n) => Number(n).toFixed(3)}
            />
          }
        />
      )}
      {datasetReads != null && (
        <KV k="DATASET READS / MO" v={datasetReads.toLocaleString()} />
      )}
      {proxyServiceUsage != null && (
        <KV
          k="PROXY (RESIDENTIAL)"
          v={`${proxyServiceUsage.toFixed(2)} GB`}
        />
      )}
    </>
  );
}

function UsageBar({ used, limit, format }) {
  const pct = limit && limit > 0 ? Math.min(100, (used / limit) * 100) : null;
  const tone = pct == null ? "#4f8dfe" : pct >= 90 ? "#ef4444" : pct >= 70 ? "#fbbf24" : "#4AF626";
  return (
    <div style={{ display: "grid", gap: 4, minWidth: 160 }}>
      <span
        style={{
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 11,
          color: "var(--tac-fg)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {format(used)}
        {limit ? (
          <span style={{ color: "var(--tac-mute)" }}>
            {" "}
            / {format(limit)}
          </span>
        ) : null}
      </span>
      {pct != null && (
        <div
          style={{
            height: 3,
            background: "var(--tac-bg)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              bottom: 0,
              width: `${pct}%`,
              background: tone,
              transition: "width 240ms ease",
            }}
          />
        </div>
      )}
    </div>
  );
}

function pickNumber(...vals) {
  for (const v of vals) {
    if (v != null && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}

function fmtAgo(ts) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

function Section({ label, sub, children }) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            fontSize: 10,
            color: "#4f8dfe",
            letterSpacing: "0.18em",
            fontWeight: 600,
            fontFamily: '"JetBrains Mono", monospace',
          }}
        >
          {label}
        </span>
        {sub && (
          <span
            style={{
              fontSize: 9,
              color: "var(--tac-dim)",
              letterSpacing: "0.04em",
              fontFamily: '"JetBrains Mono", monospace',
            }}
          >
            {sub}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function TokenStatus({ dirty, hasSaved, flash, hasInput }) {
  // Communicates the relationship between the editor and persisted state at
  // a glance — no token / saved+clean / unsaved edits / flashing-after-save.
  let tone = "var(--tac-dim)";
  let label = "// no token saved · paste one and click SAVE";
  let Icon = Warning;
  if (flash) {
    tone = "#4AF626";
    label = "TOKEN SAVED";
    Icon = CheckCircle;
  } else if (dirty && hasInput) {
    tone = "#fbbf24";
    label = "UNSAVED CHANGES · click SAVE to persist";
    Icon = Warning;
  } else if (dirty && !hasInput && hasSaved) {
    tone = "#fbbf24";
    label = "FIELD CLEARED · click SAVE to wipe stored token, or paste a new one";
    Icon = Warning;
  } else if (!dirty && hasSaved) {
    tone = "#4AF626";
    label = "TOKEN SAVED · ready for scrapes";
    Icon = CheckCircle;
  }
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        marginTop: 8,
        padding: "5px 10px",
        border: `1px solid ${tone}`,
        background: `${tone}11`,
        color: tone,
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 10,
        letterSpacing: "0.08em",
        fontWeight: 600,
        alignSelf: "start",
        transition: "border-color 200ms, background 200ms, color 200ms",
      }}
    >
      <Icon size={11} weight="regular" />
      {label}
    </div>
  );
}

function Hint({ children }) {
  return (
    <div
      style={{
        fontSize: 10,
        color: "var(--tac-dim)",
        marginTop: 4,
        letterSpacing: "0.04em",
        lineHeight: 1.5,
        fontFamily: '"JetBrains Mono", monospace',
      }}
    >
      {children}
    </div>
  );
}

function KV({ k, v, accent }) {
  return (
    <div
      style={{
        background: "var(--tac-surface)",
        padding: "10px 14px",
        display: "grid",
        gridTemplateColumns: "160px 1fr",
        gap: 12,
        alignItems: "center",
      }}
    >
      <span
        style={{
          fontSize: 9,
          color: "var(--tac-mute)",
          letterSpacing: "0.1em",
          fontFamily: '"JetBrains Mono", monospace',
        }}
      >
        {k}
      </span>
      <span
        style={{
          fontSize: 11,
          color: accent ? "#4f8dfe" : "var(--tac-fg)",
          fontWeight: accent ? 600 : 400,
          fontFamily: '"JetBrains Mono", monospace',
        }}
      >
        {v ?? "—"}
      </span>
    </div>
  );
}
