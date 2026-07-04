import type { Config } from "tailwindcss";
export default {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ground: "#05070c",
        panel: "#0b0f18",
        "panel-2": "#111726",
        ink: "#cdd6e4",
        muted: "#7f8ba5",
        line: "rgba(120,150,220,0.14)",
        live: "#43e08a",
        danger: "#f85149",
        lane: { research: "#58a6ff", copy: "#e3b341", image: "#c297ff", money: "#3fb950" },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        "glow-research": "0 0 16px -5px #58a6ff",
        "glow-copy": "0 0 16px -5px #e3b341",
        "glow-image": "0 0 16px -5px #c297ff",
        "glow-live": "0 0 16px -5px #43e08a",
      },
      keyframes: {
        "pulse-dot": { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.35" } },
        "meter-sweep": { "0%": { transform: "translateX(-70%)" }, "100%": { transform: "translateX(180%)" } },
        "log-in": { from: { opacity: "0", transform: "translateY(4px)" }, to: { opacity: "1", transform: "none" } },
      },
      animation: {
        "pulse-dot": "pulse-dot 1.4s ease-in-out infinite",
        "meter-sweep": "meter-sweep 2.4s ease-in-out infinite",
        "log-in": "log-in 0.28s ease-out",
      },
    },
  },
  plugins: [],
} satisfies Config;
