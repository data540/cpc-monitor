import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
      },
      colors: {
        bg: {
          base:    '#0a0a0a',
          surface: '#111111',
          card:    '#161616',
          border:  '#242424',
          hover:   '#1c1c1c',
        },
        text: {
          primary:   '#e8e8e8',
          secondary: '#888888',
          tertiary:  '#444444',
        },
        amber: {
          dim:    '#3d2800',
          DEFAULT:'#f59e0b',
          bright: '#fbbf24',
        },
        green: {
          dim:    '#0d2b14',
          DEFAULT:'#22c55e',
          bright: '#4ade80',
        },
        red: {
          dim:    '#2b0d0d',
          DEFAULT:'#ef4444',
          bright: '#f87171',
        },
        blue: {
          dim:    '#0d1a2b',
          DEFAULT:'#3b82f6',
        },
      },
      borderRadius: {
        sm: '3px',
        DEFAULT: '6px',
        md: '8px',
        lg: '12px',
      },
    },
  },
  plugins: [],
}

export default config
