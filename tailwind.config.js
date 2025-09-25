/** @type {import('tailwindcss').Config} */


export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
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


