import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const isTizen = process.env.VITE_BUILD_MODE === 'tizen';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  ...(isTizen && {
    base: './',
    build: {
      outDir: 'tizen/dist',
      emptyOutDir: true,
    },
  }),
});
