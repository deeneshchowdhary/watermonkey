/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        monkeyAccent: '#0284c7',
        monkeyDanger: '#ef4444',
      },
    },
  },
  plugins: [],
}
