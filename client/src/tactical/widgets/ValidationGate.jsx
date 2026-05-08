import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X, Warning, ArrowRight } from "@phosphor-icons/react";
import { useCsv, STAGE } from "../state/CsvContext.jsx";

export default function ValidationGate() {
  const { stage, validation, parsed, filename, proceed, reset } = useCsv();
  const [revealedCount, setRevealedCount] = useState(0);

  const layers = validation?.layers || [];
  const allRevealed = revealedCount >= layers.length;

  useEffect(() => {
    if (stage !== STAGE.VALIDATING) {
      setRevealedCount(0);
      return;
    }
    if (revealedCount >= layers.length) return;
    const t = setTimeout(() => setRevealedCount((c) => c + 1), 220);
    return () => clearTimeout(t);
  }, [stage, revealedCount, layers.length]);

  // Esc anywhere on the gate cancels back to the idle upload screen.
  useEffect(() => {
    if (stage !== STAGE.VALIDATING) return;
    const onKey = (e) => {
      if (e.key === "Escape") reset();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stage, reset]);

  if (stage !== STAGE.VALIDATING) return null;

  const passCount = layers.filter((l) => l.pass).length;
  const failCount = layers.length - passCount;
  const criticalFail = layers.filter((l) => l.critical && !l.pass).length;
  const totalRows = parsed?.rows?.length || 0;

  return (
    <AnimatePresence>
      <motion.div
        key="validation-gate"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 40,
          background: "rgba(10, 11, 14, 0.7)",
          backdropFilter: "blur(2px)",
          display: "grid",
          placeItems: "center",
          padding: 24,
        }}
      >
        <motion.div
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 12, opacity: 0 }}
          transition={{ type: "spring", stiffness: 220, damping: 26 }}
          style={{
            position: "relative",
            background: "var(--tac-surface)",
            border: "1px solid var(--tac-border)",
            borderRadius: 12,
            width: "100%",
            maxWidth: 520,
            overflow: "hidden",
            boxShadow: "0 24px 48px -16px rgba(0, 0, 0, 0.6)",
          }}
        >
          <header
            style={{
              padding: "20px 24px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div>
              <div
                style={{
                  fontFamily:
                    '"Inter", ui-sans-serif, system-ui, sans-serif',
                  fontSize: 17,
                  fontWeight: 600,
                  color: "var(--tac-fg)",
                  lineHeight: 1.2,
                }}
              >
                Validating dataset
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--tac-mute)",
                  marginTop: 2,
                }}
              >
                Checking which columns the framework needs.
              </div>
            </div>
            <button
              type="button"
              onClick={reset}
              aria-label="Cancel and discard upload"
              title="Cancel · discard upload (Esc)"
              className="tac-btn"
              style={{ padding: 6 }}
            >
              <X size={14} weight="regular" />
            </button>
          </header>

          <div
            style={{
              padding: "8px 24px",
              borderTop: "1px solid var(--tac-border)",
              borderBottom: "1px solid var(--tac-border)",
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
              fontSize: 12,
              color: "var(--tac-mute)",
            }}
          >
            <span
              title={filename}
              style={{
                color: "var(--tac-fg)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: 280,
              }}
            >
              {filename || "no_dataset.csv"}
            </span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              {totalRows.toLocaleString()} rows
            </span>
          </div>

          <div style={{ padding: "12px 16px" }}>
            {layers.map((layer, idx) => (
              <Layer
                key={layer.id}
                layer={layer}
                visible={idx < revealedCount}
                index={idx}
              />
            ))}
          </div>

          <footer
            style={{
              padding: "16px 24px 20px",
              borderTop: "1px solid var(--tac-border)",
              display: "grid",
              gap: 12,
            }}
          >
            <div
              style={{
                display: "flex",
                gap: 6,
                flexWrap: "wrap",
              }}
            >
              <span className="tac-pill tac-pill--ok">{passCount} pass</span>
              {failCount > 0 && (
                <span className="tac-pill tac-pill--warn">
                  {failCount} missing
                </span>
              )}
              {criticalFail > 0 && (
                <span className="tac-pill tac-pill--err">
                  {criticalFail} critical
                </span>
              )}
            </div>

            {allRevealed && criticalFail > 0 && (
              <div className="tac-error-banner">
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                  }}
                >
                  <Warning
                    size={14}
                    weight="regular"
                    color="var(--tac-danger)"
                    style={{ marginTop: 2, flexShrink: 0 }}
                  />
                  <span style={{ lineHeight: 1.5 }}>
                    {criticalFail} critical column
                    {criticalFail > 1 ? "s" : ""} missing. Affected widgets
                    will mark their values as missing, but the dashboard will
                    still load.
                  </span>
                </div>
              </div>
            )}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr",
                gap: 8,
              }}
            >
              <button
                type="button"
                onClick={reset}
                className="tac-btn"
                style={{
                  justifyContent: "center",
                  padding: "10px 14px",
                  fontSize: 13,
                }}
                title="Discard the upload and return to the dropzone (Esc)"
              >
                <X size={13} weight="regular" />
                Cancel
              </button>
              <button
                type="button"
                disabled={!allRevealed}
                onClick={proceed}
                className="tac-btn tac-btn-accent"
                style={{
                  justifyContent: "center",
                  padding: "10px 14px",
                  fontSize: 13,
                  opacity: allRevealed ? 1 : 0.5,
                  cursor: allRevealed ? "pointer" : "wait",
                }}
              >
                {allRevealed ? "Continue to dashboard" : "Scanning…"}
                {allRevealed && <ArrowRight size={13} weight="bold" />}
              </button>
            </div>
          </footer>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function Layer({ layer, visible, index }) {
  const pct = Math.round(layer.coverage * 100);
  const passColor = "var(--tac-success)";
  const warnColor = layer.critical ? "var(--tac-danger)" : "var(--tac-warning)";
  const color = layer.pass ? passColor : warnColor;
  const status = layer.pass ? "Pass" : layer.critical ? "Missing" : "Optional";
  const variant = layer.pass ? "ok" : layer.critical ? "err" : "warn";

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: visible ? 1 : 0, x: visible ? 0 : -8 }}
      transition={{
        duration: 0.18,
        delay: visible ? 0 : index * 0.08,
      }}
      style={{
        display: "grid",
        gridTemplateColumns: "16px 1fr auto auto",
        alignItems: "center",
        gap: 12,
        padding: "8px 8px",
        fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
        fontSize: 13,
      }}
    >
      {visible ? (
        layer.pass ? (
          <Check size={14} weight="bold" color={color} />
        ) : (
          <X size={14} weight="bold" color={color} />
        )
      ) : (
        <span style={{ color: "var(--tac-dim)" }}>·</span>
      )}
      <span
        style={{
          color: visible ? "var(--tac-fg)" : "var(--tac-dim)",
        }}
      >
        {layer.label}
        {layer.critical && (
          <span
            style={{
              marginLeft: 6,
              fontSize: 11,
              color: "var(--tac-mute)",
            }}
          >
            — required
          </span>
        )}
      </span>
      <span
        style={{
          color: visible ? "var(--tac-mute)" : "var(--tac-dim)",
          fontVariantNumeric: "tabular-nums",
          fontSize: 12,
        }}
      >
        {visible ? `${pct}%` : "—"}
      </span>
      <span
        className={visible ? `tac-pill tac-pill--${variant}` : "tac-pill"}
        style={{ visibility: visible ? "visible" : "hidden" }}
      >
        {visible ? status : ""}
      </span>
    </motion.div>
  );
}
