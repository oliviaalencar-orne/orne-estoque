/**
 * PeriodFilter.jsx — Compact period filter dropdown + filterByPeriod helper
 */
import React, { useState, useRef, useEffect } from 'react';

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

/**
 * Filter items by period (30/60/90 days, all, or custom month/year).
 *
 * @param {Array} items
 * @param {string} periodFilter - '30', '60', '90', 'all', or 'custom'
 * @param {number} customMonth - 0-11
 * @param {number} customYear
 * @param {string} dateField - key name for the date property
 * @returns {Array}
 */
export function filterByPeriod(items, periodFilter, customMonth, customYear, dateField) {
  if (periodFilter === 'all') return items;
  if (periodFilter === 'custom') {
    const startDate = new Date(customYear, customMonth, 1);
    const endDate = new Date(customYear, customMonth + 1, 0, 23, 59, 59);
    return items.filter(item => {
      const d = new Date(item[dateField]);
      return d >= startDate && d <= endDate;
    });
  }
  const days = parseInt(periodFilter);
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  return items.filter(item => new Date(item[dateField]) >= startDate);
}

/**
 * Format user email — show only the part before @
 */
export function formatUserEmail(email) {
  if (!email) return '\u2014';
  return email.split('@')[0];
}

export default function PeriodFilter({ periodFilter, setPeriodFilter, customMonth, setCustomMonth, customYear, setCustomYear }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const getLabel = () => {
    if (periodFilter === '30') return 'Últimos 30 dias';
    if (periodFilter === '60') return 'Últimos 60 dias';
    if (periodFilter === 'custom') return `${MONTHS[customMonth]} ${customYear}`;
    return 'Últimos 30 dias';
  };

  const selectOption = (value) => {
    setPeriodFilter(value);
    if (value !== 'custom') setOpen(false);
  };

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block', marginBottom: '16px' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '6px 12px', fontSize: '13px', fontWeight: 500,
          borderRadius: '8px', border: '1px solid var(--border-color)',
          background: 'var(--bg-primary)', color: 'var(--text-primary)',
          cursor: 'pointer',
        }}
      >
        {getLabel()}
        <span style={{ fontSize: '10px', opacity: 0.6 }}>{open ? '\u25B2' : '\u25BC'}</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: '4px', zIndex: 100,
          background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
          borderRadius: '10px', boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
          minWidth: '200px', padding: '6px 0',
        }}>
          {[
            { value: '30', label: 'Últimos 30 dias' },
            { value: '60', label: 'Últimos 60 dias' },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => selectOption(opt.value)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '8px 14px', fontSize: '13px', border: 'none',
                background: periodFilter === opt.value ? 'var(--accent-primary-subtle)' : 'transparent',
                color: periodFilter === opt.value ? 'var(--accent-primary)' : 'var(--text-primary)',
                fontWeight: periodFilter === opt.value ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              {opt.label}
            </button>
          ))}
          <div style={{ borderTop: '1px solid var(--border-color)', margin: '4px 0' }} />
          <div style={{ padding: '8px 14px' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 500 }}>Mês/Ano</div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <select
                value={customMonth}
                onChange={e => { setCustomMonth(parseInt(e.target.value)); setPeriodFilter('custom'); }}
                className="form-select"
                style={{ fontSize: '12px', padding: '4px 6px', minWidth: 'auto', width: 'auto', flex: 1 }}
              >
                {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
              </select>
              <select
                value={customYear}
                onChange={e => { setCustomYear(parseInt(e.target.value)); setPeriodFilter('custom'); }}
                className="form-select"
                style={{ fontSize: '12px', padding: '4px 6px', minWidth: 'auto', width: 'auto' }}
              >
                {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
