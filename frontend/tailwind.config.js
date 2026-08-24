/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F6F8F7",
        ink: "#1E2A28",
        line: "#DCE3E0",
        teal: {
          DEFAULT: "#2F6E62",
          dark: "#204E45",
          light: "#E4EFEC",
        },
        coral: {
          DEFAULT: "#C4483A",
          light: "#F7E6E3",
        },
        amber: {
          DEFAULT: "#C98A2E",
          light: "#FBF0DE",
        },
      },
      fontFamily: {
        serif: ["Lora", "ui-serif", "Georgia", "serif"],
        sans: ["IBM Plex Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(30, 42, 40, 0.06), 0 1px 0 rgba(30, 42, 40, 0.04)",
      },
    },
  },
  plugins: [],
};
