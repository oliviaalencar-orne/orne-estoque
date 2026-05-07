/**
 * PeriodFilter.jsx — Compact period filter dropdown + filterByPeriod helper
 */
import React, { useState, useRef, useEffect } from 'react';

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// Helpers para "Hoje" e "Data específica" (Frente 6 — extensão do filtro de Período).
// Importante sobre timezone: <input type="date"> devolve string YYYY-MM-DD sem TZ.
// `new Date('YYYY-MM-DD')` parseia como UTC midnight, o que pode jogar o dia para
// o anterior em fusos negativos (Brasil, UTC-3). Construímos a Date pelos
// componentes locais para garantir que o "dia 05/05" do user vire `2026-05-05`
// 00:00 LOCAL, não 21:00 do dia anterior.
function parseLocalYMD(ymd) {
  if (!ymd || typeof ymd !== 'string') return null;
  const parts = ymd.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  const [y, m, d] = parts;
  return new Date(y, m - 1, d);
}

function startOfDay(date) {
  const r = new Date(date);
  r.setHours(0, 0, 0, 0);
  return r;
}

function endOfDay(date) {
  const r = new Date(date);
  r.setHours(23, 59, 59, 999);
  return r;
}

/**
 * Formata YYYY-MM-DD para DD/MM/AAAA (display do trigger quando "Data específica").
 * Retorna string vazia se input inválido.
 */
function formatYMDtoBR(ymd) {
  const d = parseLocalYMD(ymd);
  if (!d) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = d.getFullYear();
  return `${dd}/${mm}/${yy}`;
}

/**
 * Filter items by period.
 *
 * Suporta:
 *   'all'             → tudo (sem filtro)
 *   '30' / '60' / NN  → últimos N dias
 *   'custom'          → mês/ano (customMonth + customYear)
 *   'hoje'            → apenas o dia de hoje (Frente 6)
 *   'data-especifica' → apenas o dia em customDate YYYY-MM-DD (Frente 6).
 *                        Se customDate ausente/inválido, retorna items sem filtrar
 *                        (alinhado com display "Data específica" no trigger até o
 *                        user escolher um dia).
 *
 * @param {Array} items
 * @param {string} periodFilter
 * @param {number} customMonth - 0-11
 * @param {number} customYear
 * @param {string} dateField - key name for the date property
 * @param {string} [customDate] - YYYY-MM-DD para 'data-especifica'
 * @returns {Array}
 */
export function filterByPeriod(items, periodFilter, customMonth, customYear, dateField, customDate) {
  if (periodFilter === 'all') return items;
  if (periodFilter === 'custom') {
    const startDate = new Date(customYear, customMonth, 1);
    const endDate = new Date(customYear, customMonth + 1, 0, 23, 59, 59);
    return items.filter(item => {
      const d = new Date(item[dateField]);
      return d >= startDate && d <= endDate;
    });
  }
  if (periodFilter === 'hoje') {
    const start = startOfDay(new Date());
    const end = endOfDay(new Date());
    return items.filter(item => {
      const d = new Date(item[dateField]);
      return d >= start && d <= end;
    });
  }
  if (periodFilter === 'data-especifica') {
    const day = parseLocalYMD(customDate);
    if (!day) return items; // no-op até user escolher a data
    const start = startOfDay(day);
    const end = endOfDay(day);
    return items.filter(item => {
      const d = new Date(item[dateField]);
      return d >= start && d <= end;
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
  if (!email) return '—';
  return email.split('@')[0];
}

export default function PeriodFilter({
  periodFilter,
  setPeriodFilter,
  customMonth,
  setCustomMonth,
  customYear,
  setCustomYear,
  // Frente 6: opção "Data específica" — YYYY-MM-DD. Quando setCustomDate está ausente,
  // a seção "Data específica" não é renderizada (consumidores antigos como History.jsx
  // e TinyERPPage.jsx não precisam mudar — eles continuam vendo apenas as 4 opções
  // legadas + a nova "Hoje" que não exige state extra).
  customDate,
  setCustomDate,
  // Frente 2: quando true, remove marginBottom 16px do wrapper externo. Necessário
  // quando o componente é colocado dentro de uma linha de filtros que já controla
  // o spacing externo. StockView (consumidor anterior) continua usando default
  // false — comportamento legado preservado.
  noOuterMargin = false,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Frente 6: trigger exibe label dinâmica.
  // - "Últimos 30 dias" / "Últimos 60 dias": label fixa
  // - "Hoje": label fixa "Hoje"
  // - "custom" (mês/ano): "Maio 2026"
  // - "data-especifica" com data: "05/05/2026"
  // - "data-especifica" sem data: "Data específica" (placeholder até user escolher)
  const getLabel = () => {
    if (periodFilter === '30') return 'Últimos 30 dias';
    if (periodFilter === '60') return 'Últimos 60 dias';
    if (periodFilter === 'hoje') return 'Hoje';
    if (periodFilter === 'custom') return `${MONTHS[customMonth]} ${customYear}`;
    if (periodFilter === 'data-especifica') {
      const formatted = formatYMDtoBR(customDate);
      return formatted || 'Data específica';
    }
    return 'Últimos 30 dias';
  };

  // Quando seleciona uma opção de "atalho" (não custom/data-específica), fecha o popup.
  // Para 'custom' (mês/ano) e 'data-especifica' (date input), mantém aberto pois
  // a seleção depende de input adicional dentro do popup.
  const selectOption = (value) => {
    setPeriodFilter(value);
    if (value !== 'custom' && value !== 'data-especifica') setOpen(false);
  };

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block', marginBottom: noOuterMargin ? 0 : '16px' }}>
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
        <span style={{ fontSize: '10px', opacity: 0.6 }}>{open ? '▲' : '▼'}</span>
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
            { value: 'hoje', label: 'Hoje' },
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
          {/* Frente 6 — seção "Data específica". Renderizada apenas quando o consumidor
              passa setCustomDate (ShippingList). History.jsx e TinyERPPage.jsx não
              passam, então não veem a seção (continuam com o conjunto legado +
              "Hoje" que funciona sem state extra). */}
          {setCustomDate && (
            <>
              <div style={{ borderTop: '1px solid var(--border-color)', margin: '4px 0' }} />
              <div style={{ padding: '8px 14px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 500 }}>Data específica</div>
                <input
                  type="date"
                  value={customDate || ''}
                  onChange={e => {
                    const val = e.target.value;
                    setCustomDate(val || null);
                    if (val) setPeriodFilter('data-especifica');
                  }}
                  className="form-input"
                  style={{ fontSize: '12px', padding: '4px 6px', width: '100%' }}
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
