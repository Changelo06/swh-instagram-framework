/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // ============================================
        // TACTICAL TELEMETRY (active design system)
        // ============================================
        tac: {
          bg: "#0A0A0A", // root substrate
          fg: "#EAEAEA", // primary text
          accent: "#4f8dfe", // signal blue (primary)
          accent2: "#7aaeff", // signal blue (hover/light)
          accent3: "#2563eb", // signal blue (deep)
          error: "#ef4444", // soft warning red (error states only)
          status: "#4AF626", // terminal green (single use)
          surface: "#1A1A1A", // panel surface
          surface2: "#0D0D0D", // sidebar / inset
          border: "#2A2A2A", // structural divider
          mute: "#6B6B6B", // muted labels
          dim: "#3A3A3A", // disabled / placeholder
        },

        // ============================================
        // Legacy palettes (retained during 3a → 3b
        // transition; removed once components migrate).
        // ============================================
        ink: {
          1000: "#000000",
          950: "#04080f",
          900: "#0a0a0a",
          800: "#111111",
          700: "#1a1a1a",
          600: "#262626",
          500: "#404040",
        },
        parchment: { 100: "#f5ecd6" },
        vibe: {
          amber: "#FBBF24",
          orange: "#F97316",
          red: "#EF4444",
          rose: "#F43F5E",
          pink: "#EC4899",
          fuchsia: "#D946EF",
          purple: "#A855F7",
          violet: "#7C3AED",
          indigo: "#6366F1",
          blue: "#3B82F6",
        },
        medal: {
          gold: "#FBBF24",
          silver: "#E5E7EB",
          bronze: "#D97706",
        },
        navy: {
          950: "#060d1a",
          900: "#0a1628",
          800: "#0f1f36",
          700: "#152a47",
          600: "#1d3a60",
          500: "#274d7a",
        },
        gold: {
          200: "#f6e6a8",
          300: "#f0d98a",
          400: "#e6c768",
          500: "#d4af37",
          600: "#b8932a",
          700: "#947420",
          950: "#3a2c08",
        },
      },
      fontFamily: {
        // Tactical typography — Archivo Black for display, JetBrains Mono for everything else
        display: ['"Archivo Black"', "Impact", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
        // Legacy (landing page — being removed)
        sans: ['"Inter"', "system-ui", "sans-serif"],
        serif: ['"Playfair Display"', "Georgia", "serif"],
      },
      boxShadow: {
        // No drop shadows / glows on tactical surfaces — depth via border + bg offset.
        // Legacy:
        "gold-glow":
          "0 0 0 1px rgba(212,175,55,0.2), 0 20px 60px -20px rgba(212,175,55,0.25)",
        "card-lift": "0 30px 80px -40px rgba(0,0,0,0.6)",
      },
      backgroundImage: {
        // Tactical scanline pattern (CRT horizontal beam sweep)
        "tac-scanlines":
          "repeating-linear-gradient(0deg, rgba(255,255,255,0.04) 0px, rgba(255,255,255,0.04) 1px, transparent 1px, transparent 3px)",
        // Tactical shimmer for skeletons (animates via background-position on transform)
        "tac-shimmer":
          "linear-gradient(90deg, #1A1A1A 0%, #2A2A2A 50%, #1A1A1A 100%)",

        // Legacy gradients (landing — being removed):
        "gold-rule":
          "linear-gradient(90deg, transparent, rgba(212,175,55,0.45), transparent)",
        "hero-field":
          "radial-gradient(ellipse at top, rgba(212,175,55,0.10), transparent 60%)",
        "vibe-rainbow":
          "linear-gradient(90deg, #FBBF24 0%, #F97316 12%, #EF4444 24%, #F43F5E 36%, #EC4899 48%, #D946EF 60%, #A855F7 72%, #7C3AED 84%, #6366F1 92%, #3B82F6 100%)",
        "vibe-magenta":
          "linear-gradient(135deg, #EC4899 0%, #A855F7 100%)",
        "vibe-sunset":
          "linear-gradient(135deg, #FBBF24 0%, #F97316 50%, #EF4444 100%)",
        "vibe-ocean":
          "linear-gradient(135deg, #6366F1 0%, #3B82F6 100%)",
        "vibe-iris":
          "linear-gradient(135deg, #A855F7 0%, #6366F1 100%)",
        "dash-glow":
          "radial-gradient(ellipse at top, rgba(168,85,247,0.10), transparent 55%), radial-gradient(ellipse at bottom right, rgba(236,72,153,0.06), transparent 50%)",
      },
      keyframes: {
        "fade-rise": {
          "0%": { opacity: 0, transform: "translateY(12px)" },
          "100%": { opacity: 1, transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: 0 },
          "100%": { opacity: 1 },
        },
        "gold-shimmer": {
          "0%,100%": { backgroundPosition: "-200% 0" },
          "50%": { backgroundPosition: "200% 0" },
        },
        // Tactical: pulsing status dot
        "tac-pulse": {
          "0%,100%": { opacity: 1 },
          "50%": { opacity: 0.3 },
        },
        // Tactical: skeleton shimmer (background-position only — never width/left)
        "tac-shimmer": {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
        // Tactical: scanline drift (subtle vertical movement)
        "tac-scan": {
          "0%": { transform: "translateY(0)" },
          "100%": { transform: "translateY(3px)" },
        },
        // Tactical: blinking cursor
        "tac-blink": {
          "0%,49%": { opacity: 1 },
          "50%,100%": { opacity: 0 },
        },
        // Tactical: marquee (seamless x-loop for sparkline carousels)
        "tac-marquee": {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
      animation: {
        "fade-rise": "fade-rise 600ms ease-out both",
        "fade-in": "fade-in 600ms ease-out both",
        "gold-shimmer": "gold-shimmer 5s ease-in-out infinite",
        "tac-pulse": "tac-pulse 1.6s ease-in-out infinite",
        "tac-shimmer": "tac-shimmer 1.6s ease-in-out infinite",
        "tac-scan": "tac-scan 200ms steps(2) infinite",
        "tac-blink": "tac-blink 1s steps(2) infinite",
        "tac-marquee": "tac-marquee 32s linear infinite",
      },
    },
  },
  plugins: [],
};
