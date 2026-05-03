import { memo, useEffect, useRef, useState } from "react";
import {
  DownloadSimple,
  FileText,
  FileCsv,
  Code,
  FilePdf,
  CaretDown,
} from "@phosphor-icons/react";

const FORMATS = [
  { id: "txt", label: "TEXT", icon: FileText, sub: "raw .txt" },
  { id: "csv", label: "CSV", icon: FileCsv, sub: "tabular .csv" },
  { id: "json", label: "JSON", icon: Code, sub: "structured .json" },
  { id: "pdf", label: "PDF", icon: FilePdf, sub: "printable .pdf" },
];

function ExportMenu({
  onExport,
  disabled,
  formats = ["txt", "csv", "json", "pdf"],
  label = "EXPORT",
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
          padding: "6px 10px",
          fontSize: 10,
          opacity: disabled ? 0.4 : 1,
        }}
      >
        <DownloadSimple size={11} weight="regular" />
        {label}
        <CaretDown size={9} weight="bold" />
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 4,
            background: "var(--tac-surface2)",
            border: "1px solid var(--tac-border)",
            zIndex: 50,
            minWidth: 200,
            display: "grid",
            gap: 1,
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
                  gridTemplateColumns: "16px 1fr auto",
                  gap: 10,
                  alignItems: "center",
                  padding: "10px 12px",
                  background: "var(--tac-surface)",
                  border: "none",
                  color: "var(--tac-fg)",
                  cursor: "pointer",
                  fontFamily: '"JetBrains Mono", monospace',
                  fontSize: 11,
                  textAlign: "left",
                  letterSpacing: "0.04em",
                  transition: "background 100ms, color 100ms",
                  opacity: isBusy ? 0.5 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!isBusy) e.currentTarget.style.background = "var(--tac-bg)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "var(--tac-surface)";
                }}
              >
                <Icon size={13} weight="regular" color="#4f8dfe" />
                <div>
                  <div>{f.label}</div>
                  <div
                    style={{ fontSize: 9, color: "var(--tac-mute)", marginTop: 1 }}
                  >
                    {isBusy ? "writing..." : f.sub}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 9,
                    color: "var(--tac-dim)",
                    letterSpacing: "0.1em",
                  }}
                >
                  ←
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default memo(ExportMenu);
