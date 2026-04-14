import type { Config } from 'tailwindcss'
const config: Config = {
  content: ['./app/**/*.{ts,tsx}','./components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // MD3 / Google tokens
        'md-primary': '#FF5C00',
        'md-primary-container': '#FFF0E8',
        'md-on-surface': '#202124',
        'md-on-surface-variant': '#5F6368',
        'md-surface': '#FFFFFF',
        'md-surface-variant': '#F8F9FA',
        'md-surface-container': '#F1F3F4',
        'md-outline': '#DADCE0',
        'md-outline-variant': '#E8EAED',
        'md-error': '#EA4335',
        'md-success': '#34A853',
        'md-blue': '#1A73E8',
        // legacy compat
        or: '#FF5C00',
        'or-light': '#FF7A2E',
        'or-pale': '#FFF0E8',
        ink: '#202124',
      },
      fontFamily: {
        sans: ['Roboto', 'Google Sans', 'sans-serif'],
        display: ['Google Sans', 'Roboto', 'sans-serif'],
        mono: ['Roboto Mono', 'monospace'],
        arabic: ['Noto Sans Arabic', 'serif'],
      },
      borderRadius: {
        'pill': '9999px',
        'card': '12px',
        'chip': '8px',
      },
    },
  },
  plugins: [],
}
export default config
