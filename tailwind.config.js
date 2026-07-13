/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('ctf-ui/tailwind-preset')],
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./node_modules/ctf-ui/dist/*.js",
  ],
  theme: { extend: {} },
  plugins: [],
};
