import React from 'react';

/**
 * App.jsx — Stub for Phase 1
 *
 * This will be replaced in Phase 7 with the full App component containing:
 * - Auth state (useAuth hook)
 * - Data hooks (useProducts, useEntries, useExits, useShippings, useCategories, useLocaisOrigem)
 * - Computed stock (useStock hook)
 * - CRUD callbacks
 * - Sidebar + routing via activeTab
 * - Realtime subscriptions
 *
 * See index-legacy.html L2331-L3082 for the full original App component.
 */

export default function App() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      fontFamily: 'Inter, sans-serif',
      background: '#FAFAFA',
      color: '#171717',
    }}>
      <div style={{ textAlign: 'center' }}>
        <img
          src="/logo-orne.png"
          alt="Orne Decor"
          style={{ height: 48, marginBottom: 16 }}
        />
        <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
          Orne Estoque v2
        </h1>
        <p style={{ color: '#737373', fontSize: 14 }}>
          Migração em andamento — Fase 1 (Setup Vite) concluída.
        </p>
        <p style={{ color: '#A3A3A3', fontSize: 12, marginTop: 16 }}>
          Sistema legado disponível em{' '}
          <a href="/index-legacy.html" style={{ color: '#2563EB' }}>
            /index-legacy.html
          </a>
        </p>
      </div>
    </div>
  );
}
