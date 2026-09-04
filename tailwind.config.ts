import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-archivo)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"]
      },
      /* Colour lives in globals.css as custom properties so the whole identity
         retunes from one block. These aliases exist only so Tailwind utilities
         can reach the same tokens — never hard-code a hex in a component. */
      colors: {
        ink: "var(--ink)",
        cream: "var(--cream)",
        gold: "var(--gold)",
        orange: "var(--deep-orange)",
        rule: "var(--rule)",
        surface: "var(--surface)",
        body: "var(--text)"
      },
      borderRadius: { none: "0", sm: "3px", DEFAULT: "5px", md: "6px", lg: "8px", xl: "10px" }
    }
  },
  plugins: []
};
export default config;
