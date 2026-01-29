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
        ls: ["Cinzel", "Roboto", "serif"],
      },
      colors: {
        lsGold: "rgb(208, 201, 141)",
        lsStone: "#2a2a2a",
        lsGreen: "#39ff14",
      },
    },
  },
  plugins: [],
};


