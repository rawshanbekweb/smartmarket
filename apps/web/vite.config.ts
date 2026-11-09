import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API = process.env.VITE_API_PROXY ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: API, changeOrigin: false },
      '/socket.io': {
        target: API,
        ws: true,
        // A tab closing or reloading aborts its socket — expected, not worth an error in the dev console.
        configure: (proxy) => {
          proxy.on('error', (err: NodeJS.ErrnoException) => {
            if (err.code !== 'ECONNABORTED' && err.code !== 'ECONNRESET') console.error('[proxy]', err.message);
          });
        },
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: {
          antd: ['antd'],
          charts: ['recharts'],
          vendor: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query', 'axios', 'dayjs'],
        },
      },
    },
  },
});
