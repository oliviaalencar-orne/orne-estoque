import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  // Resolve aliases for clean imports
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },

  // Dev server config
  server: {
    port: 3000,
    open: true,
  },

  // Build config
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
      output: {
        manualChunks: {
          // Separate heavy vendor libraries into their own chunks
          'vendor-react': ['react', 'react-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-xlsx': ['xlsx'],
          'vendor-pdf': ['pdfjs-dist'],
          'vendor-charts': ['react-chartjs-2', 'chart.js'],
        },
      },
    },
  },
});
