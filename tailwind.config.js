/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        roboto: ['Roboto', 'sans-serif'],
      },
      colors: {
        'dark-bg': '#1a202c',
        'dark-card': '#2d3748',
        'dark-text': '#e2e8f0',
        'dark-border': '#4a5568',
      },
    },
  },
  plugins: [],
};