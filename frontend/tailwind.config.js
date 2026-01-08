/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#772025',
          hover: '#5a181c',
          light: '#a03a42',
        },
        secondary: {
          DEFAULT: '#ffffff',
          dark: '#f5f5f5',
        },
      },
    },
  },
  plugins: [],
}

