import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = __dirname.replace(/\\/g, '/');

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    `${frontendDir}/index.html`,
    `${frontendDir}/src/**/*.{js,ts,jsx,tsx}`,
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./frontend/index.html",
    "./frontend/src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        marine: {
          50: '#f0f5fc',
          100: '#e1ecf8',
          200: '#c5daf2',
          300: '#99bfe8',
          400: '#669edb',
          500: '#3f7dcb',
          600: '#2b62b1',
          700: '#234e8f',
          800: '#1e4277',
          900: '#0f2038',
          950: '#081120',
        },
        slate: {
          850: '#172033',
          900: '#0f172a',
          950: '#090d16',
        },
        amber: {
          gold: '#eab308',
          glow: '#f59e0b',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'Monaco', 'Courier New', 'monospace'],
      },
      boxShadow: {
        'premium': '0 10px 30px -10px rgba(2, 6, 23, 0.5), 0 4px 6px -2px rgba(2, 6, 23, 0.25)',
        'card': '0 4px 20px -2px rgba(0, 0, 0, 0.3)',
        'touch': '0 6px 16px rgba(0, 0, 0, 0.4)',
        'glow-marine': '0 0 25px rgba(59, 130, 246, 0.25)',
        'glow-gold': '0 0 25px rgba(245, 158, 11, 0.25)',
      },
      screens: {
        'touch-max': {'max': '1023px'},
        'desktop': '1024px',
      },
    },
  },
  plugins: [],
}

