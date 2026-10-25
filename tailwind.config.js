/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#0d1117",
          1: "#161b22",
          2: "#21262d",
          3: "#30363d",
        },
        bid: { DEFAULT: "#3fb950", dim: "rgba(63,185,80,0.15)" },
        ask: { DEFAULT: "#f85149", dim: "rgba(248,81,73,0.15)" },
        accent: "#58a6ff",
      },
      fontFamily: {
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
