// Plum & Blush design tokens. Use these names everywhere (bg-plum, text-charcoal ...).
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: { plum: '#633B4D', rose: '#C58B91', blush: '#E8C7C5', cream: '#FAF3ED', charcoal: '#332B30' },
      fontFamily: { display: ['"Playfair Display"', 'serif'], sans: ['"DM Sans"', 'sans-serif'] },
    },
  },
  plugins: [],
}
