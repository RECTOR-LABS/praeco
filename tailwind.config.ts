import type { Config } from "tailwindcss";
export default {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        lane: { research: "#58a6ff", copy: "#e3b341", image: "#c297ff", money: "#3fb950" },
      },
    },
  },
  plugins: [],
} satisfies Config;
