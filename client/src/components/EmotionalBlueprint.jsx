import { Heart, AlertCircle } from "lucide-react";
import { emotionColor, parseEmotionalArc } from "../lib/frameworkParser.js";

export default function EmotionalBlueprint({ part3Md }) {
  const data = parseEmotionalArc(part3Md);
  if (!data) return null;
  const { arc, intensity, vulnerability, avoid } = data;

  return (
    <section className="my-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-md bg-gold-500/15 text-gold-400 grid place-items-center">
          <Heart size={16} strokeWidth={2.2} />
        </div>
        <div>
          <div className="font-serif text-lg gold-text">Emotional Blueprint</div>
          <div className="text-xs text-slate-400">How top posts feel from open to close</div>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-stretch justify-between gap-2">
          {arc.map((stage, i) => (
            <EmotionNode key={stage.label} stage={stage} isLast={i === arc.length - 1} />
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4 mt-4">
        <IntensityBar intensity={intensity} />
        <VulnerabilityCard vulnerability={vulnerability} />
        <AvoidCard avoid={avoid} />
      </div>
    </section>
  );
}

function EmotionNode({ stage, isLast }) {
  const color = emotionColor(stage.emotion);
  return (
    <div className="flex items-center flex-1">
      <div
        className="flex-1 rounded-lg px-4 py-5 border text-center"
        style={{
          backgroundColor: `${color}1a`,
          borderColor: `${color}66`,
        }}
      >
        <div className="text-[10px] uppercase tracking-widest text-slate-400 mb-1">
          {stage.label}
        </div>
        <div className="font-mono text-xs font-bold" style={{ color }}>
          {stage.emotion || "—"}
        </div>
      </div>
      {!isLast && (
        <div className="px-2 text-gold-500/60 text-xl leading-none select-none">→</div>
      )}
    </div>
  );
}

function IntensityBar({ intensity }) {
  const total = (intensity?.LOW || 0) + (intensity?.MEDIUM || 0) + (intensity?.HIGH || 0);
  const has = total > 0;
  return (
    <div className="card p-4">
      <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-2">
        Intensity Distribution
      </div>
      {has ? (
        <>
          <div className="h-3 rounded-full overflow-hidden flex border border-gold-500/15">
            <Slice pct={intensity.LOW} color="#3498DB" />
            <Slice pct={intensity.MEDIUM} color="#F39C12" />
            <Slice pct={intensity.HIGH} color="#E74C3C" />
          </div>
          <div className="mt-2 grid grid-cols-3 text-[10px] text-slate-400 font-mono">
            <span>LOW {intensity.LOW}%</span>
            <span className="text-center">MED {intensity.MEDIUM}%</span>
            <span className="text-right">HIGH {intensity.HIGH}%</span>
          </div>
        </>
      ) : (
        <div className="text-xs text-slate-500">Not detected.</div>
      )}
    </div>
  );
}

function Slice({ pct, color }) {
  if (!pct) return null;
  return <div style={{ width: `${pct}%`, backgroundColor: color }} />;
}

function VulnerabilityCard({ vulnerability }) {
  return (
    <div className="card p-4">
      <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-2">
        Vulnerability
      </div>
      {vulnerability ? (
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <div className="text-slate-500">With</div>
            <div className="text-emerald-400 font-mono text-base">
              {vulnerability.withAvg?.toLocaleString() ?? "—"}
            </div>
          </div>
          <div>
            <div className="text-slate-500">Without</div>
            <div className="text-slate-300 font-mono text-base">
              {vulnerability.withoutAvg?.toLocaleString() ?? "—"}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-xs text-slate-500">No clear vulnerability lift in this dataset.</div>
      )}
    </div>
  );
}

function AvoidCard({ avoid }) {
  return (
    <div className="card p-4 border-amber-500/20">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-amber-300 font-semibold mb-2">
        <AlertCircle size={12} />
        Avoid
      </div>
      {avoid ? (
        <div className="text-sm">
          <span className="text-slate-300">Appears in bottom performers: </span>
          <span className="font-mono font-bold" style={{ color: emotionColor(avoid) }}>
            {avoid}
          </span>
        </div>
      ) : (
        <div className="text-xs text-slate-500">No emotion strongly correlates with bottom performers.</div>
      )}
    </div>
  );
}
