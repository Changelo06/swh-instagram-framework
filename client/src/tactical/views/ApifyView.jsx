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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <Robot size={22} weight="regular" color="var(--tac-accent)" />
          <div>
            <h1 className="tac-section-title" style={{ margin: 0 }}>
              Apify account
            </h1>
            <div className="tac-section-copy">
              Token, account profile, and monthly usage.
            </div>
          </div>
        </div>
        <a
          href="https://console.apify.com/account#/integrations"
          target="_blank"
          rel="noopener noreferrer"
          className="tac-btn"
          style={{
            fontSize: 12,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            textDecoration: "none",
            padding: "6px 12px",
          }}
        >
          Get token
          <ArrowSquareOut size={12} weight="regular" />
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
            label="API token"
            sub="Stored in this browser only"
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
                    fontSize: 13,
                    padding: "10px 36px 10px 12px",
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
                    ? "Save this token (Enter)"
                    : hasSaved
                    ? "Already saved"
                    : "Paste a token first"
                }
                style={{ padding: "0 16px", fontSize: 13 }}
              >
                <FloppyDisk size={13} weight="regular" />
                Save
              </button>
              <button
                type="button"
                onClick={onClearToken}
                disabled={!hasSaved && !token}
                className="tac-btn"
                title="Remove the saved token from this browser"
                style={{ padding: "0 14px", fontSize: 13 }}
              >
                <Trash size={12} weight="regular" />
                Clear
              </button>
            </div>

            <TokenStatus
              dirty={dirty}
              hasSaved={hasSaved}
              flash={savedFlash}
              hasInput={!!token}
            />

            <Hint>
              Tokens are sent per request and never persisted on the server.
              Start a scrape from the{" "}
              <span style={{ color: "var(--tac-accent)" }}>Dashboard</span>.
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
    // The Apify token now lives in the vault; main resolves it via
    // chiqo.apify.account. The `rawToken` prop is kept only so the
    // debounced effect below has something to react to (the user
    // editing the token input still triggers a refresh, after
    // chiqo.keys.set persists the new value).
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
      const c = typeof window !== "undefined" ? window.chiqo : null;
      if (!c?.apify?.account) {
        throw new Error(
          "chiqo.ai bridge unavailable — open this in the chiqo.ai desktop app."
        );
      }
      const data = await c.apify.account();
      if (stamp !== inflightRef.current) return;
      setAccount(data);
      setRefreshedAt(Date.now());
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
      label="Account & usage"
      sub="Live from your Apify account"
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <span
          style={{
            fontSize: 12,
            color: tokenSet ? "var(--tac-mute)" : "var(--tac-dim)",
          }}
        >
          {refreshedAt
            ? `Last refreshed ${fmtAgo(refreshedAt)}`
            : tokenSet
            ? "Loading…"
            : "Save a token above to load account data"}
        </span>
        <button
          type="button"
          onClick={() => fetchAccount(token)}
          disabled={!tokenSet || loading}
          className="tac-btn"
          style={{
            padding: "5px 10px",
            fontSize: 12,
            opacity: !tokenSet || loading ? 0.4 : 1,
            cursor: !tokenSet || loading ? "not-allowed" : "pointer",
          }}
        >
          <ArrowsClockwise
            size={12}
            weight="regular"
            style={{
              animation: loading ? "spin 1s linear infinite" : "none",
            }}
          />
          Refresh
        </button>
      </div>

      {error && (
        <div className="tac-error-banner" style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <Warning
              size={14}
              color="var(--tac-danger)"
              style={{ marginTop: 2, flexShrink: 0 }}
            />
            <span style={{ wordBreak: "break-word" }}>{error}</span>
          </div>
        </div>
      )}

      {!error && tokenSet && loading && !user && (
        <div
          style={{
            padding: "20px",
            display: "grid",
            placeItems: "center",
            color: "var(--tac-mute)",
            fontSize: 12,
          }}
        >
          <CircleNotch
            size={16}
            weight="regular"
            color="var(--tac-accent)"
            style={{ animation: "spin 1s linear infinite" }}
          />
        </div>
      )}

      {user && (
        <div
          style={{
            background: "var(--tac-surface)",
            border: "1px solid var(--tac-border)",
            borderRadius: 10,
            overflow: "hidden",
            display: "grid",
          }}
        >
          <KV
            k="Username"
            v={
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  color: "var(--tac-accent)",
                }}
              >
                <CheckCircle size={12} weight="regular" />
                {user.username || user.profile?.name || "—"}
              </span>
            }
            accent
          />
          {user.email && <KV k="Email" v={user.email} />}
          {(user.plan?.id || user.plan) && (
            <KV
              k="Plan"
              v={(user.plan?.id || user.plan || "").toString()}
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
          k="Monthly usage"
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
          k="Compute units"
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
        <KV k="Dataset reads (this month)" v={datasetReads.toLocaleString()} />
      )}
      {proxyServiceUsage != null && (
        <KV
          k="Residential proxy"
          v={`${proxyServiceUsage.toFixed(2)} GB`}
        />
      )}
    </>
  );
}

function UsageBar({ used, limit, format }) {
  const pct = limit && limit > 0 ? Math.min(100, (used / limit) * 100) : null;
  const tone = pct == null ? "var(--tac-accent)" : pct >= 90 ? "var(--tac-danger)" : pct >= 70 ? "var(--tac-warning)" : "var(--tac-success)";
  return (
    <div style={{ display: "grid", gap: 5, minWidth: 180 }}>
      <span
        style={{
          fontSize: 13,
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
            height: 4,
            background: "var(--tac-surface2)",
            borderRadius: 2,
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
              borderRadius: 2,
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
    <div
      className="tac-card"
      style={{ padding: "18px 20px", display: "grid", gap: 12 }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span
          style={{
            fontSize: 14,
            color: "var(--tac-fg)",
            fontWeight: 600,
          }}
        >
          {label}
        </span>
        {sub && (
          <span style={{ fontSize: 12, color: "var(--tac-mute)" }}>{sub}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function TokenStatus({ dirty, hasSaved, flash, hasInput }) {
  // Communicates the relationship between the editor and persisted state at
  // a glance — no token / saved+clean / unsaved edits / flashing-after-save.
  let variant = "";
  let label = "No token saved";
  let Icon = Warning;
  if (flash) {
    variant = "ok";
    label = "Token saved";
    Icon = CheckCircle;
  } else if (dirty && hasInput) {
    variant = "warn";
    label = "Unsaved changes — click Save to persist";
    Icon = Warning;
  } else if (dirty && !hasInput && hasSaved) {
    variant = "warn";
    label = "Field cleared — click Save to remove the saved token";
    Icon = Warning;
  } else if (!dirty && hasSaved) {
    variant = "ok";
    label = "Token saved — ready for scrapes";
    Icon = CheckCircle;
  }
  return (
    <span
      className={`tac-pill${variant ? ` tac-pill--${variant}` : ""}`}
      style={{ alignSelf: "start", marginTop: 6 }}
    >
      <Icon size={12} weight="regular" />
      {label}
    </span>
  );
}

function Hint({ children }) {
  return (
    <div
      style={{
        fontSize: 12,
        color: "var(--tac-mute)",
        marginTop: 2,
        lineHeight: 1.55,
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
        padding: "12px 16px",
        display: "grid",
        gridTemplateColumns: "160px 1fr",
        gap: 12,
        alignItems: "center",
        borderBottom: "1px solid var(--tac-border)",
      }}
    >
      <span
        style={{
          fontSize: 12,
          color: "var(--tac-mute)",
        }}
      >
        {k}
      </span>
      <span
        style={{
          fontSize: 13,
          color: accent ? "var(--tac-accent)" : "var(--tac-fg)",
          fontWeight: accent ? 600 : 500,
        }}
      >
        {v ?? "—"}
      </span>
    </div>
  );
}
