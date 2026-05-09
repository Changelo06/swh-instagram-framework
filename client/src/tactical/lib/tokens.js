// Tactical telemetry color tokens.
// Primary brand: #21d07a (green). Charts pull from NEON_PALETTE for
// distinguishability across categories.

export const TAC = {
  bg: "var(--tac-bg)",
  fg: "var(--tac-fg)",
  surface: "var(--tac-surface)",
  surface2: "var(--tac-surface2)",
  surfaceInner: "var(--tac-surface-inner)",
  border: "var(--tac-border)",
  borderStrong: "var(--tac-border-strong)",
  mute: "var(--tac-mute)",
  dim: "var(--tac-dim)",
  primary: "#21d07a",
  primaryHover: "#3fe28e",
  status: "#21d07a",
  cyan: "#2ed3ff",
  yellow: "#f5b82e",
  pink: "#f03b9f",
  purple: "#7c5cff",
  warn: "#f5b82e",
  error: "#f0445e",
};

// Premium analytics palette — green/cyan primary, then yellow/pink/purple
// for secondary categories. Reserved for chart legends and category swatches.
export const NEON_PALETTE = [
  "#21d07a", // green (primary)
  "#2ed3ff", // cyan
  "#f5b82e", // yellow
  "#f03b9f", // pink
  "#7c5cff", // purple
  "#f0445e", // red
];

export const neonAt = (i) =>
  NEON_PALETTE[
    ((i % NEON_PALETTE.length) + NEON_PALETTE.length) % NEON_PALETTE.length
  ];
