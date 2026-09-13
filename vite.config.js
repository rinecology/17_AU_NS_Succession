import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['papaparse', 'plotly.js-dist-min']
        }
      }
    }
  },
  server: { port: 5174, open: true },
  preview: { port: 4174, open: true }
});
