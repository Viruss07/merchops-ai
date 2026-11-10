import type { Config } from 'tailwindcss';

/** Token colours that still take Tailwind's opacity modifier (`border-safe/40`). */
const mix = (token: string) =>
  `color-mix(in srgb, var(${token}) calc(<alpha-value> * 100%), transparent)`;

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      gridTemplateColumns: {
        '30': 'repeat(30, minmax(0, 1fr))',
      },
      colors: {
        paper: mix('--paper'),
        panel: mix('--panel'),
        ink: {
          DEFAULT: mix('--ink'),
          2: mix('--ink-2'),
          3: mix('--ink-3'),
        },
        rule: {
          DEFAULT: mix('--rule'),
          strong: mix('--rule-strong'),
        },
        safe: {
          DEFAULT: mix('--safe'),
          field: mix('--safe-field'),
        },
        risk: {
          DEFAULT: mix('--risk'),
          field: mix('--risk-field'),
        },
        blocked: {
          DEFAULT: mix('--blocked'),
          field: mix('--blocked-field'),
        },
        focus: mix('--focus'),
        accent: {
          DEFAULT: mix('--accent'),
          ink: mix('--accent-ink'),
        },
      },
      /* Hierarchy by radius: controls 10px, sections 14px, the hero instrument 20px. */
      borderRadius: {
        md: '0.625rem',
        lg: '0.875rem',
        xl: '1.25rem',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
      },
      fontFamily: {
        sans: [
          'var(--font-geist-sans)',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
