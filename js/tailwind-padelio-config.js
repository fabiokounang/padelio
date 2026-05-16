/**
 * Shared Tailwind CDN config (Padelio palette + shadows).
 * Requires: load after tailwind CDN script.
 */
// eslint-disable-next-line no-undef
tailwind.config = {
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Nunito', 'Outfit', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '4xl': '2rem',
      },
      boxShadow: {
        cozy: '0 1px 2px rgba(26, 22, 37, 0.06), 0 8px 24px -8px rgba(26, 22, 37, 0.1)',
        'cozy-sm': '0 1px 2px rgba(26, 22, 37, 0.08), 0 4px 16px -6px rgba(26, 22, 37, 0.12)',
      },
      colors: {
        slate: {
          50: '#f4f2ef',
          100: '#ebe8e4',
          200: '#d9d4ce',
          300: '#b8b2ab',
          400: '#8f8794',
          500: '#6b6370',
          600: '#524a58',
          700: '#3d3644',
          800: '#2a2430',
          900: '#1c1824',
          950: '#100e14',
        },
        emerald: {
          50: '#edfcf7',
          100: '#d2f9ed',
          200: '#a8f0dc',
          300: '#6ee2c7',
          400: '#3ecdae',
          500: '#26b396',
          600: '#1a917a',
          700: '#187463',
          800: '#175c51',
          900: '#164c44',
        },
        lime: {
          200: '#ecfccb',
          300: '#d9f99d',
          400: '#fce7a8',
          500: '#fcd975',
        },
      },
    },
  },
};
