import { useEffect, useState } from "react";
import { Warning, X } from "@phosphor-icons/react";

// Renderer-side surface for main-process crashes (Phase 5).
//
// Subscribes to chiqo.app.onCrash and shows a single non-blocking
// banner at the bottom of the window with the crash kind + message.
// The detailed stack is written to `<userData>/logs/crash.log` so the
// user can attach it to a bug report — we deliberately don't render
// the stack here (way too noisy for an end user).
//
// "Crash" here means an unhandled exception or rejection in main —
// the renderer is still alive. If main hard-crashes the OS kills the
// renderer process too and this component never gets a chance to
// render.

export default function CrashToast() {
  const [event, setEvent] = useState(null);

  useEffect(() => {
    const c = typeof window !== "undefined" ? window.chiqo : null;
    if (!c?.app?.onCrash) return;
    const unsubscribe = c.app.onCrash((evt) => setEvent(evt || null));
    return () => {
      try { unsubscribe?.(); } catch { /* renderer torn down */ }
    };
  }, []);

  if (!event) return null;

  return (
    <div
      role="alert"
      style={{
        position: "fixed",
        bottom: 16,
        right: 16,
        maxWidth: 380,
        zIndex: 9999,
        background: "var(--tac-surface2)",
        border: "1px solid #ef4444aa",
        borderRadius: 10,
        padding: "12px 14px",
        boxShadow: "0 12px 32px rgba(0, 0, 0, 0.4)",
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        gap: 10,
        alignItems: "start",
        fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <Warning size={16} color="#ef4444" weight="regular" />
      <div style={{ fontSize: 12, lineHeight: 1.4, color: "var(--tac-fg)" }}>
        <div style={{ fontWeight: 600, marginBottom: 2 }}>
          Background error
        </div>
        <div style={{ color: "var(--tac-mute)", wordBreak: "break-word" }}>
          {event.message || event.kind}
        </div>
        <div
          style={{
            color: "var(--tac-dim)",
            fontSize: 11,
            marginTop: 6,
          }}
        >
          A diagnostic was written to your userData/logs/crash.log.
        </div>
      </div>
      <button
        type="button"
        onClick={() => setEvent(null)}
        title="Dismiss"
        style={{
          background: "transparent",
          border: "none",
          color: "var(--tac-mute)",
          cursor: "pointer",
          padding: 2,
        }}
      >
        <X size={12} weight="regular" />
      </button>
    </div>
  );
}
