/**
 * useEscapeDeselect — Limpa seleção múltipla ao pressionar ESC.
 *
 * Regras:
 * - Ignora ESC se houver modal aberto (delega ao handler do modal).
 * - Ignora ESC se o foco estiver em input/textarea/select (delega ao campo).
 * - Caso contrário, chama clearSelection().
 *
 * Uso:
 *   useEscapeDeselect(useCallback(() => setSelectedIds(new Set()), []));
 */
import { useEffect } from 'react';

export function useEscapeDeselect(clearSelection) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key !== 'Escape') return;

      // Modal aberto? Deixa o modal cuidar
      if (document.querySelector('[role="dialog"], .modal-overlay, .modal, [class*="modal-overlay"]')) return;

      // Campo de entrada focado? Deixa o campo cuidar
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (document.activeElement?.isContentEditable) return;

      if (typeof clearSelection === 'function') clearSelection();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [clearSelection]);
}
