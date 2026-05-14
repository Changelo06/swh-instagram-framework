import { useEffect, useState, useRef } from "react";
import { CurrencyDollar, Lightning } from "@phosphor-icons/react";

// Inline token + cost preview.
//
// Calls chiqo.anthropic.countTokens(payload) and shows
// "X tokens · ~$Y". Debounced so the user can switch templates / scope
// without firing an API round-trip on every keystroke. Quietly hides
// itself if the bridge or vault is unavailable — never blocks the
// surrounding flow.

function fmtTokens(n) {
  if (!n) return "0";
  if (n < 1000) return n.toString();
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

function fmtUsd(usd) {
  if (!usd) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

export default function CostPreview({ payload, debounceMs = 400 }) {
  const [state, setState] = useState({ status: "idle" });
  const stampRef = useRef(0);

  useEffect(() => {
    if (!payload) return;
    const c = typeof window !== "undefined" ? window.chiqo : null;
    if (!c?.anthropic?.countTokens) return;
    const stamp = ++stampRef.current;
    setState({ status: "loading" });
    const t = setTimeout(async () => {
      try {
        const r = await c.anthropic.countTokens(payload);
        if (stamp !== stampRef.current) return;
        setState({ status: "ok", data: r });
      } catch (e) {
        if (stamp !== stampRef.current) return;
        setState({ status: "error", error: e.message || String(e) });
      }
    }, debounceMs);
    return () => clearTimeout(t);
  }, [payload, debounceMs]);

  if (state.status === "idle") return null;

  const data = state.data;
  const compact = (() => {
    if (state.status === "loading") return "Estimating cost…";
    if (state.status === "error") return null; // hide on error
    if (!data) return null;
    return `${fmtTokens(data.inputTokens)} input tokens · max ${fmtTokens(
      data.maxOutputTokens
    )} output · ~${fmtUsd(data.estimatedCostUsd)}`;
  })();
  if (!compact) return null;

  return (
    <div
      title={
        data
          ? `Priced at ${data.model}. Input tokens counted via the Anthropic SDK. Output is the run's max_tokens cap — actual cost is typically lower.`
          : ""
      }
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: 9999,
        background: "var(--tac-surface2)",
        border: "1px solid var(--tac-border)",
        color: "var(--tac-mute)",
        fontSize: 12,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {state.status === "loading" ? (
        <Lightning size={11} weight="regular" />
      ) : (
        <CurrencyDollar size={11} weight="regular" />
      )}
      {compact}
    </div>
  );
}
