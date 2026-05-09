// chiqo.ai launcher banner.
//
// Renders an ASCII wordmark with a vertical truecolor gradient (emerald-400 →
// emerald-500 → emerald-700) using ANSI 24-bit escape sequences. Falls back
// to plain text when the terminal can't handle truecolor or when the user
// has set NO_COLOR.
//
// Self-test: `node scripts/lib/banner.js`

// Emerald palette (matches the chiqo brand spec — 400 / 500 / 700).
const STOPS = [
  { r: 0x34, g: 0xd3, b: 0x99 }, // top    — #34D399
  { r: 0x10, g: 0xb9, b: 0x81 }, // middle — #10B981
  { r: 0x04, g: 0x78, b: 0x57 }, // bottom — #047857
];

const ACCENT = STOPS[1]; // primary emerald for accents (✓ marks etc.)
const RED = { r: 0xef, g: 0x44, b: 0x44 }; // failure mark color

// Truecolor support detection. We require:
//   - stdout is a TTY (otherwise we're being piped to a file/CI logger)
//   - NO_COLOR is unset (https://no-color.org)
//   - One of the COLORTERM / TERM / TERM_PROGRAM signals indicates truecolor,
//     OR we're in a known-good shell (Windows Terminal, modern macOS Terminal,
//     iTerm, VS Code integrated terminal). Be permissive — emerald that
//     degrades to plain text is fine; the banner content is still readable.
function supportsTrueColor() {
  if (process.env.NO_COLOR) return false;
  if (!process.stdout.isTTY) return false;
  const colorterm = (process.env.COLORTERM || "").toLowerCase();
  if (colorterm === "truecolor" || colorterm === "24bit") return true;
  if (process.env.WT_SESSION) return true; // Windows Terminal
  if (process.env.TERM_PROGRAM === "vscode") return true;
  if (process.env.TERM_PROGRAM === "Apple_Terminal") return true;
  if (process.env.TERM_PROGRAM === "iTerm.app") return true;
  const term = (process.env.TERM || "").toLowerCase();
  if (term.includes("256color")) return true;
  return false;
}

// Linear-interpolate two RGB colors at t ∈ [0,1].
function lerp(a, b, t) {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

// Pick the gradient color for a row index out of `total` rows. The first half
// interpolates STOPS[0] → STOPS[1], the second half STOPS[1] → STOPS[2].
function gradientAt(row, total) {
  if (total <= 1) return STOPS[1];
  const t = row / (total - 1);
  if (t <= 0.5) return lerp(STOPS[0], STOPS[1], t / 0.5);
  return lerp(STOPS[1], STOPS[2], (t - 0.5) / 0.5);
}

function rgb(color) {
  return `\x1b[38;2;${color.r};${color.g};${color.b}m`;
}
const RESET = "\x1b[0m";
const DIM = "\x1b[2m";

// 5-row block-glyph wordmark for "chiqo.ai" — matches the layout in the spec
// example. We don't draw the punctuation as block glyphs; the dot in ".ai"
// would distort the alignment. Keep it tight, calm, readable.
const LETTERS = [
  "   ▄████  ██   ██  ██  ██████   ██████      █████  ██",
  "  ██      ██   ██  ██ ██    ██ ██    ██    ██   ██ ██",
  "  ██      ███████  ██ ██    ██ ██    ██    ███████ ██",
  "  ██      ██   ██  ██ ██ ▄▄ ██ ██    ██    ██   ██ ██",
  "   ▀████  ██   ██  ██  ██████   ██████  ██ ██   ██ ██",
];

const SUBTITLE = "by Macroview Studio · creator intelligence workspace";
const DIVIDER = "─".repeat(54);

export function printBanner({ stream = process.stdout } = {}) {
  const useColor = supportsTrueColor();
  stream.write("\n");
  for (let i = 0; i < LETTERS.length; i++) {
    const line = LETTERS[i];
    if (useColor) {
      const c = gradientAt(i, LETTERS.length);
      stream.write(`${rgb(c)}${line}${RESET}\n`);
    } else {
      stream.write(`${line}\n`);
    }
  }
  stream.write("\n");
  if (useColor) {
    stream.write(`  ${DIM}${SUBTITLE}${RESET}\n`);
    stream.write(`  ${DIM}${DIVIDER}${RESET}\n`);
  } else {
    stream.write(`  ${SUBTITLE}\n`);
    stream.write(`  ${DIVIDER}\n`);
  }
  stream.write("\n");
}

// Reusable status-line printers so launch.js stays free of ANSI literals.
const useColorMemo = supportsTrueColor();
export function ok(label) {
  if (useColorMemo) return `${rgb(ACCENT)}✓${RESET} ${label}`;
  return `[ok] ${label}`;
}
export function fail(label) {
  if (useColorMemo) return `${rgb(RED)}✗${RESET} ${label}`;
  return `[fail] ${label}`;
}
export function dim(text) {
  if (useColorMemo) return `${DIM}${text}${RESET}`;
  return text;
}
export function accent(text) {
  if (useColorMemo) return `${rgb(ACCENT)}${text}${RESET}`;
  return text;
}

// Standalone demo: `node scripts/lib/banner.js`. Compares URL → fs path
// (works on Windows + POSIX without manual slash juggling).
import { fileURLToPath } from "node:url";
import path from "node:path";
const __selfPath = fileURLToPath(import.meta.url);
const __invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (__selfPath === __invokedPath) {
  printBanner();
  console.log(`  ${ok("Node.js detected (v" + process.versions.node + ")")}`);
  console.log(`  ${ok("Dependencies ready")}`);
  console.log(`  ${ok("Client build ready")}`);
  console.log(`  ${ok("Config loaded")}`);
  console.log("");
  console.log("  Starting your local creator intelligence workspace...");
  console.log("");
  console.log(`  ${dim("Local URL")}   http://localhost:3001`);
  console.log(`  ${dim("Status")}      ${accent("running")}`);
  console.log(`  ${dim("Logs")}        .chiqo/server.log`);
  console.log("");
  console.log(`  ${dim("Close this window or press Ctrl+C to stop chiqo.ai.")}`);
  console.log("");
  console.log(`  ${dim("(self-test) gradient supported:")} ${supportsTrueColor()}`);
}
