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
    // Copy index-legacy.html to dist so it's accessible during migration
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
    },
  },
});
