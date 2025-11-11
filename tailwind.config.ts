/**
 * OpsOS Tailwind Configuration
 * Design system with vintage ledger meets modern minimalism
 */

import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // OpsOS Brand Palette with Full Shades
        opsos: {
          slate: {
            DEFAULT: "#1B1D1F",
            50: "#F5F5F5",
            100: "#E8E9E9",
            200: "#D1D3D4",
            300: "#A6A9AB",
            400: "#7B7F82",
            500: "#505559",
            600: "#3B3E41",
            700: "#2D2F32",
            800: "#1B1D1F",
            900: "#131416",
          },
          fog: {
            DEFAULT: "#F5F5F4",
            50: "#FFFFFF",
            100: "#F5F5F4",
            200: "#E7E7E5",
            300: "#D9D9D6",
            400: "#CBCBC7",
          },
          brass: {
            DEFAULT: "#C4A46B",
            50: "#F8F4EC",
            100: "#EFE7D5",
            200: "#E4D4B0",
            300: "#D9C18B",
            400: "#CEB37B",
            500: "#C4A46B",
            600: "#B69351",
            700: "#997A43",
            800: "#7B6235",
            900: "#5D4A28",
          },
          sage: {
            DEFAULT: "#92A69C",
            50: "#F1F4F3",
            100: "#E3EAE7",
            200: "#C7D5CF",
            300: "#ABC0B7",
            400: "#9FB3A9",
            500: "#92A69C",
            600: "#7A9489",
            700: "#647A71",
            800: "#4E5F59",
            900: "#3A4743",
          },
          error: {
            DEFAULT: "#C76864",
            50: "#FDEEEE",
            100: "#F9D6D5",
            200: "#F3ADAB",
            300: "#ED8481",
            400: "#DD7672",
            500: "#C76864",
            600: "#B24D49",
            700: "#8E3E3B",
            800: "#6A2F2D",
            900: "#461F1E",
          },
        },

        // Simple OpsOS tokens (for backwards compatibility)
        slate: "var(--opsos-slate)",
        fog: "var(--opsos-fog)",
        brass: "var(--opsos-brass)",
        sage: "var(--opsos-sage)",
        error: "var(--opsos-error)",

        // Shadcn theme mappings
        background: "var(--opsos-fog)",
        foreground: "var(--opsos-slate)",

        card: {
          DEFAULT: "var(--opsos-fog)",
          foreground: "var(--opsos-slate)",
        },

        popover: {
          DEFAULT: "var(--opsos-fog)",
          foreground: "var(--opsos-slate)",
        },

        primary: {
          DEFAULT: "var(--opsos-slate)",
          foreground: "var(--opsos-fog)",
        },

        secondary: {
          DEFAULT: "var(--opsos-brass)",
          foreground: "var(--opsos-slate)",
        },

        muted: {
          DEFAULT: "hsl(from var(--opsos-slate) h s 95%)",
          foreground: "hsl(from var(--opsos-slate) h s 45%)",
        },

        accent: {
          DEFAULT: "var(--opsos-brass)",
          foreground: "var(--opsos-slate)",
        },

        destructive: {
          DEFAULT: "var(--opsos-error)",
          foreground: "var(--opsos-fog)",
        },

        border: "hsl(from var(--opsos-slate) h s 90%)",
        input: "hsl(from var(--opsos-slate) h s 85%)",
        ring: "var(--opsos-brass)",

        success: "var(--opsos-sage)",

        chart: {
          "1": "var(--opsos-brass)",
          "2": "var(--opsos-sage)",
          "3": "var(--opsos-slate)",
          "4": "hsl(from var(--opsos-brass) h s 70%)",
          "5": "hsl(from var(--opsos-sage) h s 70%)",
        },
      },

      fontFamily: {
        sans: ["var(--font-ibm-plex-sans)", "Inter", "system-ui", "sans-serif"],
        mono: ["var(--font-ibm-plex-mono)", "monospace"],
        heading: ["Inter", "system-ui", "sans-serif"],
      },

      fontSize: {
        // OpsOS Typography Scale
        "display": ["3rem", { lineHeight: "1.1", letterSpacing: "-0.02em", fontWeight: "700" }],
        "h1": ["2.5rem", { lineHeight: "1.2", letterSpacing: "-0.02em", fontWeight: "700" }],
        "h2": ["2rem", { lineHeight: "1.25", letterSpacing: "-0.01em", fontWeight: "700" }],
        "h3": ["1.5rem", { lineHeight: "1.3", letterSpacing: "-0.01em", fontWeight: "600" }],
        "h4": ["1.25rem", { lineHeight: "1.4", letterSpacing: "0", fontWeight: "600" }],
        "h5": ["1.125rem", { lineHeight: "1.4", letterSpacing: "0", fontWeight: "600" }],
        "h6": ["1rem", { lineHeight: "1.5", letterSpacing: "0", fontWeight: "600" }],
        "body-lg": ["1.125rem", { lineHeight: "1.6" }],
        "body": ["1rem", { lineHeight: "1.6" }],
        "body-sm": ["0.875rem", { lineHeight: "1.5" }],
        "caption": ["0.75rem", { lineHeight: "1.4", letterSpacing: "0.01em", fontWeight: "500" }],
        "overline": ["0.75rem", { lineHeight: "1.2", letterSpacing: "0.08em", fontWeight: "600" }],
      },

      borderRadius: {
        lg: "0.75rem",
        md: "0.5rem",
        sm: "0.375rem",
      },

      boxShadow: {
        sm: "0 1px 2px 0 rgba(27, 29, 31, 0.05)",
        DEFAULT: "0 1px 3px 0 rgba(27, 29, 31, 0.1), 0 1px 2px -1px rgba(27, 29, 31, 0.1)",
        md: "0 4px 6px -1px rgba(27, 29, 31, 0.1), 0 2px 4px -2px rgba(27, 29, 31, 0.1)",
        lg: "0 10px 15px -3px rgba(27, 29, 31, 0.1), 0 4px 6px -4px rgba(27, 29, 31, 0.1)",
        xl: "0 20px 25px -5px rgba(27, 29, 31, 0.1), 0 8px 10px -6px rgba(27, 29, 31, 0.1)",
        inner: "inset 0 2px 4px 0 rgba(27, 29, 31, 0.05)",

        // OpsOS custom shadows
        "brass-sm": "0 1px 2px 0 rgba(196, 164, 107, 0.15)",
        "brass-md": "0 4px 6px -1px rgba(196, 164, 107, 0.2)",
      },

      spacing: {
        "18": "4.5rem",
        "88": "22rem",
        "128": "32rem",
      },

      transitionDuration: {
        "fast": "150ms",
        "base": "200ms",
        "slow": "250ms",
      },

      transitionTimingFunction: {
        "opsos": "cubic-bezier(0.4, 0, 0.2, 1)",
      },

      keyframes: {
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "slide-in-right": {
          "0%": { transform: "translateX(100%)" },
          "100%": { transform: "translateX(0)" },
        },
        "slide-in-left": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(0)" },
        },
        "zoom-in": {
          "0%": { transform: "scale(0.95)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
      },

      animation: {
        "fade-in": "fade-in 200ms ease-opsos",
        "slide-in-right": "slide-in-right 250ms ease-opsos",
        "slide-in-left": "slide-in-left 250ms ease-opsos",
        "zoom-in": "zoom-in 200ms ease-opsos",
      },
    },
  },
  plugins: [
    require("tailwindcss-animate"),
  ],
} satisfies Config;
