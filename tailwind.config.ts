import type { Config } from 'tailwindcss'
const config: Config = {
  content: ['./app/**/*.{ts,tsx}','./components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        or: '#FF5C00',
        'or-light': '#FF7A2E',
        'or-pale': '#FFF0E8',
        ink: '#0A0A0A',
        'ink-2': '#141414',
        'ink-3': '#1E1E1E',
      },
      fontFamily: {
        sans: ['DM Sans','sans-serif'],
        mono: ['JetBrains Mono','monospace'],
        arabic: ['Noto Sans Arabic','serif'],
      },
    },
  },
  plugins: [],
}
export default config
