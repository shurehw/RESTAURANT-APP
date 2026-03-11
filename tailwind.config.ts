/**
 * OpsOS Tailwind Configuration
 * A modern, minimal UI system inspired by vintage ledgers and built for hospitality operations.
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
        // OpsOS Brand Palette — Vintage Ledger
        opsos: {
          slate: {
            "DEFAULT": "#1B1D1F",
            "50": "#F8F9F9",
            "100": "#E9EAEB",
            "200": "#D2D5D7",
            "300": "#B6BCC0",
            "400": "#98A1A6",
            "500": "#7B848A",
            "600": "#63696E",
            "700": "#4F5458",
            "800": "#393E41",
            "900": "#1B1D1F"
          },
          fog: {
            "DEFAULT": "#F5F5F4",
            "50": "#FFFFFF",
            "100": "#F5F5F4",
            "200": "#E7E7E6",
            "300": "#D8D8D7",
            "400": "#C9C9C8"
          },
          brass: {
            "DEFAULT": "#C4A46B",
            "50": "#FDF9F2",
            "100": "#F9F2E3",
            "200": "#F2E5C7",
            "300": "#EAD7A9",
            "400": "#DFC98B",
            "500": "#C4A46B",
            "600": "#A98E5A",
            "700": "#8C764A",
            "800": "#6F5C3A",
            "900": "#52442A"
          },
          sage: {
            "DEFAULT": "#92A69C",
            "50": "#F3F5F4",
            "100": "#E8ECE9",
            "200": "#D1D8D4",
            "300": "#BAC5BE",
            "400": "#A2B1A8",
            "500": "#92A69C",
            "600": "#7F8F86",
            "700": "#6A776F",
            "800": "#555F59",
            "900": "#404743"
          },
          error: {
            "DEFAULT": "#C76864",
            // Add shades for error if needed
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
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-ibm-plex-mono)", "monospace"],
        heading: ["var(--font-inter)", "sans-serif"],
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

        // OpsOS accent shadows
        "brass-sm": "0 1px 2px 0 rgba(255, 90, 31, 0.15)",
        "brass-md": "0 4px 6px -1px rgba(255, 90, 31, 0.2)",
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
