import { useEffect } from "react";
import {
  X,
  Settings as SettingsIcon,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
} from "lucide-react";
import ScriptStepper from "./ScriptStepper.jsx";
import { API_STATE } from "./ApiStatus.jsx";

const STATUS_CONF = {
  [API_STATE.CHECKING]: {
    icon: Loader2,
    color: "#8892A4",
    label: "Checking",
    spin: true,
  },
  [API_STATE.ONLINE]: { icon: CheckCircle2, color: "#2ECC71", label: "Connected" },
  [API_STATE.DEGRADED]: {
    icon: AlertCircle,
    color: "#F39C12",
    label: "Connected (Groq missing)",
  },
  [API_STATE.OFFLINE]: { icon: AlertCircle, color: "#E74C3C", label: "Offline" },
};

export default function SettingsDrawer({
  open,
  onClose,
  scriptCount,
  setScriptCount,
  health,
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <aside
        className="relative ml-auto w-full max-w-md h-full bg-navy-900 shadow-2xl flex flex-col"
        role="dialog"
        aria-label="Settings"
      >
        <header className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2">
            <SettingsIcon size={16} className="text-gold-400" />
            <div className="font-serif text-lg gold-text">Settings</div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-navy-700/60 transition-colors"
            aria-label="Close settings"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          <Section
            title="Generation"
            description="Tune how the agent produces script blueprints."
          >
            <ScriptStepper value={scriptCount} onChange={setScriptCount} />
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Sets the number of replicable script variations the agent writes inside Part 3.
              Applies to <span className="text-slate-300 font-medium">Run Framework Analysis (Full)</span>{" "}
              and <span className="text-slate-300 font-medium">Generate Script Variations</span>.
              Fast mode produces a single combined blueprint regardless.
            </p>
          </Section>

          <Section
            title="API status"
            description="Connection state to the analysis backend."
          >
            <ApiStatusRow health={health} />
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Anthropic is required for every generation. Groq is optional — used only to
              transcribe the top {5} most-engaged reels before analysis.
            </p>
          </Section>
        </div>

        <footer className="px-5 py-3 text-[10px] text-slate-500 tracking-wider uppercase">
          SWH · Settings · v1.2
        </footer>
      </aside>
    </div>
  );
}

function ApiStatusRow({ health }) {
  if (!health) return null;
  const { state, details, error, recheck } = health;
  const conf = STATUS_CONF[state] || STATUS_CONF[API_STATE.OFFLINE];
  const Icon = conf.icon;
  const anthropicConfigured =
    details?.services?.anthropic?.configured ?? details?.anthropicConfigured;
  const groqConfigured = details?.services?.groq?.configured ?? details?.groqConfigured;

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
            API status:
          </span>
          <span
            className="inline-flex items-center gap-1.5 text-sm font-semibold"
            style={{ color: conf.color }}
          >
            <Icon size={14} className={conf.spin ? "animate-spin" : ""} strokeWidth={2.4} />
            {conf.label}
          </span>
        </div>
        <button
          onClick={recheck}
          disabled={state === API_STATE.CHECKING}
          className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded border border-gold-500/25 text-slate-300 hover:bg-gold-500/10 hover:border-gold-500/45 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <RefreshCw
            size={11}
            className={state === API_STATE.CHECKING ? "animate-spin" : ""}
          />
          Recheck
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <ServiceRow
          name="Anthropic"
          ok={anthropicConfigured}
          model={details?.model}
          required
        />
        <ServiceRow
          name="Groq Whisper"
          ok={groqConfigured}
          model={details?.groqModel}
        />
      </div>

      {error && (
        <div className="text-[11px] text-red-300 font-mono break-all">{error}</div>
      )}
    </div>
  );
}

function ServiceRow({ name, ok, model, required }) {
  const color = ok ? "#2ECC71" : required ? "#E74C3C" : "#F39C12";
  return (
    <div
      className="flex items-center justify-between p-2 rounded border"
      style={{ borderColor: `${color}33`, backgroundColor: `${color}10` }}
    >
      <div className="min-w-0">
        <div className="text-slate-300 font-medium">{name}</div>
        {model && (
          <div className="text-slate-500 font-mono text-[10px] truncate">{model}</div>
        )}
      </div>
      <div className="text-[10px] uppercase font-bold tracking-wider" style={{ color }}>
        {ok ? "OK" : required ? "MISSING" : "OPTIONAL"}
      </div>
    </div>
  );
}

function Section({ title, description, children }) {
  return (
    <section>
      <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-semibold">
        {title}
      </div>
      {description && <p className="text-xs text-slate-500 mt-1 mb-3">{description}</p>}
      <div className="space-y-3">{children}</div>
    </section>
  );
}
