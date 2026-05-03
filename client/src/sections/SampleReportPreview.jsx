import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Maximize2 } from "lucide-react";
import sampleReport from "../data/sampleReport.md?raw";
import Reveal from "../components/Reveal.jsx";
import SectionHeader from "../components/SectionHeader.jsx";

export default function SampleReportPreview({ onOpenSample }) {
  return (
    <section
      id="sample"
      className="relative max-w-6xl mx-auto px-6 py-20 md:py-28"
    >
      <SectionHeader
        eyebrow="Sample report"
        title="See what the engine actually outputs."
        lede="Below: a real-shape framework generated for a fictional creator. Same markdown, same structure, same evidence rules as the report you'll receive."
        align="center"
        className="mb-10 md:mb-14 mx-auto"
      />

      <Reveal className="relative">
        <div className="relative device-tilt">
          <div className="card p-0 overflow-hidden shadow-card-lift">
            <div className="report report-compact px-6 md:px-12 pt-10 pb-24 max-h-[640px] overflow-hidden">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {sampleReport}
              </ReactMarkdown>
            </div>
          </div>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-navy-950 via-navy-950/80 to-transparent" />

          <div className="absolute inset-x-0 bottom-8 flex justify-center">
            <button
              onClick={onOpenSample}
              className="btn-gold pointer-events-auto shadow-gold-glow"
            >
              <Maximize2 size={14} />
              Open full sample report
            </button>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
