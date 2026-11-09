/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // Ant Design ships its own reset; Tailwind is used for layout utilities only.
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        navy: { 950: '#0b1220', 900: '#0f172a', 800: '#16213a', 700: '#1e2b47' },
        ink: { DEFAULT: '#0f172a', 2: '#475569', 3: '#94a3b8' },
        line: '#e6e9ef',
        canvas: '#f5f7fa',
        ok: '#16a34a',
        warn: '#d97706',
        bad: '#dc2626',
        info: '#2563eb',
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'] },
      boxShadow: { card: '0 1px 2px rgba(15,23,42,.04), 0 1px 3px rgba(15,23,42,.06)' },
    },
  },
  plugins: [],
};
