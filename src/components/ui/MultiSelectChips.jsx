/**
 * MultiSelectChips.jsx — Dropdown multi-select com checkboxes e badge de count
 *
 * Componente reusável para filtros multi-seleção. Modelado a partir de
 * `PeriodFilter.jsx` (mesma estrutura: button trigger → popup absoluto com
 * `useRef` + outside-click). Diferenças em relação ao PeriodFilter:
 *   - Suporta seleção múltipla via Set<string>
 *   - Mostra badge "(N)" no trigger quando há seleções (N > 0)
 *   - Renderiza checkboxes em vez de botões single-select
 *
 * Sem dependências externas. Todo state é controlado pelo pai.
 *
 * Frente 2 — primeiro consumidor: filtros de HUB origem e Tipo transporte
 * em ShippingList.jsx. Reusável depois (Análise Logística, Dashboard).
 *
 * @example
 *   const [hubsSelected, setHubsSelected] = useState(new Set());
 *   <MultiSelectChips
 *     label="HUB"
 *     options={[
 *       { value: 'G+SHIP VG', label: 'G+SHIP VG' },
 *       { value: 'G+SHIP RJ', label: 'G+SHIP RJ' },
 *     ]}
 *     selected={hubsSelected}
 *     onChange={setHubsSelected}
 *   />
 */
import React, { useState, useRef, useEffect } from 'react';

export default function MultiSelectChips({
  label,
  options,
  selected,
  onChange,
  minWidth = 200,
  noOuterMargin = false, // Frente 2: quando true, remove marginBottom 16px do wrapper
                         // (necessário quando usado dentro de uma linha de filtros que
                         // já controla o spacing externo).
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close on outside click — mesmo padrão do PeriodFilter
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggle = (value) => {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  };

  const clearAll = (e) => {
    e.stopPropagation();
    onChange(new Set());
  };

  const count = selected.size;

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block', marginBottom: noOuterMargin ? 0 : '16px' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '6px 12px', fontSize: '13px', fontWeight: 500,
          borderRadius: '8px',
          border: `1px solid ${count > 0 ? '#8c52ff' : 'var(--border-color)'}`,
          background: count > 0 ? 'rgba(140, 82, 255, 0.08)' : 'var(--bg-primary)',
          color: count > 0 ? '#8c52ff' : 'var(--text-primary)',
          cursor: 'pointer',
        }}
      >
        <span>{label}</span>
        {count > 0 && (
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              padding: '1px 6px',
              borderRadius: '10px',
              background: '#8c52ff',
              color: '#fff',
              lineHeight: 1.4,
            }}
          >
            {count}
          </span>
        )}
        <span style={{ fontSize: '10px', opacity: 0.6 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div
          style={{
            position: 'absolute', top: '100%', left: 0, marginTop: '4px', zIndex: 100,
            background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
            borderRadius: '10px', boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
            minWidth, padding: '6px 0',
          }}
        >
          {/* Header com "Limpar" se há seleções */}
          {count > 0 && (
            <div
              style={{
                padding: '6px 14px',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>
                {count} selecionado{count > 1 ? 's' : ''}
              </span>
              <button
                onClick={clearAll}
                style={{
                  fontSize: '11px', border: 'none', background: 'transparent',
                  color: '#8c52ff', cursor: 'pointer', fontWeight: 500, padding: 0,
                }}
              >
                Limpar
              </button>
            </div>
          )}
          {options.map((opt) => {
            const isSelected = selected.has(opt.value);
            return (
              <label
                key={opt.value}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 14px',
                  fontSize: '13px',
                  cursor: 'pointer',
                  background: isSelected ? 'var(--accent-primary-subtle)' : 'transparent',
                  color: 'var(--text-primary)',
                  fontWeight: isSelected ? 600 : 400,
                  userSelect: 'none',
                }}
                onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'rgba(0,0,0,0.03)'; }}
                onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggle(opt.value)}
                  style={{ width: '14px', height: '14px', accentColor: '#8c52ff', cursor: 'pointer' }}
                />
                <span>{opt.label}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
