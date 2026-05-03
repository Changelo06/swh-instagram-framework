import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X, Warning, ArrowRight, Crosshair } from "@phosphor-icons/react";
import { useCsv, STAGE } from "../state/CsvContext.jsx";

export default function ValidationGate() {
  const { stage, validation, parsed, filename, proceed } = useCsv();
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
          background: "rgba(10, 10, 10, 0.85)",
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
          className="tac-frame"
          style={{
            position: "relative",
            background: "var(--tac-surface2)",
            border: "1px dashed var(--tac-border)",
            padding: 0,
            width: "100%",
            maxWidth: 520,
          }}
        >
          <span className="tac-frame-corner-bl" />
          <span className="tac-frame-corner-br" />

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
            <div>
              <div className="tac-label">VALIDATION GATE</div>
              <div
                className="tac-display"
                style={{ fontSize: 18, color: "var(--tac-fg)", marginTop: 4 }}
              >
                EXAMINING SCHEMA
              </div>
            </div>
            <Crosshair size={18} weight="regular" color="#4f8dfe" />
          </header>

          <div
            style={{
              padding: "10px 20px",
              borderBottom: "1px solid var(--tac-border)",
              display: "flex",
              justifyContent: "space-between",
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 10,
              color: "var(--tac-mute)",
              letterSpacing: "0.06em",
            }}
          >
            <span style={{ color: "var(--tac-fg)" }} title={filename}>
              {filename || "no_dataset.csv"}
            </span>
            <span>{totalRows.toLocaleString()} ROWS</span>
          </div>

          <div style={{ padding: "12px 8px" }}>
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
              padding: "14px 20px",
              borderTop: "1px solid var(--tac-border)",
              display: "grid",
              gap: 10,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: 10,
                letterSpacing: "0.08em",
              }}
            >
              <span style={{ color: "#4AF626" }}>{passCount} PASS</span>
              <span
                style={{
                  color: failCount === 0 ? "var(--tac-mute)" : "#ef4444",
                }}
              >
                {failCount} MISS
              </span>
              <span
                style={{
                  color: criticalFail ? "#ef4444" : "var(--tac-mute)",
                }}
              >
                {criticalFail} CRITICAL
              </span>
            </div>

            {allRevealed && criticalFail > 0 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "10px 12px",
                  background: "#1f1212",
                  border: "1px solid var(--tac-border)",
                  borderLeft: "3px solid #ef4444",
                  fontFamily: '"JetBrains Mono", monospace',
                  fontSize: 11,
                  color: "var(--tac-fg)",
                  lineHeight: 1.5,
                }}
              >
                <Warning size={13} weight="regular" color="#ef4444" style={{ marginTop: 1, flexShrink: 0 }} />
                <span>
                  {criticalFail} critical column{criticalFail > 1 ? "s" : ""} missing.
                  Affected widgets will mark as MISSING but the dashboard will still load.
                </span>
              </div>
            )}

            <button
              type="button"
              disabled={!allRevealed}
              onClick={proceed}
              className="tac-btn tac-btn-accent"
              style={{
                justifyContent: "center",
                padding: "10px 14px",
                opacity: allRevealed ? 1 : 0.4,
                cursor: allRevealed ? "pointer" : "wait",
                fontWeight: 600,
              }}
            >
              {allRevealed ? "PROCEED → DASHBOARD" : "SCANNING..."}
              {allRevealed && <ArrowRight size={12} weight="bold" />}
            </button>
          </footer>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function Layer({ layer, visible, index }) {
  const pct = Math.round(layer.coverage * 100);
  const color =
    layer.pass && pct === 100
      ? "#4AF626"
      : layer.pass
      ? "var(--tac-fg)"
      : layer.critical
      ? "#ef4444"
      : "#fbbf24";

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
        padding: "8px 12px",
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 11,
        borderLeft: `2px solid ${visible ? color : "transparent"}`,
        transition: "border-color 120ms",
      }}
    >
      {visible ? (
        layer.pass ? (
          <Check size={12} weight="bold" color={color} />
        ) : (
          <X size={12} weight="bold" color={color} />
        )
      ) : (
        <span style={{ color: "var(--tac-dim)" }}>·</span>
      )}
      <span style={{ color: visible ? "var(--tac-fg)" : "var(--tac-dim)" }}>
        {layer.label}
      </span>
      <span
        style={{
          color: visible ? "var(--tac-mute)" : "var(--tac-dim)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {visible ? `${pct}%` : "—"}
      </span>
      <span
        style={{
          fontSize: 9,
          color: visible ? color : "var(--tac-dim)",
          letterSpacing: "0.1em",
          minWidth: 38,
          textAlign: "right",
        }}
      >
        {visible ? (layer.pass ? "PASS" : layer.critical ? "FAIL" : "WARN") : ""}
      </span>
    </motion.div>
  );
}
