/**
 * ShippingAnalytics.jsx — Logistics analytics dashboard for Expedição tab
 *
 * Uses Chart.js (same as Dashboard.jsx) for charts.
 * Visual style matches Dashboard.jsx exactly — same colors, fonts, shadows.
 * All data processing done in frontend from shippings array.
 */
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Chart } from 'chart.js/auto';
import { Icon } from '@/utils/icons';
import { formatHubName, DEFAULT_HUBS } from '@/utils/hubs';

function normalizeHub(localOrigem) {
    if (!localOrigem) return 'Sem HUB';
    return formatHubName(localOrigem);
}

function getMeioEnvio(shipping) {
    if (shipping.entregaLocal || shipping.entrega_local) return 'Entrega Local';
    const code = (shipping.codigoRastreio || shipping.codigo_rastreio || '').toUpperCase();
    if (code.startsWith('LGI')) return 'Loggi';
    if (code.startsWith('JD') || code.startsWith('JAD')) return 'Jadlog';
    if (/^[A-Z]{2}\d{9,10}[A-Z]{2}$/.test(code)) return 'Correios';
    const transp = shipping.transportadora || '';
    if (transp && transp !== 'Melhor Envio' && transp !== '') return transp;
    return 'Outro';
}

// Classifica o meio em uma das 4 colunas fixas da tabela "detalhada".
function categorizarMeio(meio) {
    const m = String(meio || '').toLowerCase();
    if (m === 'entrega local') return 'Local';
    if (m === 'loggi') return 'Loggi';
    if (m === 'correios') return 'Correios';
    return 'Outro';
}

// Period presets
const PERIOD_OPTIONS = [
    { value: '7d', label: 'Últimos 7 dias' },
    { value: '30d', label: 'Últimos 30 dias' },
    { value: '60d', label: 'Últimos 60 dias' },
    { value: 'month', label: 'Mês atual' },
    { value: 'prev_month', label: 'Mês anterior' },
    { value: 'custom', label: 'Personalizado' },
];

const HUB_OPTIONS = ['Todos', ...DEFAULT_HUBS];

function getDateRange(periodValue) {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    let start;

    switch (periodValue) {
        case '7d':
            start = new Date(end); start.setDate(start.getDate() - 6); start.setHours(0, 0, 0, 0);
            break;
        case '30d':
            start = new Date(end); start.setDate(start.getDate() - 29); start.setHours(0, 0, 0, 0);
            break;
        case '60d':
            start = new Date(end); start.setDate(start.getDate() - 59); start.setHours(0, 0, 0, 0);
            break;
        case 'month':
            start = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
        case 'prev_month':
            start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            end.setTime(new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).getTime());
            break;
        default:
            start = new Date(end); start.setDate(start.getDate() - 29); start.setHours(0, 0, 0, 0);
    }
    return { start, end };
}

function daysBetween(a, b) {
    return Math.max(1, Math.round((b - a) / (1000 * 60 * 60 * 24)) + 1);
}

function formatDate(d) {
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function weekLabel(d) {
    const end = new Date(d);
    end.setDate(end.getDate() + 6);
    return `${formatDate(d)} - ${formatDate(end)}`;
}

// Chart style constants — alinhado com paleta do sistema
// Paleta: #8c52ff (roxo), #004aad (azul), #39845f (verde), #893030 (vermelho), #1800ad, #b4b4b4
const CHART = {
    tooltipBg: '#2C2640',
    gridColor: '#F3F0EC',
    tickColor: '#7A7585',
    barColor:     '#004aad',              // Via transportadora — azul escuro
    barColorAlt:  'rgba(0,74,173,0.30)',  // Entrega local — azul claro
    carrierPurple: '#8c52ff',             // Ranking de transportadoras
    barRadius: 6,
    barThickness: 20,
    cornerRadius: 8,
    tooltipPadding: 12,
    fontFamily: 'Inter',
};

// Status colors — match statusList from ShippingManager (paleta)
const STATUS_COLORS = {
    'DESPACHADO':        '#8c52ff',
    'AGUARDANDO_COLETA': '#b07dff',
    'EM_TRANSITO':       '#004aad',
    'SAIU_ENTREGA':      '#1800ad',
    'TENTATIVA_ENTREGA': '#d97706',
    'ENTREGUE':          '#39845f',
    'DEVOLVIDO':         '#893030',
};

const STATUS_LABELS = {
    'DESPACHADO': 'Despachado',
    'AGUARDANDO_COLETA': 'Aguardando Coleta',
    'EM_TRANSITO': 'Em Trânsito',
    'SAIU_ENTREGA': 'Saiu p/ Entrega',
    'TENTATIVA_ENTREGA': 'Tentativa de Entrega',
    'ENTREGUE': 'Entregue',
    'DEVOLVIDO': 'Devolvido',
};

export default function ShippingAnalytics({ shippings }) {
    const [periodType, setPeriodType] = useState('30d');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');
    const [selectedHub, setSelectedHub] = useState('Todos');

    const dailyChartRef = useRef(null);
    const dailyChartInstance = useRef(null);
    const carrierChartRef = useRef(null);
    const carrierChartInstance = useRef(null);
    const statusChartRef = useRef(null);
    const statusChartInstance = useRef(null);

    // Only despachos (not devoluções)
    const despachos = useMemo(() =>
        (shippings || []).filter(s => !s.tipo || s.tipo === 'despacho'),
        [shippings]
    );

    // Date range
    const dateRange = useMemo(() => {
        if (periodType === 'custom' && customStart && customEnd) {
            return {
                start: new Date(customStart + 'T00:00:00'),
                end: new Date(customEnd + 'T23:59:59'),
            };
        }
        return getDateRange(periodType);
    }, [periodType, customStart, customEnd]);

    // Previous period for comparison
    const prevRange = useMemo(() => {
        const days = daysBetween(dateRange.start, dateRange.end);
        const prevEnd = new Date(dateRange.start);
        prevEnd.setDate(prevEnd.getDate() - 1);
        prevEnd.setHours(23, 59, 59);
        const prevStart = new Date(prevEnd);
        prevStart.setDate(prevStart.getDate() - days + 1);
        prevStart.setHours(0, 0, 0, 0);
        return { start: prevStart, end: prevEnd };
    }, [dateRange]);

    // Filter despachos by period + hub
    const filtered = useMemo(() => {
        return despachos.filter(s => {
            const d = new Date(s.date);
            if (d < dateRange.start || d > dateRange.end) return false;
            if (selectedHub !== 'Todos') {
                const hub = normalizeHub(s.localOrigem || s.local_origem);
                if (hub !== selectedHub) return false;
            }
            return true;
        });
    }, [despachos, dateRange, selectedHub]);

    // Previous period filtered
    const prevFiltered = useMemo(() => {
        return despachos.filter(s => {
            const d = new Date(s.date);
            if (d < prevRange.start || d > prevRange.end) return false;
            if (selectedHub !== 'Todos') {
                const hub = normalizeHub(s.localOrigem || s.local_origem);
                if (hub !== selectedHub) return false;
            }
            return true;
        });
    }, [despachos, prevRange, selectedHub]);

    // Summary cards
    const summary = useMemo(() => {
        const total = filtered.length;
        const prevTotal = prevFiltered.length;
        const viaTransp = filtered.filter(s => !(s.entregaLocal || s.entrega_local)).length;
        const entregaLocal = filtered.filter(s => s.entregaLocal || s.entrega_local).length;
        const days = daysBetween(dateRange.start, dateRange.end);
        const mediaDia = days > 0 ? (total / days).toFixed(1) : '0';
        const variacao = prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : null;

        return { total, viaTransp, entregaLocal, mediaDia, variacao, prevTotal };
    }, [filtered, prevFiltered, dateRange]);

    // Daily volume data (group by day or week if >60 days)
    const dailyData = useMemo(() => {
        const days = daysBetween(dateRange.start, dateRange.end);
        const groupByWeek = days > 60;
        const buckets = {};

        filtered.forEach(s => {
            const d = new Date(s.date);
            let key;
            if (groupByWeek) {
                const weekStart = new Date(d);
                weekStart.setDate(weekStart.getDate() - weekStart.getDay());
                key = weekStart.toISOString().slice(0, 10);
            } else {
                key = d.toISOString().slice(0, 10);
            }
            if (!buckets[key]) buckets[key] = { transp: 0, local: 0 };
            if (s.entregaLocal || s.entrega_local) {
                buckets[key].local++;
            } else {
                buckets[key].transp++;
            }
        });

        const sortedKeys = Object.keys(buckets).sort();
        return {
            labels: sortedKeys.map(k => {
                const d = new Date(k + 'T12:00:00');
                return groupByWeek ? weekLabel(d) : formatDate(d);
            }),
            transp: sortedKeys.map(k => buckets[k].transp),
            local: sortedKeys.map(k => buckets[k].local),
            groupByWeek,
        };
    }, [filtered, dateRange]);

    // Carrier ranking
    const carrierData = useMemo(() => {
        const counts = {};
        filtered.forEach(s => {
            const meio = getMeioEnvio(s);
            counts[meio] = (counts[meio] || 0) + 1;
        });
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        return {
            labels: sorted.map(([k]) => k),
            values: sorted.map(([, v]) => v),
            total: filtered.length,
        };
    }, [filtered]);

    // Volume by HUB — usa mesmo categorizador da tabela detalhada para consistência
    const hubData = useMemo(() => {
        const hubs = {};
        filtered.forEach(s => {
            const hub = normalizeHub(s.localOrigem || s.local_origem);
            const cat = categorizarMeio(getMeioEnvio(s));
            if (!hubs[hub]) hubs[hub] = { total: 0, local: 0, transp: 0 };
            hubs[hub].total++;
            if (cat === 'Local') {
                hubs[hub].local++;
            } else {
                hubs[hub].transp++;
            }
        });
        return Object.entries(hubs)
            .sort((a, b) => b[1].total - a[1].total)
            .map(([hub, data]) => ({
                hub,
                ...data,
                pctLocal: data.total > 0 ? Math.round((data.local / data.total) * 100) : 0,
            }));
    }, [filtered]);

    // Status breakdown
    const statusData = useMemo(() => {
        const counts = {};
        filtered.forEach(s => {
            const st = s.status || 'DESPACHADO';
            counts[st] = (counts[st] || 0) + 1;
        });
        const order = ['AGUARDANDO_COLETA', 'DESPACHADO', 'EM_TRANSITO', 'SAIU_ENTREGA', 'TENTATIVA_ENTREGA', 'ENTREGUE', 'DEVOLVIDO'];
        return order
            .filter(st => counts[st] > 0)
            .map(st => ({
                status: st,
                label: STATUS_LABELS[st] || st,
                count: counts[st],
                color: STATUS_COLORS[st] || '#7A7585',
            }));
    }, [filtered]);

    // Hub × Carrier matrix (com categorização fixa em 4 colunas: Local/Loggi/Correios/Outro)
    const matrixData = useMemo(() => {
        const fixed = {}; // { hubName: { Local: n, Loggi: n, Correios: n, Outro: n } }
        filtered.forEach(s => {
            const hub = normalizeHub(s.localOrigem || s.local_origem);
            const meio = getMeioEnvio(s);
            const cat = categorizarMeio(meio);
            if (!fixed[hub]) fixed[hub] = { Local: 0, Loggi: 0, Correios: 0, Outro: 0 };
            fixed[hub][cat]++;
        });
        const hubList = Object.entries(fixed)
            .sort((a, b) => {
                const totalA = a[1].Local + a[1].Loggi + a[1].Correios + a[1].Outro;
                const totalB = b[1].Local + b[1].Loggi + b[1].Correios + b[1].Outro;
                return totalB - totalA;
            })
            .map(([hub]) => hub);
        return { hubs: hubList, fixed };
    }, [filtered]);

    // Shared tooltip config (matches Dashboard.jsx)
    const tooltipConfig = {
        backgroundColor: CHART.tooltipBg,
        titleFont: { size: 12, weight: '600', family: CHART.fontFamily },
        bodyFont: { size: 11, family: CHART.fontFamily },
        padding: CHART.tooltipPadding,
        cornerRadius: CHART.cornerRadius,
    };

    // Shared legend config (square icons like Dashboard line chart)
    const legendConfig = {
        display: true,
        position: 'top',
        align: 'end',
        labels: {
            boxWidth: 12,
            boxHeight: 12,
            borderRadius: 3,
            useBorderRadius: true,
            font: { size: 11, family: CHART.fontFamily },
            color: CHART.tickColor,
            padding: 16,
        },
    };

    // Chart: daily volume
    useEffect(() => {
        if (!dailyChartRef.current || dailyData.labels.length === 0) return;
        if (dailyChartInstance.current) dailyChartInstance.current.destroy();

        dailyChartInstance.current = new Chart(dailyChartRef.current, {
            type: 'bar',
            data: {
                labels: dailyData.labels,
                datasets: [
                    {
                        label: 'Via Transportadora',
                        data: dailyData.transp,
                        backgroundColor: CHART.barColor,
                        borderRadius: CHART.barRadius,
                        barThickness: CHART.barThickness,
                    },
                    {
                        label: 'Entrega Local',
                        data: dailyData.local,
                        backgroundColor: CHART.barColorAlt,
                        borderRadius: CHART.barRadius,
                        barThickness: CHART.barThickness,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: legendConfig,
                    tooltip: {
                        ...tooltipConfig,
                        callbacks: {
                            footer: (items) => {
                                const total = items.reduce((s, i) => s + i.parsed.y, 0);
                                return `Total: ${total}`;
                            }
                        }
                    },
                },
                scales: {
                    x: {
                        stacked: true,
                        grid: { display: false },
                        ticks: { color: CHART.tickColor, font: { size: 10, family: CHART.fontFamily }, maxRotation: 45 },
                    },
                    y: {
                        stacked: true,
                        beginAtZero: true,
                        ticks: { stepSize: 1, color: CHART.tickColor, font: { size: 11, family: CHART.fontFamily } },
                        grid: { color: CHART.gridColor, drawBorder: false },
                    },
                },
            },
        });
        return () => { if (dailyChartInstance.current) dailyChartInstance.current.destroy(); };
    }, [dailyData]);

    // Chart: carrier ranking (horizontal bar)
    useEffect(() => {
        if (!carrierChartRef.current || carrierData.labels.length === 0) return;
        if (carrierChartInstance.current) carrierChartInstance.current.destroy();

        // Gradient de roxos — do mais escuro (topo) ao mais claro (base)
        const purpleShades = carrierData.labels.map((_, i) => {
            const opacity = 1 - (i * 0.12);
            return `rgba(140,82,255,${Math.max(0.35, opacity).toFixed(2)})`;
        });

        carrierChartInstance.current = new Chart(carrierChartRef.current, {
            type: 'bar',
            data: {
                labels: carrierData.labels,
                datasets: [{
                    data: carrierData.values,
                    backgroundColor: purpleShades,
                    borderRadius: CHART.barRadius,
                    barThickness: 16,
                }],
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        ...tooltipConfig,
                        callbacks: {
                            label: (ctx) => {
                                const pct = carrierData.total > 0 ? Math.round((ctx.parsed.x / carrierData.total) * 100) : 0;
                                return `${ctx.parsed.x} envios (${pct}%)`;
                            }
                        }
                    },
                },
                scales: {
                    x: { beginAtZero: true, ticks: { stepSize: 1, color: CHART.tickColor, font: { size: 11, family: CHART.fontFamily } }, grid: { color: CHART.gridColor, drawBorder: false } },
                    y: { grid: { display: false }, ticks: { color: CHART.tickColor, font: { size: 12, family: CHART.fontFamily } } },
                },
            },
        });
        return () => { if (carrierChartInstance.current) carrierChartInstance.current.destroy(); };
    }, [carrierData]);

    // Chart: status donut
    useEffect(() => {
        if (!statusChartRef.current || statusData.length === 0) return;
        if (statusChartInstance.current) statusChartInstance.current.destroy();

        statusChartInstance.current = new Chart(statusChartRef.current, {
            type: 'doughnut',
            data: {
                labels: statusData.map(s => s.label),
                datasets: [{
                    data: statusData.map(s => s.count),
                    backgroundColor: statusData.map(s => s.color),
                    borderWidth: 0,
                    spacing: 2,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '65%',
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            boxWidth: 12,
                            boxHeight: 12,
                            borderRadius: 3,
                            useBorderRadius: true,
                            font: { size: 11, family: CHART.fontFamily },
                            color: CHART.tickColor,
                            padding: 12,
                        },
                    },
                    tooltip: {
                        ...tooltipConfig,
                        callbacks: {
                            label: (ctx) => {
                                const total = statusData.reduce((s, d) => s + d.count, 0);
                                const pct = total > 0 ? Math.round((ctx.parsed / total) * 100) : 0;
                                return `${ctx.label}: ${ctx.parsed} (${pct}%)`;
                            }
                        }
                    },
                },
            },
        });
        return () => { if (statusChartInstance.current) statusChartInstance.current.destroy(); };
    }, [statusData]);

    return (
        <div>
            {/* Filters */}
            <div className="card" style={{ marginBottom: '24px' }}>
                <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '16px',
                    alignItems: 'flex-end',
                }}>
                    <div style={{ flex: '0 0 auto' }}>
                        <label className="form-label" style={{ marginBottom: '4px', fontSize: '12px' }}>Período</label>
                        <select
                            className="form-select"
                            value={periodType}
                            onChange={e => setPeriodType(e.target.value)}
                            style={{ minWidth: '180px' }}
                        >
                            {PERIOD_OPTIONS.map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                    </div>
                    {periodType === 'custom' && (
                        <>
                            <div style={{ flex: '0 0 auto' }}>
                                <label className="form-label" style={{ marginBottom: '4px', fontSize: '12px' }}>Início</label>
                                <input
                                    type="date"
                                    className="form-input"
                                    value={customStart}
                                    onChange={e => setCustomStart(e.target.value)}
                                />
                            </div>
                            <div style={{ flex: '0 0 auto' }}>
                                <label className="form-label" style={{ marginBottom: '4px', fontSize: '12px' }}>Fim</label>
                                <input
                                    type="date"
                                    className="form-input"
                                    value={customEnd}
                                    onChange={e => setCustomEnd(e.target.value)}
                                />
                            </div>
                        </>
                    )}
                    <div style={{ flex: '0 0 auto' }}>
                        <label className="form-label" style={{ marginBottom: '4px', fontSize: '12px' }}>HUB</label>
                        <select
                            className="form-select"
                            value={selectedHub}
                            onChange={e => setSelectedHub(e.target.value)}
                            style={{ minWidth: '200px' }}
                        >
                            {HUB_OPTIONS.map(h => (
                                <option key={h} value={h}>{h}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Section 1: Summary cards */}
            <div className="stats-grid" style={{ marginBottom: '24px' }}>
                <div className="stat-card">
                    <div className="stat-content">
                        <div className="stat-value" style={{ fontVariantNumeric: 'tabular-nums' }}>{summary.total}</div>
                        <div className="stat-label">Total Envios</div>
                        {summary.variacao !== null && (
                            <div style={{
                                fontSize: '11px',
                                color: 'var(--text-tertiary)',
                                marginTop: '4px',
                            }}>
                                {summary.variacao >= 0 ? '↑' : '↓'} {Math.abs(summary.variacao)}% vs anterior
                            </div>
                        )}
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-content">
                        <div className="stat-value" style={{ fontVariantNumeric: 'tabular-nums' }}>{summary.viaTransp}</div>
                        <div className="stat-label">Via Transportadora</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                            {summary.total > 0 ? Math.round((summary.viaTransp / summary.total) * 100) : 0}% do total
                        </div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-content">
                        <div className="stat-value" style={{ fontVariantNumeric: 'tabular-nums' }}>{summary.entregaLocal}</div>
                        <div className="stat-label">Entrega Local</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                            {summary.total > 0 ? Math.round((summary.entregaLocal / summary.total) * 100) : 0}% do total
                        </div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-content">
                        <div className="stat-value" style={{ fontVariantNumeric: 'tabular-nums' }}>{summary.mediaDia}</div>
                        <div className="stat-label">Média/Dia</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                            envios por dia
                        </div>
                    </div>
                </div>
            </div>

            {/* Section 2: Daily volume chart */}
            <div className="card" style={{ marginBottom: '24px' }}>
                <h2 className="card-title" style={{ marginBottom: '20px' }}>
                    <span className="card-title-icon">{'\u25A5'}</span>
                    Volume {dailyData.groupByWeek ? 'Semanal' : 'Diário'}
                </h2>
                <div style={{ height: '280px' }}>
                    {dailyData.labels.length > 0 ? (
                        <canvas ref={dailyChartRef} />
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-tertiary)', fontSize: '13px' }}>
                            Nenhum envio no período selecionado
                        </div>
                    )}
                </div>
            </div>

            {/* Section 3 + 5: Carrier ranking + Status (side by side on desktop) */}
            <div className="dashboard-analytics-grid" style={{ marginBottom: '24px' }}>
                {/* Carrier ranking */}
                <div className="card" style={{ marginBottom: 0 }}>
                    <h2 className="card-title" style={{ marginBottom: '20px' }}>
                        <span className="card-title-icon">{'\u25C6'}</span>
                        Ranking de Transportadoras
                    </h2>
                    <div style={{ height: Math.max(180, carrierData.labels.length * 36 + 20) }}>
                        {carrierData.labels.length > 0 ? (
                            <canvas ref={carrierChartRef} />
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-tertiary)', fontSize: '13px' }}>
                                Sem dados
                            </div>
                        )}
                    </div>
                </div>

                {/* Status breakdown */}
                <div className="card" style={{ marginBottom: 0 }}>
                    <h2 className="card-title" style={{ marginBottom: '20px' }}>
                        <span className="card-title-icon">{'\u25CF'}</span>
                        Status dos Envios
                    </h2>
                    <div style={{ height: '220px' }}>
                        {statusData.length > 0 ? (
                            <canvas ref={statusChartRef} />
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-tertiary)', fontSize: '13px' }}>
                                Sem dados
                            </div>
                        )}
                    </div>
                    {/* Active status badges */}
                    {statusData.filter(s => s.status !== 'ENTREGUE').length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '16px' }}>
                            {statusData.filter(s => s.status !== 'ENTREGUE').map(s => (
                                <span key={s.status} style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '4px 10px',
                                    borderRadius: 'var(--radius-sm)',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    background: 'var(--bg-tertiary)',
                                    color: 'var(--text-secondary)',
                                }}>
                                    <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: s.color }} />
                                    {s.label}: {s.count}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Section 4: Volume por HUB — DUAS tabelas lado a lado */}
            <div className="dashboard-analytics-grid" style={{ marginBottom: '24px' }}>
                {/* Tabela simples: HUB | LOCAL | TRANSPORTADORA | TOTAL */}
                <div className="card" style={{ marginBottom: 0 }}>
                    <h2 className="card-title" style={{ marginBottom: '16px' }}>Volume por HUB</h2>
                    {hubData.length > 0 ? (
                        <div className="table-container">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th style={{ textAlign: 'left' }}>HUB</th>
                                        <th style={{ textAlign: 'center' }}>Entrega Local</th>
                                        <th style={{ textAlign: 'center' }}>Transportadora</th>
                                        <th style={{ textAlign: 'center', fontWeight: 700 }}>Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {hubData.map(h => (
                                        <tr key={h.hub}>
                                            <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{h.hub}</td>
                                            <td style={{ textAlign: 'center', color: '#39845f', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{h.local || '-'}</td>
                                            <td style={{ textAlign: 'center', color: '#004aad', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{h.transp || '-'}</td>
                                            <td style={{ textAlign: 'center', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{h.total}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '32px', fontSize: '13px' }}>Sem dados no período</div>
                    )}
                </div>

                {/* Tabela detalhada: HUB | LOCAL | LOGGI | CORREIOS | OUTRO | TOTAL */}
                <div className="card" style={{ marginBottom: 0 }}>
                    <h2 className="card-title" style={{ marginBottom: '16px' }}>Volume por HUB × Meio</h2>
                    {matrixData.hubs.length > 0 ? (
                        <div className="table-container">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th style={{ textAlign: 'left' }}>HUB</th>
                                        <th style={{ textAlign: 'center', color: '#39845f' }}>Local</th>
                                        <th style={{ textAlign: 'center', color: '#8c52ff' }}>Loggi</th>
                                        <th style={{ textAlign: 'center', color: '#004aad' }}>Correios</th>
                                        <th style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Outro</th>
                                        <th style={{ textAlign: 'center', fontWeight: 700 }}>Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {matrixData.hubs.map(hub => {
                                        const row = matrixData.fixed?.[hub] || { Local: 0, Loggi: 0, Correios: 0, Outro: 0 };
                                        const hubTotal = row.Local + row.Loggi + row.Correios + row.Outro;
                                        const cell = (n) => n > 0 ? (
                                            <span style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{n}</span>
                                        ) : (
                                            <span style={{ color: 'var(--text-tertiary)' }}>-</span>
                                        );
                                        return (
                                            <tr key={hub}>
                                                <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{hub}</td>
                                                <td style={{ textAlign: 'center' }}>{cell(row.Local)}</td>
                                                <td style={{ textAlign: 'center' }}>{cell(row.Loggi)}</td>
                                                <td style={{ textAlign: 'center' }}>{cell(row.Correios)}</td>
                                                <td style={{ textAlign: 'center' }}>{cell(row.Outro)}</td>
                                                <td style={{ textAlign: 'center', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{hubTotal}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '32px', fontSize: '13px' }}>Sem dados no período</div>
                    )}
                </div>
            </div>
        </div>
    );
}
