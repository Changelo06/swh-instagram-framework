import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X as XIcon,
  Warning,
  ArrowCounterClockwise,
} from "@phosphor-icons/react";
import { useCsv } from "../state/CsvContext.jsx";
import ExportMenu from "./ExportMenu.jsx";
import {
  exportAnalysis,
  exportVariation,
  exportDataset,
} from "../lib/exporters.js";

export default function ResetConfirmModal({ open, onClose, onConfirm }) {
  const {
    rows,
    filename,
    selectedCreator,
    analyses,
    variations,
  } = useCsv();

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const baseName = `${(filename || "swh-export").replace(/\.csv$/i, "")}${
    selectedCreator?.handle ? `-${selectedCreator.handle}` : ""
  }`;

  const hasUnsaved =
    analyses.length > 0 || variations.length > 0 || rows.length > 0;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="bd"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            onClick={onClose}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(10,10,10,0.78)",
              zIndex: 50,
            }}
          />
          <motion.div
            key="mod"
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 8, opacity: 0 }}
            transition={{ type: "spring", stiffness: 240, damping: 26 }}
            role="dialog"
            aria-label="Confirm reset"
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 51,
              display: "grid",
              placeItems: "center",
              padding: 24,
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                pointerEvents: "auto",
                background: "var(--tac-surface2)",
                border: "1px solid var(--tac-border)",
                borderTop: "3px solid #ef4444",
                width: "min(560px, 100%)",
                fontFamily: '"JetBrains Mono", monospace',
                display: "grid",
                gridTemplateRows: "auto 1fr auto",
              }}
            >
              <header
                style={{
                  padding: "16px 20px",
                  borderBottom: "1px solid var(--tac-border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <Warning size={18} weight="regular" color="#ef4444" />
                  <div>
                    <div className="tac-label" style={{ color: "#ef4444" }}>
                      DESTRUCTIVE OPERATION
                    </div>
                    <div
                      className="tac-display"
                      style={{
                        fontSize: 18,
                        color: "var(--tac-fg)",
                        marginTop: 4,
                      }}
                    >
                      RESET PIPELINE
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Cancel"
                  style={{
                    background: "transparent",
                    border: "1px solid var(--tac-border)",
                    color: "var(--tac-mute)",
                    padding: 6,
                    cursor: "pointer",
                    transition: "color 120ms, border-color 120ms",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "var(--tac-fg)";
                    e.currentTarget.style.borderColor = "#4f8dfe";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "var(--tac-mute)";
                    e.currentTarget.style.borderColor = "var(--tac-border)";
                  }}
                >
                  <XIcon size={13} weight="regular" />
                </button>
              </header>

              <div
                style={{
                  padding: "16px 20px",
                  display: "grid",
                  gap: 14,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--tac-fg)",
                    lineHeight: 1.6,
                  }}
                >
                  Continuing will erase the loaded dataset and every in-memory
                  analysis run + script variation page. This cannot be undone.
                  <br />
                  <span style={{ color: "var(--tac-mute)" }}>
                    // export anything you want to keep before resetting.
                  </span>
                </div>

                <div style={{ display: "grid", gap: 1, background: "var(--tac-border)" }}>
                  <Counter
                    label="DATASET ROWS"
                    value={rows.length}
                    sub={filename}
                  />
                  <Counter
                    label="ANALYSIS RUNS"
                    value={analyses.length}
                    sub={
                      analyses.length
                        ? `${analyses.filter((a) => a.status === "done").length} done · ${
                            analyses.filter((a) => a.status === "running").length
                          } running`
                        : "—"
                    }
                  />
                  <Counter
                    label="SCRIPT PAGES"
                    value={variations.length}
                    sub={
                      variations.length
                        ? `${variations.filter((v) => v.status === "done").length} done · ${
                            variations.filter((v) => v.status === "running").length
                          } running`
                        : "—"
                    }
                  />
                </div>

                {hasUnsaved && (
                  <div
                    style={{
                      padding: "10px 14px",
                      background: "var(--tac-bg)",
                      border: "1px solid var(--tac-border)",
                      borderLeft: "3px solid #fbbf24",
                      fontSize: 11,
                      color: "var(--tac-fg)",
                      lineHeight: 1.6,
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      gap: 12,
                      alignItems: "center",
                    }}
                  >
                    <span>
                      <span style={{ color: "#fbbf24" }}>// recommendation: </span>
                      export the dataset + any pages you care about first.
                    </span>
                    <ExportBundle
                      analyses={analyses}
                      variations={variations}
                      rows={rows}
                      baseName={baseName}
                    />
                  </div>
                )}
              </div>

              <footer
                style={{
                  padding: "12px 20px",
                  borderTop: "1px solid var(--tac-border)",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    fontSize: 9,
                    color: "var(--tac-mute)",
                    letterSpacing: "0.1em",
                  }}
                >
                  // ESC to cancel
                </span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={onClose}
                    className="tac-btn"
                    style={{ padding: "8px 14px", fontSize: 11 }}
                  >
                    CANCEL
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onConfirm?.();
                      onClose();
                    }}
                    style={{
                      background: "#ef4444",
                      border: "1px solid #ef4444",
                      color: "var(--tac-bg)",
                      fontFamily: '"JetBrains Mono", monospace',
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      padding: "8px 16px",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      transition: "background 120ms, border-color 120ms",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "#f87171";
                      e.currentTarget.style.borderColor = "#f87171";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "#ef4444";
                      e.currentTarget.style.borderColor = "#ef4444";
                    }}
                  >
                    <ArrowCounterClockwise size={12} weight="regular" />
                    DESTROY ANYWAY
                  </button>
                </div>
              </footer>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function Counter({ label, value, sub }) {
  return (
    <div
      style={{
        background: "var(--tac-surface)",
        padding: "10px 14px",
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        alignItems: "center",
        gap: 12,
      }}
    >
      <span
        style={{
          fontSize: 9,
          color: "var(--tac-mute)",
          letterSpacing: "0.1em",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 10,
          color: "var(--tac-dim)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
        title={sub}
      >
        {sub}
      </span>
      <span
        className="tac-display"
        style={{
          fontSize: 14,
          color: value ? "#4f8dfe" : "var(--tac-dim)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value.toLocaleString()}
      </span>
    </div>
  );
}

function ExportBundle({ analyses, variations, rows, baseName }) {
  // Bundle export: pick a format and download dataset + all pages.
  const onExport = async (fmt) => {
    if (rows.length) {
      try {
        await exportDataset(fmt, rows, baseName);
      } catch (e) {
        console.error("dataset export failed", e);
      }
    }
    for (const a of analyses) {
      if (!a.text) continue;
      try {
        await exportAnalysis(fmt, a, baseName);
      } catch (e) {
        console.error("analysis export failed", e);
      }
    }
    for (const v of variations) {
      if (!v.text) continue;
      try {
        await exportVariation(fmt, v, baseName);
      } catch (e) {
        console.error("variation export failed", e);
      }
    }
  };

  return <ExportMenu label="EXPORT ALL" onExport={onExport} />;
}
