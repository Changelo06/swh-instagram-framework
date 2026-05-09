import { memo, useEffect, useRef, useState } from "react";
import {
  DownloadSimple,
  FileText,
  FileMd,
  FileCsv,
  Code,
  FilePdf,
  CaretDown,
} from "@phosphor-icons/react";

const FORMATS = [
  { id: "pdf", label: "PDF", icon: FilePdf, sub: "Printable document" },
  { id: "md", label: "Markdown", icon: FileMd, sub: "Source markdown (.md)" },
  { id: "txt", label: "Plain text", icon: FileText, sub: "Raw text (.txt)" },
  { id: "json", label: "JSON", icon: Code, sub: "Structured data (.json)" },
  { id: "csv", label: "CSV", icon: FileCsv, sub: "Tabular (.csv)" },
];

function ExportMenu({
  onExport,
  disabled,
  formats = ["pdf", "md", "txt", "json", "csv"],
  label = "Export",
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const visible = FORMATS.filter((f) => formats.includes(f.id));

  const pick = async (id) => {
    setBusy(id);
    try {
      await onExport(id);
    } catch (e) {
      console.error("export failed", e);
    } finally {
      setBusy(null);
      setOpen(false);
    }
  };

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="tac-btn"
        style={{
          padding: "6px 12px",
          fontSize: 12,
          opacity: disabled ? 0.4 : 1,
        }}
      >
        <DownloadSimple size={13} weight="regular" />
        {label}
        <CaretDown size={11} weight="bold" />
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 6,
            background: "var(--tac-surface)",
            border: "1px solid var(--tac-border)",
            borderRadius: 10,
            zIndex: 50,
            minWidth: 230,
            display: "grid",
            padding: 4,
            gap: 2,
            boxShadow: "0 16px 40px -28px rgba(0, 0, 0, 0.85)",
          }}
        >
          {visible.map((f) => {
            const Icon = f.icon;
            const isBusy = busy === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => pick(f.id)}
                disabled={isBusy}
                style={{
                  display: "grid",
                  gridTemplateColumns: "20px 1fr",
                  gap: 12,
                  alignItems: "center",
                  padding: "9px 12px",
                  background: "transparent",
                  border: "none",
                  borderRadius: 6,
                  color: "var(--tac-fg)",
                  cursor: isBusy ? "wait" : "pointer",
                  fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
                  fontSize: 13,
                  textAlign: "left",
                  letterSpacing: 0,
                  transition: "background 100ms",
                  opacity: isBusy ? 0.6 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!isBusy)
                    e.currentTarget.style.background = "var(--tac-surface2)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <Icon
                  size={15}
                  weight="regular"
                  color="var(--tac-accent)"
                />
                <div>
                  <div style={{ fontWeight: 500 }}>{f.label}</div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--tac-mute)",
                      marginTop: 1,
                    }}
                  >
                    {isBusy ? "Writing…" : f.sub}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default memo(ExportMenu);
