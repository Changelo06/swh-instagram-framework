import { useEffect, useState, useCallback } from "react";
import { CheckCircle2, AlertCircle, Loader2, RefreshCw } from "lucide-react";

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
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      if (!res.ok) throw new Error(`Health check failed (HTTP ${res.status})`);
      const data = await res.json();
      setDetails(data);
      // Anthropic moved into the vault in Phase 2.6 — the server no longer
      // reports it. When the field is absent, treat Anthropic as managed
      // elsewhere (Settings → API keys). Legacy server builds still return
      // it; honour their reading.
      const anthropicField =
        data.services?.anthropic?.configured ?? data.anthropicConfigured;
      const anthropicOk = anthropicField === undefined ? true : anthropicField;
      const groqOk =
        data.services?.groq?.configured ?? data.groqConfigured;
      const apifyOk =
        data.services?.apify?.configured ?? data.apifyConfigured;
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
    [STATE.ONLINE]: { icon: CheckCircle2, color: "#2ECC71", label: "All APIs online" },
    [STATE.DEGRADED]: { icon: AlertCircle, color: "#F39C12", label: "Anthropic OK · Groq missing" },
    [STATE.OFFLINE]: { icon: AlertCircle, color: "#E74C3C", label: "API offline" },
  }[state];

  const Icon = conf.icon;
  const tooltipParts = [
    error && `Error: ${error}`,
    details?.model && `Claude model: ${details.model}`,
    details?.groqModel && `Groq model: ${details.groqModel}`,
    details && (() => {
      const f = details.services?.anthropic?.configured ?? details.anthropicConfigured;
      return f === undefined
        ? "Anthropic: managed in vault (Settings → API keys)"
        : `Anthropic: ${f ? "configured" : "missing"}`;
    })(),
    details && `Groq: ${(details.services?.groq?.configured ?? details.groqConfigured) ? "configured" : "missing"}`,
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
        title="Re-check API status"
        className="p-1 rounded text-slate-500 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <RefreshCw size={12} className={state === STATE.CHECKING ? "animate-spin" : ""} />
      </button>
    </div>
  );
}

export const API_STATE = STATE;
