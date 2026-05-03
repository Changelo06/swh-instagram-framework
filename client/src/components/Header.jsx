import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Settings as SettingsIcon } from "lucide-react";
import { API_STATE } from "./ApiStatus.jsx";

const NAV_LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#layers", label: "The six layers" },
  { href: "#sample", label: "Sample report" },
  { href: "#faq", label: "FAQ" },
];

export default function Header({
  variant = "landing",
  onReset,
  canReset,
  onOpenSettings,
  healthState,
  onScrollToAnalyze,
}) {
  const isApp = variant === "app";
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (isApp) return;
    const onScroll = () => setScrolled(window.scrollY > 480);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isApp]);

  const dotColor =
    healthState === API_STATE.ONLINE
      ? null
      : healthState === API_STATE.DEGRADED
      ? "#F39C12"
      : healthState === API_STATE.OFFLINE
      ? "#E74C3C"
      : "#8892A4";

  if (isApp) {
    return (
      <header className="border-b border-white/[0.06] bg-black/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-3 min-w-0 group">
            <div
              className="w-9 h-9 rounded-lg grid place-items-center shrink-0 transition-transform group-hover:scale-105 font-serif font-bold text-xl text-white"
              style={{
                background:
                  "linear-gradient(135deg, #EC4899 0%, #A855F7 100%)",
                boxShadow: "0 8px 24px -8px rgba(168,85,247,0.5)",
              }}
            >
              S
            </div>
            <div className="min-w-0">
              <div className="font-serif text-lg leading-none vibe-text font-bold">
                SWH
              </div>
              <div className="text-[10px] text-slate-500 tracking-[0.2em] uppercase mt-0.5">
                Framework Dashboard
              </div>
            </div>
          </Link>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              to="/"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-slate-400 hover:text-pink-400 text-sm transition-colors"
            >
              <ArrowLeft size={14} />
              Landing
            </Link>
            {canReset && (
              <button onClick={onReset} className="btn-vibe-ghost text-sm">
                New Analysis
              </button>
            )}
            <button
              onClick={onOpenSettings}
              className="relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-white/10 text-slate-300 hover:bg-white/5 hover:border-white/20 hover:text-white text-sm transition-colors"
              aria-label="Open settings"
            >
              <SettingsIcon size={14} />
              <span className="hidden sm:inline">Settings</span>
              {dotColor && (
                <span
                  className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-black"
                  style={{ backgroundColor: dotColor }}
                  aria-hidden
                />
              )}
            </button>
          </div>
        </div>
      </header>
    );
  }

  // Landing variant — unchanged navy/gold
  return (
    <header className="border-b border-gold-500/15 bg-navy-950/80 backdrop-blur-md sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-3 min-w-0 group">
          <div className="w-9 h-9 rounded-lg bg-gold-500 text-navy-950 font-serif font-bold text-xl grid place-items-center shrink-0 transition-transform group-hover:scale-105">
            S
          </div>
          <div className="min-w-0">
            <div className="font-serif text-lg leading-none gold-text">SWH</div>
            <div className="text-[10px] text-slate-400 tracking-[0.2em] uppercase mt-0.5">
              Instagram Framework Builder
            </div>
          </div>
        </Link>

        <nav className="hidden lg:flex items-center gap-6">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-slate-300 hover:text-gold-400 transition-colors"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          {canReset && (
            <button onClick={onReset} className="btn-ghost text-sm">
              New Analysis
            </button>
          )}
          {scrolled && !canReset && (
            <button
              onClick={onScrollToAnalyze}
              className="btn-gold text-sm hidden sm:inline-flex animate-fade-in"
            >
              Decode my profile
            </button>
          )}
          <button
            onClick={onOpenSettings}
            className="relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-gold-500/25 text-slate-200 hover:bg-gold-500/10 hover:border-gold-500/45 text-sm transition-colors"
            aria-label="Open settings"
          >
            <SettingsIcon size={14} />
            <span className="hidden sm:inline">Settings</span>
            {dotColor && (
              <span
                className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-navy-950"
                style={{ backgroundColor: dotColor }}
                aria-hidden
              />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
