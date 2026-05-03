// Plain-text empty-state used by Dataset / Analyze / Scripts when no CSV is loaded.
// No frame, no decoration — just a single comment-line in monospace.
export default function EmptyHint({ note = "// upload csv on the dashboard first" }) {
  return (
    <section
      style={{
        background: "var(--tac-bg)",
        minHeight: "calc(100dvh - 44px)",
        padding: "24px 28px",
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 12,
        color: "var(--tac-mute)",
        letterSpacing: "0.04em",
      }}
    >
      {note}
    </section>
  );
}
