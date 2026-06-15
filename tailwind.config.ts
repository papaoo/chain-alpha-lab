import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0B0F14",
        panel: "#151B23",
        panel2: "#1F2937",
        line: "#2D3748",
        up: "#EF4444",
        down: "#22C55E",
        info: "#38BDF8",
        warn: "#F59E0B",
        text: "#F8FAFC",
        muted: "#94A3B8"
      }
    }
  },
  plugins: []
};

export default config;
