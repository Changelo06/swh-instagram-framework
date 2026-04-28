import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  BarChart2,
  Lightbulb,
  FileText,
  Download,
  Package,
  Copy,
  Check,
  ChevronDown,
} from "lucide-react";
import HookIntelligence from "./HookIntelligence.jsx";
import ReelStructureBlueprint from "./ReelStructureBlueprint.jsx";
import EmotionalBlueprint from "./EmotionalBlueprint.jsx";
import {
  downloadFrameworkZip,
  downloadMarkdown,
  downloadMarkdownPdf,
  downloadText,
  frameworkPartFilename,
} from "../lib/exporters.js";

const PARTS = [
  {
    id: "part1",
    label: "Data Analysis",
    icon: BarChart2,
    subtitle: "Data-Driven Performance Intelligence",
    accentColor: "#3498DB",
    fileLabel: "Part1_DataAnalysis",
  },
  {
    id: "part2",
    label: "Content Strategy",
    icon: Lightbulb,
    subtitle: "What Works, Why It Works, How to Replicate It",
    accentColor: "#C9A84C",
    fileLabel: "Part2_ContentStrategy",
  },
  {
    id: "part3",
    label: "Script Blueprints",
    icon: FileText,
    subtitle: "Replicable Frameworks From Your Best Content",
    accentColor: "#2ECC71",
    fileLabel: "Part3_Scripts",
  },
];

export default function FrameworkTabs({ framework, handle, streaming, initialPart }) {
  const [active, setActive] = useState(initialPart || "part1");
  const activePart = PARTS.find((p) => p.id === active);
  const activeMd = framework?.[active] || "";
  const hasContent = (id) => !!framework?.[id]?.trim();

  // Live tab during streaming = the latest non-empty part. Earlier parts are
  // already complete; the current writing target is the deepest one with
  // content.
  let liveId = null;
  if (streaming) {
    for (const p of PARTS) {
      if (hasContent(p.id)) liveId = p.id;
    }
  }

  return (
    <div className="card p-0 overflow-hidden">
      <ExportBar framework={framework} handle={handle} activePart={activePart} activeMd={activeMd} />

      <div className="flex border-b border-gold-500/15 bg-navy-950/50">
        {PARTS.map((p) => (
          <TabButton
            key={p.id}
            part={p}
            active={p.id === active}
            disabled={!hasContent(p.id)}
            live={p.id === liveId}
            onClick={() => setActive(p.id)}
          />
        ))}
      </div>

      <div
        className="px-6 md:px-10 py-8 max-h-[calc(100vh-200px)] overflow-y-auto"
        key={active}
      >
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <activePart.icon size={20} style={{ color: activePart.accentColor }} />
            <div>
              <div className="font-serif text-2xl gold-text">{activePart.label}</div>
              <div className="text-xs text-slate-400 tracking-wider uppercase mt-0.5">
                {activePart.subtitle}
              </div>
            </div>
          </div>
        </div>

        {active === "part2" && <HookIntelligence part2Md={activeMd} />}

        {active === "part3" && (
          <>
            <ReelStructureBlueprint part3Md={activeMd} />
            <EmotionalBlueprint part3Md={activeMd} />
          </>
        )}

        {activeMd ? (
          <div className="report">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{activeMd}</ReactMarkdown>
          </div>
        ) : (
          <div className="text-slate-500 text-sm py-8 text-center">No content for this part.</div>
        )}
      </div>
    </div>
  );
}

function TabButton({ part, active, disabled, onClick, live }) {
  const Icon = part.icon;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative flex-1 px-4 py-4 text-sm border-b-2 transition-all flex items-center justify-center gap-2 ${
        active
          ? "border-gold-500 text-gold-400 bg-navy-900/40"
          : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-navy-900/20"
      } disabled:opacity-30 disabled:cursor-not-allowed`}
      style={active ? { color: "#d4af37" } : undefined}
    >
      <Icon size={16} className={active ? "text-gold-400" : ""} />
      <span className="font-medium">{part.label}</span>
      {live && (
        <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-widest font-bold text-gold-400 px-1 py-0.5 rounded bg-gold-500/15 border border-gold-500/30">
          <span className="w-1 h-1 rounded-full bg-gold-400 animate-pulse" />
          LIVE
        </span>
      )}
    </button>
  );
}

function ExportBar({ framework, handle, activePart, activeMd }) {
  const [zipping, setZipping] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pdfBusyKey, setPdfBusyKey] = useState(null);
  const [openMenu, setOpenMenu] = useState(null);

  const exportPart = async (partId, fileLabel, format) => {
    const md = framework?.[partId];
    if (!md) return;
    if (format === "md") {
      downloadMarkdown(md, frameworkPartFilename(handle, fileLabel, "md"));
    } else if (format === "txt") {
      downloadText(md, frameworkPartFilename(handle, fileLabel, "txt"));
    } else if (format === "pdf") {
      setPdfBusyKey(partId);
      try {
        await downloadMarkdownPdf(md, frameworkPartFilename(handle, fileLabel, "pdf"));
      } catch (e) {
        // downloadMarkdownPdf already alerts/logs on its own, but make sure
        // the spinner clears even if it throws unexpectedly.
        console.error("[FrameworkTabs] PDF export failed", e);
      } finally {
        setPdfBusyKey(null);
      }
    }
    setOpenMenu(null);
  };

  const exportAll = async () => {
    if (!framework) return;
    setZipping(true);
    try {
      await downloadFrameworkZip(framework, handle);
    } finally {
      setZipping(false);
    }
  };

  const copyActive = async () => {
    if (!activeMd) return;
    try {
      await navigator.clipboard.writeText(activeMd);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-gold-500/15 bg-navy-900/40">
      <span className="inline-flex items-center gap-2 text-xs text-slate-400 uppercase tracking-wider font-semibold mr-2">
        <Download size={14} />
        Export
      </span>

      {PARTS.map((p) => {
        const has = !!framework?.[p.id];
        const open = openMenu === p.id;
        const busy = pdfBusyKey === p.id;
        return (
          <div key={p.id} className="relative">
            <button
              disabled={!has || busy}
              onClick={() => setOpenMenu(open ? null : p.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-gold-500/25 text-slate-200 hover:bg-gold-500/10 hover:border-gold-500/45 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <p.icon size={12} />
              {p.label.split(" ")[0]}
              <ChevronDown size={11} className={open ? "rotate-180 transition-transform" : "transition-transform"} />
            </button>
            {open && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setOpenMenu(null)} />
                <div className="absolute left-0 mt-1 w-36 card p-1 z-20 shadow-2xl">
                  {[
                    { fmt: "md", label: ".md", note: "Markdown" },
                    { fmt: "txt", label: ".txt", note: "Plain text" },
                    { fmt: "pdf", label: ".pdf", note: busy ? "Rendering…" : "Printable" },
                  ].map((opt) => (
                    <button
                      key={opt.fmt}
                      disabled={busy}
                      onClick={() => exportPart(p.id, p.fileLabel, opt.fmt)}
                      className="w-full text-left px-2.5 py-2 rounded text-xs hover:bg-navy-700/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-between"
                    >
                      <span className="text-gold-400 font-mono">{opt.label}</span>
                      <span className="text-slate-500">{opt.note}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        );
      })}

      <button
        disabled={!framework || zipping}
        onClick={exportAll}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-gold-500 text-navy-950 font-semibold hover:bg-gold-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <Package size={12} />
        {zipping ? "Zipping…" : "Export All (ZIP)"}
      </button>

      <button
        disabled={!activeMd}
        onClick={copyActive}
        className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-gold-500/25 text-slate-300 hover:bg-gold-500/10 hover:border-gold-500/45 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
        {copied ? "Copied" : `Copy ${activePart?.label.split(" ")[0] || ""}`}
      </button>
    </div>
  );
}
