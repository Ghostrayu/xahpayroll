/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#0E0143',
          600: '#0b0136',
          700: '#090129',
          800: '#06011c',
          900: '#03000e',
        },
        secondary: {
          50: '#fffef5',
          100: '#fffdeb',
          200: '#fffcd6',
          300: '#fffbc2',
          400: '#fffaad',
          500: '#FFFD57',
          600: '#e6e44e',
          700: '#ccca46',
          800: '#b3b13d',
          900: '#999735',
        },
        tertiary: {
          50: '#ffffff',
          100: '#fefefe',
          200: '#fdfdfd',
          300: '#fcfcfc',
          400: '#fafafa',
          500: '#F7F7F7',
          600: '#dedede',
          700: '#c5c5c5',
          800: '#acacac',
          900: '#939393',
        },
        xah: {
          blue: '#0E0143',
          dark: '#06011c',
          light: '#F7F7F7',
        }
      },
      fontFamily: {
        sans: ['IBM Plex Sans', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
