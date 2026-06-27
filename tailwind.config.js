/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fef2f0',
          100: '#fde3de',
          500: '#ea4335',
          600: '#d8331f',
          700: '#b3271a'
        }
      }
    }
  },
  plugins: []
}
