import { useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { X } from "lucide-react";
import sampleReport from "../data/sampleReport.md?raw";

export default function SampleReportModal({ onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-stretch md:place-items-center px-0 md:px-6 py-0 md:py-10"
      role="dialog"
      aria-modal="true"
      aria-label="Sample framework report"
    >
      <div
        className="absolute inset-0 bg-navy-950/95 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative w-full max-w-4xl card p-0 overflow-hidden flex flex-col h-full md:h-[88vh] animate-fade-rise">
        <div className="flex items-center justify-between gap-3 px-5 md:px-8 py-4 border-b border-gold-500/15 bg-navy-950/60 sticky top-0 z-10">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-[10px] uppercase tracking-[0.22em] font-semibold text-gold-500 px-2 py-1 rounded bg-gold-500/10 border border-gold-500/30">
              Live example
            </span>
            <span className="text-sm text-slate-300 truncate">
              Generated for Maya C., mindset coach
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded text-slate-400 hover:text-slate-100 hover:bg-navy-700/60 shrink-0"
            aria-label="Close sample report"
          >
            <X size={18} />
          </button>
        </div>
        <div className="report overflow-y-auto px-6 md:px-12 py-8 md:py-12 framework-scroll">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {sampleReport}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
