import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),

    // Sentry — upload de source maps e release tracking.
    // Desativado automaticamente quando SENTRY_AUTH_TOKEN não existe
    // (dev local, builds sem credenciais). Na Vercel, as envs estão
    // em Settings → Environment Variables.
    sentryVitePlugin({
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      sourcemaps: {
        assets: './dist/**',
        ignore: ['node_modules'],
        // Source maps são subidos e removidos do bundle final —
        // não deixar .map em produção (exporia código-fonte).
        filesToDeleteAfterUpload: ['./dist/**/*.map'],
      },
      release: {
        name: process.env.VERCEL_GIT_COMMIT_SHA,
      },
      disable: !process.env.SENTRY_AUTH_TOKEN,
    }),
  ],

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

  // Injeta SHA do commit (via Vercel) para uso em Sentry.init().
  // Fallback 'dev' em builds locais.
  define: {
    'import.meta.env.VITE_COMMIT_SHA': JSON.stringify(
      process.env.VERCEL_GIT_COMMIT_SHA || 'dev'
    ),
  },

  // Build config
  build: {
    outDir: 'dist',
    // Source maps habilitados para o Sentry plugin fazer upload.
    // São removidos automaticamente após upload via
    // filesToDeleteAfterUpload.
    sourcemap: true,
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
          'vendor-sentry': ['@sentry/react'],
        },
      },
    },
  },
});
