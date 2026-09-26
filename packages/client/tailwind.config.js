/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        felt: {
          dark: '#0f3822',
          DEFAULT: '#14532d',
          light: '#166534',
        },
        gold: {
          DEFAULT: '#eab308',
          light: '#fde047',
          dark: '#ca8a04',
        },
      },
    },
  },
  plugins: [],
};
