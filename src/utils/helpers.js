/**
 * helpers.js — Miscellaneous utility functions
 *
 * Extracted from index-legacy.html L1777-1787, L1926
 */

/**
 * Generate a random 9-char alphanumeric ID.
 */
export const generateId = () => Math.random().toString(36).substr(2, 9);

/**
 * Handle Tiny ERP OAuth callback in popup window.
 * Should be called once on app init.
 */
export function handleTinyCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (code && window.location.pathname === '/tiny-callback') {
    if (window.opener) {
      window.opener.postMessage(
        { type: 'tiny_oauth_callback', code },
        window.location.origin
      );
      document.body.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:Inter,sans-serif;color:#666">Autorizado! Fechando...</div>';
      setTimeout(() => window.close(), 1500);
    }
  }
}
