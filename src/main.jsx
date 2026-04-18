import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { handleTinyCallback } from '@/utils/helpers';
import EntregadorUpload from '@/components/delivery/EntregadorUpload';
import { initSentry } from '@/lib/sentry';
import { ErrorBoundary } from '@/components/ErrorBoundary';

// Inicializa Sentry antes de qualquer render (idempotente; no-op em
// localhost ou quando VITE_SENTRY_DSN não está definido).
initSentry();

// PDF.js worker setup (replaces CDN script tag)
import * as pdfjsLib from 'pdfjs-dist';
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

// Global CSS
import './styles/global.css';
import './styles/components.css';
import './styles/pages.css';

// Handle Tiny ERP OAuth callback in popup window (must run BEFORE React mount)
handleTinyCallback();

// Public route: /entrega/:token (no auth required)
const entregaMatch = window.location.pathname.match(/^\/entrega\/([a-f0-9]+)$/);
const RootComponent = entregaMatch
  ? () => <EntregadorUpload token={entregaMatch[1]} />
  : App;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <RootComponent />
    </ErrorBoundary>
  </React.StrictMode>
);
