/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
      },
      colors: {
        ink: { DEFAULT: '#14202b', muted: '#4b5b68', faint: '#6b7a86' },
        haze: { 50: '#f4f6f5', 100: '#e8ecea', 200: '#d3dad6' },
        leaf: { 600: '#2f6b4f', 700: '#245540' },
      },
    },
  },
  plugins: [],
};
