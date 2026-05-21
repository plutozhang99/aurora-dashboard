/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950: '#070a16', 900: '#0b1020', 800: '#111733', 700: '#1a2147' },
        aurora: {
          pink: '#ff6bcb',
          violet: '#9b5cff',
          blue: '#3c7bff',
          cyan: '#3ad6ff',
          mint: '#5cf5c4',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk"', 'Inter', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      backdropBlur: { xs: '2px' },
      boxShadow: {
        glow: '0 0 40px rgba(155, 92, 255, 0.25)',
        inset: 'inset 0 1px 0 rgba(255,255,255,0.08)',
      },
      keyframes: {
        float: { '0%,100%': { transform: 'translateY(0px)' }, '50%': { transform: 'translateY(-6px)' } },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        aurora: {
          '0%,100%': { transform: 'translate3d(-10%, -10%, 0) rotate(0deg)' },
          '50%': { transform: 'translate3d(10%, 10%, 0) rotate(180deg)' },
        },
      },
      animation: {
        float: 'float 6s ease-in-out infinite',
        shimmer: 'shimmer 8s linear infinite',
        aurora: 'aurora 30s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
