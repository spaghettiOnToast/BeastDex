/** @type {import('tailwindcss').Config} */

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    screens: {
      xs: "400px",
      sm: "640px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
      "2xl": "1536px",
    },
    extend: {
      fontFamily: {
        sans: ["Exo 2", "system-ui", "sans-serif"],
        display: ["Cinzel", "serif"],
        ls: ["Cinzel", "Roboto", "serif"],
      },
      colors: {
        surface: {
          DEFAULT: "#0a0a0b",
          raised: "#111113",
          overlay: "#18181b",
        },
        accent: {
          DEFAULT: "#22c55e",
          hover: "#16a34a",
        },
        gold: {
          DEFAULT: "#e2b94c",
          dim: "#b8941f",
        },
        border: {
          subtle: "rgba(255,255,255,0.06)",
          medium: "rgba(255,255,255,0.10)",
          bright: "rgba(255,255,255,0.15)",
        },
        // Legacy aliases kept for gradual migration
        lsGold: "rgb(208, 201, 141)",
        lsStone: "#2a2a2a",
        lsGreen: "#22c55e",
      },
    },
  },
  plugins: [],
};


