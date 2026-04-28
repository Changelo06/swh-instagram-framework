import { useEffect, useRef, useState } from "react";
import { Check, FileCheck2 } from "lucide-react";

const buildLayers = (scriptCount) => [
  { id: "parse", label: "Pre-analysis: Fields validated, tiers set" },
  { id: "layer1", label: "Layer 1: Performance Baseline" },
  { id: "layer2", label: "Layer 2: Keyword & Language DNA" },
  { id: "layer3", label: "Layer 3: Hook Structure Analysis" },
  { id: "layer4", label: "Layer 4: Video Structure Mapping" },
  { id: "layer5", label: "Layer 5: Emotional DNA" },
  { id: "layer6", label: "Layer 6: Topic Intelligence" },
  { id: "compile", label: "Compiling Framework Report" },
  {
    id: "scripts",
    label: (sc) => `Generating Script Blueprints (${sc} variation${sc > 1 ? "s" : ""})`,
  },
];

const TIMINGS = [200, 800, 1800, 3200, 5000, 7500, 10500, 14000, 18000];

export default function ProgressTracker({ active, scriptCount, finished }) {
  const layers = buildLayers(scriptCount).map((l) => ({
    ...l,
    label: typeof l.label === "function" ? l.label(scriptCount) : l.label,
  }));
  const [completed, setCompleted] = useState(new Set());
  const timersRef = useRef([]);

  useEffect(() => {
    if (!active) return;
    setCompleted(new Set());
    timersRef.current = TIMINGS.map((delay, idx) =>
      setTimeout(() => {
        setCompleted((prev) => {
          const next = new Set(prev);
          next.add(layers[idx].id);
          return next;
        });
      }, delay)
    );
    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => {
    if (finished) {
      timersRef.current.forEach(clearTimeout);
      setCompleted(new Set(layers.map((l) => l.id)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  const allLayersDone = completed.size === layers.length;
  // Three phases:
  //   running     — at least one layer still pending
  //   finalizing  — all layers ticked, but the API hasn't returned yet
  //   done        — API has returned, parent will reveal the report shortly
  const phase = finished ? "done" : allLayersDone ? "finalizing" : "running";

  const currentIdx = phase === "running" ? layers.findIndex((l) => !completed.has(l.id)) : -1;

  const headerColor =
    phase === "done" ? "#2ECC71" : phase === "finalizing" ? "#e6c768" : "#d4af37";
  const headerLabel =
    phase === "done"
      ? "Done"
      : phase === "finalizing"
      ? "Finalizing report…"
      : "Generating Framework…";

  return (
    <div className="card p-6">
      <div className="flex items-center gap-3 mb-5">
        <span
          className={`w-2 h-2 rounded-full ${
            phase === "done" ? "" : "animate-pulse"
          }`}
          style={{ backgroundColor: headerColor }}
        />
        <div className="font-serif text-lg" style={{ color: headerColor }}>
          {headerLabel}
        </div>
        <div className="ml-auto flex items-center gap-3 text-xs text-slate-400 font-mono">
          <span>
            {completed.size} / {layers.length}
          </span>
          <span style={{ color: headerColor }}>
            {Math.round((completed.size / layers.length) * 100)}%
          </span>
        </div>
      </div>

      <ul className="space-y-2.5">
        {layers.map((layer, i) => {
          const done = completed.has(layer.id);
          const current = !finished && i === currentIdx;
          return (
            <li key={layer.id} className="flex items-center gap-3">
              <span
                className={`w-5 h-5 rounded-full grid place-items-center shrink-0 transition-colors ${
                  done
                    ? "bg-gold-500 text-navy-950"
                    : current
                    ? "bg-transparent border-2 border-gold-500"
                    : "bg-transparent border border-navy-600"
                }`}
              >
                {done ? (
                  <Check size={12} strokeWidth={3} />
                ) : current ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-gold-500 animate-pulse" />
                ) : null}
              </span>
              <span
                className={`text-sm transition-colors ${
                  done ? "text-slate-200" : current ? "text-gold-400" : "text-slate-500"
                }`}
              >
                {layer.label}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="mt-5 h-1 bg-navy-800 rounded-full overflow-hidden border border-gold-500/15">
        <div
          className="h-full transition-all"
          style={{
            width: `${(completed.size / layers.length) * 100}%`,
            backgroundColor: phase === "done" ? "#2ECC71" : "#d4af37",
          }}
        />
      </div>

      <PhaseStatusRow phase={phase} />
    </div>
  );
}

function PhaseStatusRow({ phase }) {
  if (phase === "running") return null;

  if (phase === "finalizing") {
    return (
      <div className="mt-4 p-3 rounded-md border border-gold-500/30 bg-gold-500/5">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="text-sm font-semibold text-gold-400">Finalizing report</div>
          <div className="text-xs font-mono text-gold-400">~95%</div>
        </div>
        <p className="text-xs text-slate-300 mb-2 leading-relaxed">
          Exporting as viewable content. Hold tight — the agent is wrapping up its final pass
          and the full report is about to render.
        </p>
        <IndeterminateBar />
      </div>
    );
  }

  // done
  return (
    <div className="mt-4 p-3 rounded-md border border-emerald-500/40 bg-emerald-500/10">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <FileCheck2 size={14} className="text-emerald-400 shrink-0" />
          <div className="text-sm font-semibold text-emerald-400">Done</div>
        </div>
        <div className="text-xs font-mono text-emerald-400">100%</div>
      </div>
      <p className="text-xs text-slate-200 leading-relaxed">
        Proceeding to viewable content report…
      </p>
    </div>
  );
}

// A thin striped bar that visually streams left-to-right while we wait
// for the API to return — purely cosmetic, communicates "still working".
function IndeterminateBar() {
  return (
    <div className="h-1.5 rounded-full overflow-hidden border border-gold-500/20 bg-navy-800 relative">
      <div className="absolute inset-y-0 left-0 w-1/3 bg-gold-500/70 rounded-full progress-stream" />
    </div>
  );
}
