import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  optimizeDeps: {
    include: ['react-pdf', 'pdfjs-dist/build/pdf'],
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
