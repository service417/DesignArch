/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // The brand palette. Green is primary/positive, brick is
        // money/attention/danger, cream is the canvas.
        forest: '#4E7A54',
        'forest-deep': '#26382B',
        brick: '#B23A2E',
        cream: '#F7F4EE',
        card: '#FFFFFF',
        ink: '#23302A',
        muted: '#6B7280',
        // Tinted pill backgrounds.
        'pill-green': '#E7F0E8',
        'pill-red': '#F6E3DF',
        'pill-neutral': '#EFEDE8',
        // Stacked-bar segments.
        'bar-green-done': '#4E7A54',
        'bar-green-doing': '#8DB090',
        'bar-green-todo': '#D3E3D5',
        'bar-brick-done': '#B23A2E',
        'bar-brick-doing': '#D18E86',
        'bar-brick-todo': '#EDD3CE',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      borderRadius: {
        '2xl': '16px',
      },
      boxShadow: {
        soft: '0 1px 2px 0 rgb(0 0 0 / 0.04)',
      },
    },
  },
  plugins: [],
};
