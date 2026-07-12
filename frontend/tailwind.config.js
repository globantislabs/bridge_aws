/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./public/index.html"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        void: "#050505",
        surface1: "#0E0E0E",
        surface2: "#1A1A1A",
        signal: "#FF3B30",
        active: "#00E5FF",
        electric: "#FFD60A",
      },
      fontFamily: {
        heading: ['Outfit', 'sans-serif'],
        body: ['"IBM Plex Sans"', 'sans-serif'],
      },
      animation: {
        "fade-in": "fadeIn 400ms ease-out both",
        "slide-up": "slideUp 500ms ease-out both",
        "pulse-red": "pulseRed 2s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: { "0%": { opacity: 0 }, "100%": { opacity: 1 } },
        slideUp: {
          "0%": { opacity: 0, transform: "translateY(16px)" },
          "100%": { opacity: 1, transform: "translateY(0)" },
        },
        pulseRed: {
          "0%,100%": { boxShadow: "0 0 0 0 rgba(255,59,48,0.6)" },
          "50%": { boxShadow: "0 0 0 12px rgba(255,59,48,0)" },
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
