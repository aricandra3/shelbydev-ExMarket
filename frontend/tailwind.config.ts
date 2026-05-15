/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                ink: "#111111",
                cream: "#fff4d6",
                retro: {
                    yellow: "#ffd84d",
                    coral: "#ff6b57",
                    mint: "#8ff0c2",
                    cyan: "#74d7ff",
                    lime: "#b9ff66",
                    pink: "#ff8bd1",
                    grape: "#8f7cff",
                },
                primary: {
                    50: "#fff9db",
                    100: "#fff2ad",
                    200: "#ffe878",
                    300: "#ffdc45",
                    400: "#ffd21f",
                    500: "#ffc400",
                    600: "#d99a00",
                    700: "#a76f00",
                    800: "#754a00",
                    900: "#4a2d00",
                    950: "#261600",
                },
                secondary: {
                    50: "#fff0ed",
                    100: "#ffddd8",
                    200: "#ffb9ad",
                    300: "#ff9582",
                    400: "#ff7d68",
                    500: "#ff6b57",
                    600: "#db4634",
                    700: "#a82c20",
                    800: "#721d17",
                    900: "#45130f",
                    950: "#250806",
                },
                tertiary: {
                    50: "#eefdff",
                    100: "#d5f8ff",
                    200: "#a9efff",
                    300: "#74d7ff",
                    400: "#45c0f4",
                    500: "#16a2db",
                    600: "#0d7fb5",
                    700: "#0d638b",
                    800: "#104966",
                    900: "#0d3145",
                    950: "#071d2a",
                },
                surface: {
                    0: "#17120f",
                    1: "#211915",
                    2: "#2c211b",
                    3: "#382a21",
                    4: "#4a372a",
                },
                accent: {
                    green: "#8ff0c2",
                    amber: "#ffd84d",
                    red: "#ff6b57",
                    purple: "#8f7cff",
                },
            },
            fontFamily: {
                sans: ["var(--font-inter)", "system-ui", "sans-serif"],
                display: ["var(--font-outfit)", "system-ui", "sans-serif"],
                mono: ["JetBrains Mono", "monospace"],
            },
            backgroundImage: {
                "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
                "hero-glow":
                    "radial-gradient(ellipse at 50% 0%, rgba(255,216,77,0.2) 0%, transparent 62%)",
                "retro-paper":
                    "radial-gradient(circle at 10% 20%, rgba(255,107,87,0.18), transparent 24%), radial-gradient(circle at 88% 8%, rgba(116,215,255,0.16), transparent 26%), linear-gradient(135deg, #17120f 0%, #211915 45%, #2c211b 100%)",
            },
            boxShadow: {
                neo: "6px 6px 0 #111111",
                "neo-sm": "3px 3px 0 #111111",
                "neo-dark": "6px 6px 0 rgba(17,17,17,0.72)",
                glass:
                    "inset 0 1px 0 rgba(255,244,214,0.22), 0 18px 50px rgba(0,0,0,0.32), 6px 6px 0 #111111",
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
