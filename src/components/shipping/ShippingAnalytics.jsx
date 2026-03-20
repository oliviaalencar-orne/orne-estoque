/**
 * ShippingAnalytics.jsx — Logistics analytics dashboard for Expedição tab
 *
 * Uses Chart.js (same as Dashboard.jsx) for charts.
 * All data processing done in frontend from shippings array.
 */
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Chart } from 'chart.js/auto';
import { getTransportadoraReal } from '@/utils/transportadora';

// HUB normalization map
const HUB_MAP = {
    'HUB VG': 'VG (Vila Guilherme - SP)',
    'G+SHIP VG': 'VG (Vila Guilherme - SP)',
    'VILA GUILHERME': 'VG (Vila Guilherme - SP)',
    'Loja Principal': 'VG (Vila Guilherme - SP)',
    'HUB RJ': 'RJ (Rio de Janeiro)',
    'G+SHIP RJ': 'RJ (Rio de Janeiro)',
    'RIO DE JANEIRO': 'RJ (Rio de Janeiro)',
    'HUB CWB': 'CWB (Curitiba)',
    'G+SHIP CWB': 'CWB (Curitiba)',
};

function normalizeHub(localOrigem) {
    if (!localOrigem) return 'Sem HUB';
    const upper = localOrigem.trim().toUpperCase();
    for (const [key, value] of Object.entries(HUB_MAP)) {
        if (key.toUpperCase() === upper) return value;
    }
    return localOrigem;
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

// Period presets
const PERIOD_OPTIONS = [
    { value: '7d', label: 'Últimos 7 dias' },
    { value: '30d', label: 'Últimos 30 dias' },
    { value: '60d', label: 'Últimos 60 dias' },
    { value: 'month', label: 'Mês atual' },
    { value: 'prev_month', label: 'Mês anterior' },
    { value: 'custom', label: 'Personalizado' },
];

const HUB_OPTIONS = ['Todos', 'VG (Vila Guilherme - SP)', 'RJ (Rio de Janeiro)', 'CWB (Curitiba)'];

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

// Colors — sober palette (Notion/Linear/Stripe style)
const COLORS = {
    primary: '#374151',
    secondary: '#9CA3AF',
    text: '#111827',
    textMuted: '#6B7280',
    border: '#E5E7EB',
    gridLine: '#F3F4F6',
    headerBg: '#F9FAFB',
    green: '#059669',
    amber: '#D97706',
    red: '#DC2626',
};

const STATUS_COLORS = {
    'DESPACHADO': '#6B7280',
    'AGUARDANDO_COLETA': '#D97706',
    'EM_TRANSITO': '#374151',
    'SAIU_ENTREGA': '#4B5563',
    'TENTATIVA_ENTREGA': '#9CA3AF',
    'ENTREGUE': '#059669',
    'DEVOLVIDO': '#DC2626',
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

    // Volume by HUB
    const hubData = useMemo(() => {
        const hubs = {};
        filtered.forEach(s => {
            const hub = normalizeHub(s.localOrigem || s.local_origem);
            if (!hubs[hub]) hubs[hub] = { total: 0, local: 0, transp: 0 };
            hubs[hub].total++;
            if (s.entregaLocal || s.entrega_local) {
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
                color: STATUS_COLORS[st] || COLORS.gray,
            }));
    }, [filtered]);

    // Hub × Carrier matrix
    const matrixData = useMemo(() => {
        const carriers = new Set();
        const hubs = {};
        filtered.forEach(s => {
            const hub = normalizeHub(s.localOrigem || s.local_origem);
            const meio = getMeioEnvio(s);
            carriers.add(meio);
            if (!hubs[hub]) hubs[hub] = {};
            hubs[hub][meio] = (hubs[hub][meio] || 0) + 1;
        });
        const carrierList = [...carriers].sort((a, b) => {
            const totalA = Object.values(hubs).reduce((s, h) => s + (h[a] || 0), 0);
            const totalB = Object.values(hubs).reduce((s, h) => s + (h[b] || 0), 0);
            return totalB - totalA;
        });
        const hubList = Object.entries(hubs)
            .sort((a, b) => {
                const totalA = Object.values(a[1]).reduce((s, v) => s + v, 0);
                const totalB = Object.values(b[1]).reduce((s, v) => s + v, 0);
                return totalB - totalA;
            })
            .map(([hub]) => hub);
        return { carriers: carrierList, hubs: hubList, data: hubs };
    }, [filtered]);

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
                        backgroundColor: COLORS.primary,
                    },
                    {
                        label: 'Entrega Local',
                        data: dailyData.local,
                        backgroundColor: COLORS.secondary,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top', labels: { usePointStyle: true, padding: 16, font: { size: 12, family: 'Inter' } } },
                    tooltip: {
                        backgroundColor: '#1F2937',
                        titleFont: { family: 'Inter' },
                        bodyFont: { family: 'Inter' },
                        cornerRadius: 6,
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
                        ticks: { color: COLORS.textMuted, font: { size: 11, family: 'Inter' }, maxRotation: 45 },
                    },
                    y: {
                        stacked: true,
                        beginAtZero: true,
                        ticks: { stepSize: 1, color: COLORS.textMuted, font: { size: 11, family: 'Inter' } },
                        grid: { color: COLORS.gridLine },
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

        carrierChartInstance.current = new Chart(carrierChartRef.current, {
            type: 'bar',
            data: {
                labels: carrierData.labels,
                datasets: [{
                    data: carrierData.values,
                    backgroundColor: COLORS.primary,
                    barThickness: 24,
                }],
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#1F2937',
                        titleFont: { family: 'Inter' },
                        bodyFont: { family: 'Inter' },
                        cornerRadius: 6,
                        callbacks: {
                            label: (ctx) => {
                                const pct = carrierData.total > 0 ? Math.round((ctx.parsed.x / carrierData.total) * 100) : 0;
                                return `${ctx.parsed.x} envios (${pct}%)`;
                            }
                        }
                    },
                },
                scales: {
                    x: { beginAtZero: true, ticks: { stepSize: 1, color: COLORS.textMuted, font: { size: 11, family: 'Inter' } }, grid: { color: COLORS.gridLine } },
                    y: { grid: { display: false }, ticks: { color: COLORS.textMuted, font: { size: 12, family: 'Inter' } } },
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
                    borderWidth: 2,
                    borderColor: '#fff',
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '60%',
                plugins: {
                    legend: { position: 'right', labels: { usePointStyle: true, pointStyleWidth: 8, padding: 12, color: COLORS.textMuted, font: { size: 12, family: 'Inter' } } },
                    tooltip: {
                        backgroundColor: '#1F2937',
                        titleFont: { family: 'Inter' },
                        bodyFont: { family: 'Inter' },
                        cornerRadius: 6,
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

    const cardStyle = {
        background: 'white',
        border: `1px solid ${COLORS.border}`,
        borderRadius: '10px',
        padding: '20px',
        flex: '1 1 200px',
        minWidth: '160px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    };

    const sectionStyle = {
        background: 'white',
        border: `1px solid ${COLORS.border}`,
        borderRadius: '10px',
        padding: '24px',
        marginBottom: '24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    };

    return (
        <div>
            {/* Filters */}
            <div style={{
                ...sectionStyle,
                display: 'flex',
                flexWrap: 'wrap',
                gap: '16px',
                alignItems: 'flex-end',
                padding: '16px 20px',
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

            {/* Section 1: Summary cards */}
            <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
                <div style={cardStyle}>
                    <div style={{ fontSize: '12px', color: COLORS.textMuted, fontWeight: 500, marginBottom: '4px' }}>Total Envios</div>
                    <div style={{ fontSize: '28px', fontWeight: 700, color: COLORS.text }}>{summary.total}</div>
                    {summary.variacao !== null && (
                        <div style={{
                            fontSize: '12px',
                            color: COLORS.textMuted,
                            fontWeight: 500,
                            marginTop: '4px',
                        }}>
                            {summary.variacao >= 0 ? '↑' : '↓'} {Math.abs(summary.variacao)}% vs período anterior
                        </div>
                    )}
                </div>
                <div style={cardStyle}>
                    <div style={{ fontSize: '12px', color: COLORS.textMuted, fontWeight: 500, marginBottom: '4px' }}>Via Transportadora</div>
                    <div style={{ fontSize: '28px', fontWeight: 700, color: COLORS.text }}>{summary.viaTransp}</div>
                    <div style={{ fontSize: '12px', color: COLORS.secondary, marginTop: '4px' }}>
                        {summary.total > 0 ? Math.round((summary.viaTransp / summary.total) * 100) : 0}% do total
                    </div>
                </div>
                <div style={cardStyle}>
                    <div style={{ fontSize: '12px', color: COLORS.textMuted, fontWeight: 500, marginBottom: '4px' }}>Entrega Local</div>
                    <div style={{ fontSize: '28px', fontWeight: 700, color: COLORS.text }}>{summary.entregaLocal}</div>
                    <div style={{ fontSize: '12px', color: COLORS.secondary, marginTop: '4px' }}>
                        {summary.total > 0 ? Math.round((summary.entregaLocal / summary.total) * 100) : 0}% do total
                    </div>
                </div>
                <div style={cardStyle}>
                    <div style={{ fontSize: '12px', color: COLORS.textMuted, fontWeight: 500, marginBottom: '4px' }}>Média/Dia</div>
                    <div style={{ fontSize: '28px', fontWeight: 700, color: COLORS.text }}>{summary.mediaDia}</div>
                    <div style={{ fontSize: '12px', color: COLORS.secondary, marginTop: '4px' }}>
                        envios por dia
                    </div>
                </div>
            </div>

            {/* Section 2: Daily volume chart */}
            <div style={sectionStyle}>
                <h3 style={{ margin: '0 0 16px', fontSize: '14px', fontWeight: 600, color: COLORS.text }}>
                    Volume {dailyData.groupByWeek ? 'Semanal' : 'Diário'}
                </h3>
                <div style={{ height: '300px', position: 'relative' }}>
                    {dailyData.labels.length > 0 ? (
                        <canvas ref={dailyChartRef} />
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: COLORS.secondary }}>
                            Nenhum envio no período selecionado
                        </div>
                    )}
                </div>
            </div>

            {/* Section 3 + 5: Carrier ranking + Status (side by side on desktop) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '24px', marginBottom: '24px' }}>
                {/* Carrier ranking */}
                <div style={sectionStyle}>
                    <h3 style={{ margin: '0 0 16px', fontSize: '14px', fontWeight: 600, color: COLORS.text }}>
                        Ranking de Transportadoras
                    </h3>
                    <div style={{ height: Math.max(200, carrierData.labels.length * 40 + 40), position: 'relative' }}>
                        {carrierData.labels.length > 0 ? (
                            <canvas ref={carrierChartRef} />
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: COLORS.secondary }}>
                                Sem dados
                            </div>
                        )}
                    </div>
                </div>

                {/* Status breakdown */}
                <div style={sectionStyle}>
                    <h3 style={{ margin: '0 0 16px', fontSize: '14px', fontWeight: 600, color: COLORS.text }}>
                        Status dos Envios
                    </h3>
                    <div style={{ height: '280px', position: 'relative' }}>
                        {statusData.length > 0 ? (
                            <canvas ref={statusChartRef} />
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: COLORS.secondary }}>
                                Sem dados
                            </div>
                        )}
                    </div>
                    {/* Status badges below chart */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
                        {statusData.filter(s => s.status !== 'ENTREGUE').map(s => (
                            <span key={s.status} style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '4px 10px',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: 500,
                                background: COLORS.gridLine,
                                color: COLORS.primary,
                            }}>
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: s.color }} />
                                {s.label}: {s.count}
                            </span>
                        ))}
                    </div>
                </div>
            </div>

            {/* Section 4: Volume by HUB */}
            <div style={sectionStyle}>
                <h3 style={{ margin: '0 0 16px', fontSize: '14px', fontWeight: 600, color: COLORS.text }}>
                    Volume por HUB
                </h3>
                {hubData.length > 0 ? (
                    <div style={{ overflowX: 'auto' }}>
                        <table className="table" style={{ minWidth: '500px' }}>
                            <thead>
                                <tr>
                                    <th style={{ textAlign: 'left' }}>HUB</th>
                                    <th style={{ textAlign: 'center' }}>Total</th>
                                    <th style={{ textAlign: 'center' }}>Entrega Local</th>
                                    <th style={{ textAlign: 'center' }}>Transportadora</th>
                                    <th style={{ textAlign: 'left', minWidth: '150px' }}>% Entrega Local</th>
                                </tr>
                            </thead>
                            <tbody>
                                {hubData.map(h => (
                                    <tr key={h.hub}>
                                        <td style={{ fontWeight: 600, color: COLORS.primary }}>{h.hub}</td>
                                        <td style={{ textAlign: 'center', color: COLORS.primary }}>{h.total}</td>
                                        <td style={{ textAlign: 'center', color: COLORS.textMuted }}>{h.local}</td>
                                        <td style={{ textAlign: 'center', color: COLORS.textMuted }}>{h.transp}</td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <div style={{
                                                    flex: 1,
                                                    height: '6px',
                                                    background: COLORS.gridLine,
                                                    borderRadius: '3px',
                                                    overflow: 'hidden',
                                                }}>
                                                    <div style={{
                                                        width: `${h.pctLocal}%`,
                                                        height: '100%',
                                                        background: COLORS.primary,
                                                        borderRadius: '3px',
                                                        transition: 'width 0.3s',
                                                    }} />
                                                </div>
                                                <span style={{ fontSize: '12px', fontWeight: 500, color: COLORS.textMuted, minWidth: '36px' }}>
                                                    {h.pctLocal}%
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div style={{ textAlign: 'center', color: COLORS.secondary, padding: '24px' }}>Sem dados no período</div>
                )}
            </div>

            {/* Section 6: HUB × Carrier matrix */}
            <div style={sectionStyle}>
                <h3 style={{ margin: '0 0 16px', fontSize: '14px', fontWeight: 600, color: COLORS.text }}>
                    Desempenho por HUB × Transportadora
                </h3>
                {matrixData.hubs.length > 0 ? (
                    <div style={{ overflowX: 'auto' }}>
                        <table className="table" style={{ minWidth: '500px' }}>
                            <thead>
                                <tr>
                                    <th style={{ textAlign: 'left' }}></th>
                                    {matrixData.carriers.map(c => (
                                        <th key={c} style={{ textAlign: 'center', fontSize: '12px' }}>{c}</th>
                                    ))}
                                    <th style={{ textAlign: 'center', fontWeight: 700 }}>Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {matrixData.hubs.map(hub => {
                                    const hubTotal = Object.values(matrixData.data[hub]).reduce((s, v) => s + v, 0);
                                    return (
                                        <tr key={hub}>
                                            <td style={{ fontWeight: 600, whiteSpace: 'nowrap', color: COLORS.primary }}>{hub}</td>
                                            {matrixData.carriers.map(c => (
                                                <td key={c} style={{ textAlign: 'center', color: matrixData.data[hub][c] ? COLORS.primary : COLORS.secondary }}>
                                                    {matrixData.data[hub][c] || '-'}
                                                </td>
                                            ))}
                                            <td style={{ textAlign: 'center', fontWeight: 600, color: COLORS.text }}>{hubTotal}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div style={{ textAlign: 'center', color: COLORS.secondary, padding: '24px' }}>Sem dados no período</div>
                )}
            </div>
        </div>
    );
}
