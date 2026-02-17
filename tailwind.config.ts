/**
 * OpsOS Tailwind Configuration
 * Premium tech aesthetic — vibrant orange accent, cool neutrals, monospace headings
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
        // OpsOS Brand Palette — Premium Tech
        opsos: {
          slate: {
            DEFAULT: "#0A0A0A",
            50: "#FAFAFA",
            100: "#F5F5F5",
            200: "#E5E5E5",
            300: "#D4D4D4",
            400: "#A3A3A3",
            500: "#737373",
            600: "#525252",
            700: "#404040",
            800: "#262626",
            900: "#171717",
          },
          fog: {
            DEFAULT: "#FAFAFA",
            50: "#FFFFFF",
            100: "#FAFAFA",
            200: "#F5F5F5",
            300: "#E5E5E5",
            400: "#D4D4D4",
          },
          brass: {
            DEFAULT: "#FF5A1F",
            50: "#FFF7ED",
            100: "#FFEDD5",
            200: "#FED7AA",
            300: "#FDBA74",
            400: "#FB923C",
            500: "#FF5A1F",
            600: "#EA4C0C",
            700: "#C2410C",
            800: "#9A3412",
            900: "#7C2D12",
          },
          sage: {
            DEFAULT: "#64748B",
            50: "#F8FAFC",
            100: "#F1F5F9",
            200: "#E2E8F0",
            300: "#CBD5E1",
            400: "#94A3B8",
            500: "#64748B",
            600: "#475569",
            700: "#334155",
            800: "#1E293B",
            900: "#0F172A",
          },
          error: {
            DEFAULT: "#DC2626",
            50: "#FEF2F2",
            100: "#FEE2E2",
            200: "#FECACA",
            300: "#FCA5A5",
            400: "#F87171",
            500: "#EF4444",
            600: "#DC2626",
            700: "#B91C1C",
            800: "#991B1B",
            900: "#7F1D1D",
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
        sans: ["var(--font-space-grotesk)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "monospace"],
        heading: ["var(--font-jetbrains-mono)", "monospace"],
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
