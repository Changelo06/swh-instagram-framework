import { useEffect, useState, useCallback } from "react";
import { CheckCircle2, AlertCircle, Loader2, RefreshCw } from "lucide-react";

// API readiness indicator.
//
// As of Phase 2.7 there is no Express server to probe. Readiness is now
// purely a function of "are the right keys present in the vault." This
// hook reads `chiqo.keys.list()` and reports:
//
//   ONLINE   — Anthropic + Groq + Apify all configured in the vault
//   DEGRADED — Anthropic configured, Groq or Apify missing
//   OFFLINE  — Anthropic missing (or the bridge itself is unavailable)
//
// Re-fetches on demand via `recheck()` so SettingsDrawer can ask for a
// refresh right after a `chiqo.keys.set` / `delete`.

const STATE = {
  CHECKING: "checking",
  ONLINE: "online",
  DEGRADED: "degraded",
  OFFLINE: "offline",
};

export function useApiHealth() {
  const [state, setState] = useState(STATE.CHECKING);
  const [details, setDetails] = useState(null);
  const [error, setError] = useState(null);

  const check = useCallback(async () => {
    setState(STATE.CHECKING);
    setError(null);
    const c = typeof window !== "undefined" ? window.chiqo : null;
    if (!c?.keys?.list) {
      setError(
        "chiqo.ai bridge unavailable — open this in the chiqo.ai desktop app."
      );
      setState(STATE.OFFLINE);
      return;
    }
    try {
      const keys = await c.keys.list();
      const has = (provider) =>
        Array.isArray(keys) &&
        keys.some(
          (k) => k && String(k.provider).toLowerCase() === provider
        );
      const anthropicOk = has("anthropic");
      const groqOk = has("groq");
      const apifyOk = has("apify");
      setDetails({
        services: {
          anthropic: { configured: anthropicOk, required: true },
          groq: { configured: groqOk, required: false },
          apify: { configured: apifyOk, required: false },
        },
      });
      if (!anthropicOk) setState(STATE.OFFLINE);
      else if (!groqOk || !apifyOk) setState(STATE.DEGRADED);
      else setState(STATE.ONLINE);
    } catch (e) {
      setError(e.message);
      setState(STATE.OFFLINE);
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  return { state, details, error, recheck: check };
}

export default function ApiStatus({ health }) {
  const { state, details, error, recheck } = health;

  const conf = {
    [STATE.CHECKING]: { icon: Loader2, color: "#8892A4", label: "Checking…", spin: true },
    [STATE.ONLINE]: { icon: CheckCircle2, color: "#2ECC71", label: "All keys configured" },
    [STATE.DEGRADED]: {
      icon: AlertCircle,
      color: "#F39C12",
      label: "Anthropic OK · Groq/Apify missing",
    },
    [STATE.OFFLINE]: {
      icon: AlertCircle,
      color: "#E74C3C",
      label: "Anthropic key missing",
    },
  }[state];

  const Icon = conf.icon;
  const fmt = (svc) =>
    details?.services?.[svc]?.configured ? "configured" : "missing";
  const tooltipParts = [
    error && `Error: ${error}`,
    details && `Anthropic: ${fmt("anthropic")}`,
    details && `Groq: ${fmt("groq")}`,
    details && `Apify: ${fmt("apify")}`,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div className="flex items-center gap-1">
      <div
        title={tooltipParts}
        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px]"
        style={{
          color: conf.color,
          borderColor: `${conf.color}55`,
          backgroundColor: `${conf.color}15`,
        }}
      >
        <Icon size={12} className={conf.spin ? "animate-spin" : ""} strokeWidth={2.4} />
        <span className="font-medium">{conf.label}</span>
      </div>
      <button
        onClick={recheck}
        disabled={state === STATE.CHECKING}
        title="Re-check key status"
        className="p-1 rounded text-slate-500 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <RefreshCw size={12} className={state === STATE.CHECKING ? "animate-spin" : ""} />
      </button>
    </div>
  );
}

export const API_STATE = STATE;
