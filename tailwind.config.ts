import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bark: {
          DEFAULT: "#5b3a29",
          dark: "#3d2618",
        },
        canopy: {
          DEFAULT: "#2f7d4f",
          light: "#4caf6d",
          dark: "#1c5233",
        },
        soil: "#2b1d12",
        bloom: "#e5738a",
        fruit: "#e8a33d",
        parchment: "#f6f1e7",
      },
      fontFamily: {
        serif: ["Georgia", "Cambria", "serif"],
      },
    },
  },
  plugins: [],
};

export default config;
