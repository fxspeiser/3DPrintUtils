import { defineConfig } from 'vite';

export default defineConfig({
  root: 'web',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  server: {
    port: 3737,
    proxy: {
      '/api': {
        target: 'http://localhost:3738',
        changeOrigin: true,
      },
    },
  },
});
