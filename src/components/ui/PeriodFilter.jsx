/**
 * PeriodFilter.jsx — Period filter UI + filterByPeriod helper
 *
 * Extracted from index-legacy.html L10005-10078
 */
import React from 'react';

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
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px',
      flexWrap: 'wrap', padding: '10px 14px', background: '#f9f9f9', borderRadius: '8px'
    }}>
      <span style={{ fontSize: '13px', color: '#555', fontWeight: 500 }}>Período:</span>
      {[
        { value: '30', label: '30 dias' },
        { value: '60', label: '60 dias' },
        { value: '90', label: '90 dias' },
        { value: 'all', label: 'Todos' },
      ].map(opt => (
        <button
          key={opt.value}
          onClick={() => setPeriodFilter(opt.value)}
          style={{
            padding: '5px 12px', fontSize: '12px', borderRadius: '6px', cursor: 'pointer',
            border: periodFilter === opt.value ? '1px solid var(--accent-primary)' : '1px solid #ddd',
            background: periodFilter === opt.value ? 'var(--accent-primary)' : 'white',
            color: periodFilter === opt.value ? 'white' : '#333',
            fontWeight: periodFilter === opt.value ? 600 : 400,
          }}
        >
          {opt.label}
        </button>
      ))}
      <span style={{ color: '#ddd' }}>|</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <select
          value={customMonth}
          onChange={e => { setCustomMonth(parseInt(e.target.value)); setPeriodFilter('custom'); }}
          className="form-select"
          style={{ fontSize: '12px', padding: '5px 8px', minWidth: 'auto', width: 'auto' }}
        >
          {['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
            .map((m, i) => <option key={i} value={i}>{m}</option>)}
        </select>
        <select
          value={customYear}
          onChange={e => { setCustomYear(parseInt(e.target.value)); setPeriodFilter('custom'); }}
          className="form-select"
          style={{ fontSize: '12px', padding: '5px 8px', minWidth: 'auto', width: 'auto' }}
        >
          {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
    </div>
  );
}
