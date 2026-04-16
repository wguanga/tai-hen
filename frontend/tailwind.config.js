/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        hl: {
          yellow: '#FDE68A',
          blue: '#BAE6FD',
          green: '#BBF7D0',
          purple: '#E9D5FF',
        },
      },
    },
  },
  plugins: [],
};
