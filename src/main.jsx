import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { handleTinyCallback } from '@/utils/helpers';

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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
