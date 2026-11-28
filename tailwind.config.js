/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./projects/web/src/**/*.{html,ts}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#17709F', soft: '#E3F1F9' },
        accent: { DEFAULT: '#FF7BAC', soft: '#FFE3EE' },
        surface: { DEFAULT: '#FFF7FA' },
        ink: { DEFAULT: '#0B2F4A' },
        muted: { DEFAULT: '#56708A' },
        line: { DEFAULT: '#F1DCE5' },
        danger: { DEFAULT: '#C2185B' },
        /** Chấm đỏ báo có thông báo mới. */
        alert: { DEFAULT: '#E5383B' },
      },
      fontFamily: { sans: ['"Be Vietnam Pro"', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};
