import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const a = (v: string) => `rgb(var(${v}) / <alpha-value>)`;

const config: Config = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: a('--bg'),
        surface: a('--surface'),
        'surface-2': a('--surface-2'),
        'surface-3': a('--surface-3'),
        border: a('--border'),
        'border-strong': a('--border-strong'),
        fg: {
          DEFAULT: a('--fg'),
          muted: a('--fg-muted'),
          subtle: a('--fg-subtle'),
        },
        primary: {
          DEFAULT: a('--primary'),
          fg: a('--primary-fg'),
        },
        ok: a('--ok'),
        warn: a('--warn'),
        err: a('--err'),
        info: a('--info'),
      },
      fontFamily: {
        sans: ['Geist', 'system-ui', 'sans-serif'],
        mono: ['Geist Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        DEFAULT: 'var(--radius)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow)',
        lg: 'var(--shadow-lg)',
        glow: 'var(--shadow-glow)',
      },
      fontSize: {
        // escala refinada com line-heights consistentes
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.02em' }],
      },
      transitionTimingFunction: {
        smooth: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [animate],
};

export default config;
