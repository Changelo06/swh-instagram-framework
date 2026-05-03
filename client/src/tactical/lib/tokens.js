// Tactical telemetry color tokens.
// Primary brand: #4f8dfe (signal blue). Errors stay red. Status stays green.
// Charts pull from NEON_PALETTE for distinguishability across categories.

export const TAC = {
  bg: "var(--tac-bg)",
  fg: "var(--tac-fg)",
  surface: "var(--tac-surface)",
  surface2: "var(--tac-surface2)",
  border: "var(--tac-border)",
  mute: "var(--tac-mute)",
  dim: "var(--tac-dim)",
  primary: "#4f8dfe",
  primaryHover: "#7aaeff",
  primaryDeep: "#2563eb",
  status: "#4AF626",
  error: "#ef4444",
  warn: "#fbbf24",
};

// Pulled from the supplied rainbow strip — yellow → orange → red → pink → magenta → purple → indigo → blue.
export const NEON_PALETTE = [
  "#fbbf24", // amber
  "#f97316", // orange
  "#ef4444", // red
  "#ec4899", // pink
  "#d946ef", // magenta
  "#a855f7", // purple
  "#6366f1", // indigo
  "#4f8dfe", // primary blue
];

export const neonAt = (i) => NEON_PALETTE[((i % NEON_PALETTE.length) + NEON_PALETTE.length) % NEON_PALETTE.length];
