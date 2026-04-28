/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          950: "#060d1a",
          900: "#0a1628",
          800: "#0f1f36",
          700: "#152a47",
          600: "#1d3a60",
          500: "#274d7a",
        },
        gold: {
          300: "#f0d98a",
          400: "#e6c768",
          500: "#d4af37",
          600: "#b8932a",
          700: "#947420",
        },
      },
      fontFamily: {
        sans: ['"Inter"', "system-ui", "sans-serif"],
        serif: ['"Playfair Display"', "Georgia", "serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
