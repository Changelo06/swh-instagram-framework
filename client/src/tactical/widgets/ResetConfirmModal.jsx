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

  const baseName = `${(filename || "chiqo-export").replace(/\.csv$/i, "")}${
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
                background: "var(--tac-surface)",
                border: "1px solid var(--tac-border)",
                borderRadius: 12,
                width: "min(560px, 100%)",
                fontFamily:
                  '"Inter", ui-sans-serif, system-ui, sans-serif',
                display: "grid",
                gridTemplateRows: "auto 1fr auto",
                boxShadow:
                  "0 24px 60px -20px rgba(0, 0, 0, 0.6)",
                overflow: "hidden",
              }}
            >
              <header
                style={{
                  padding: "18px 22px",
                  borderBottom: "1px solid var(--tac-border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 999,
                      display: "grid",
                      placeItems: "center",
                      background: "rgba(240, 68, 94, 0.12)",
                      color: "var(--tac-danger)",
                      flexShrink: 0,
                    }}
                  >
                    <Warning size={16} weight="regular" />
                  </span>
                  <div>
                    <div
                      style={{
                        fontSize: 16,
                        fontWeight: 600,
                        color: "var(--tac-fg)",
                        lineHeight: 1.25,
                      }}
                    >
                      Reset pipeline
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--tac-mute)",
                        marginTop: 2,
                      }}
                    >
                      This action can't be undone
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Cancel"
                  className="tac-btn"
                  style={{ padding: 6 }}
                >
                  <XIcon size={13} weight="regular" />
                </button>
              </header>

              <div
                style={{
                  padding: "18px 22px",
                  display: "grid",
                  gap: 14,
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: 13,
                    color: "var(--tac-fg)",
                    lineHeight: 1.6,
                  }}
                >
                  Continuing will erase the loaded dataset along with every
                  in-memory analysis run and script variation. Export anything
                  you want to keep first.
                </p>

                <div
                  style={{
                    background: "var(--tac-surface2)",
                    border: "1px solid var(--tac-border)",
                    borderRadius: 10,
                    overflow: "hidden",
                  }}
                >
                  <Counter
                    label="Dataset rows"
                    value={rows.length}
                    sub={filename}
                  />
                  <Counter
                    label="Analysis runs"
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
                    label="Script pages"
                    value={variations.length}
                    sub={
                      variations.length
                        ? `${variations.filter((v) => v.status === "done").length} done · ${
                            variations.filter((v) => v.status === "running").length
                          } running`
                        : "—"
                    }
                    last
                  />
                </div>

                {hasUnsaved && (
                  <div
                    style={{
                      padding: "12px 14px",
                      background: "rgba(245, 184, 46, 0.08)",
                      border: "1px solid rgba(245, 184, 46, 0.25)",
                      borderRadius: 10,
                      fontSize: 13,
                      color: "var(--tac-fg)",
                      lineHeight: 1.55,
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      gap: 12,
                      alignItems: "center",
                    }}
                  >
                    <span>
                      <span style={{ color: "var(--tac-warning)", fontWeight: 500 }}>
                        Tip ·{" "}
                      </span>
                      Export the dataset and any pages you care about first.
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
                  padding: "14px 22px",
                  borderTop: "1px solid var(--tac-border)",
                  background: "var(--tac-surface2)",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: 12, color: "var(--tac-mute)" }}>
                  Press Esc to cancel
                </span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={onClose}
                    className="tac-btn"
                    style={{ padding: "8px 14px", fontSize: 13 }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onConfirm?.();
                      onClose();
                    }}
                    className="tac-btn tac-btn-danger"
                    style={{ padding: "8px 16px", fontSize: 13 }}
                  >
                    <ArrowCounterClockwise size={12} weight="regular" />
                    Reset anyway
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

function Counter({ label, value, sub, last }) {
  return (
    <div
      style={{
        padding: "12px 16px",
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        alignItems: "center",
        gap: 12,
        borderBottom: last ? "none" : "1px solid var(--tac-border)",
      }}
    >
      <span
        style={{
          fontSize: 13,
          color: "var(--tac-fg)",
          fontWeight: 500,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 12,
          color: "var(--tac-mute)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
        title={sub}
      >
        {sub}
      </span>
      <span
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: value ? "var(--tac-fg)" : "var(--tac-dim)",
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

  return <ExportMenu label="Export all" onExport={onExport} />;
}
