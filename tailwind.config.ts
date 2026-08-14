import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: "#08111C",
          card: "#101A2B",
          line: "#1C2A40",
        },
        gold: {
          DEFAULT: "#D4AF37",
          dim: "#B8975A",
        },
      },
      fontFamily: {
        sans: ["Outfit", "system-ui", "sans-serif"],
        clock: ["Bebas Neue", "Oswald", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
