/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                brand: {
                    50: "#f0f4ff",
                    100: "#dbe4ff",
                    200: "#bac8ff",
                    300: "#91a7ff",
                    400: "#748ffc",
                    500: "#5c7cfa",
                    600: "#4c6ef5",
                    700: "#4263eb",
                    800: "#3b5bdb",
                    900: "#364fc7",
                    950: "#1e3a8a",
                },
                surface: {
                    0: "#09090b",
                    1: "#111113",
                    2: "#18181b",
                    3: "#1f1f23",
                    4: "#27272a",
                },
                accent: {
                    green: "#10b981",
                    amber: "#f59e0b",
                    red: "#ef4444",
                    purple: "#a855f7",
                },
            },
            fontFamily: {
                sans: ["Inter", "system-ui", "sans-serif"],
                mono: ["JetBrains Mono", "monospace"],
            },
            backgroundImage: {
                "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
                "hero-glow":
                    "radial-gradient(ellipse at 50% 0%, rgba(92,124,250,0.15) 0%, transparent 60%)",
            },
            animation: {
                "fade-in": "fadeIn 0.5s ease-out",
                "slide-up": "slideUp 0.5s ease-out",
                "pulse-glow": "pulseGlow 2s ease-in-out infinite",
                float: "float 6s ease-in-out infinite",
            },
            keyframes: {
                fadeIn: {
                    "0%": { opacity: "0" },
                    "100%": { opacity: "1" },
                },
                slideUp: {
                    "0%": { opacity: "0", transform: "translateY(10px)" },
                    "100%": { opacity: "1", transform: "translateY(0)" },
                },
                pulseGlow: {
                    "0%, 100%": { opacity: "0.4" },
                    "50%": { opacity: "0.8" },
                },
                float: {
                    "0%, 100%": { transform: "translateY(0)" },
                    "50%": { transform: "translateY(-10px)" },
                },
            },
        },
    },
    plugins: [],
};
