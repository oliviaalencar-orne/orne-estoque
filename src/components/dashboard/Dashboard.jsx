/**
 * Dashboard.jsx — Main dashboard with stats, charts, and analytics
 *
 * Extracted from index-legacy.html L3083-3827
 * Uses Chart.js directly via useRef+useEffect (NOT react-chartjs-2)
 */
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Chart } from 'chart.js/auto';
import { Icon, CategoryIcon } from '@/utils/icons';
import { formatBRL } from '@/utils/formatters';

export default function Dashboard({ stock, categories, isVisible, entries, exits, onNavigate }) {
    // Loading state enquanto produtos ainda nao carregaram
    if (stock.length === 0) {
        return (
            <div style={{ padding: '60px 20px', textAlign: 'center' }}>
                <div style={{
                    width: '28px', height: '28px',
                    border: '2.5px solid var(--border-default)',
                    borderTopColor: 'var(--accent-primary)',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                    margin: '0 auto 12px'
                }} />
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: 0 }}>Carregando dashboard...</p>
            </div>
        );
    }

    const chartRef = useRef(null);
    const lineChartRef = useRef(null);
    const chartInstance = useRef(null);
    const lineChartInstance = useRef(null);
    const [period, setPeriod] = useState(30);

    // === Calculos memoizados do estoque ===
    const stockStats = useMemo(() => {
        const totalQty = stock.reduce((s, p) => s + p.currentQuantity, 0);
        const emptyStock = stock.filter(p => p.status === 'empty').length;
        const okStock = stock.filter(p => p.status === 'ok').length;
        const topProducts = [...stock].sort((a, b) => b.currentQuantity - a.currentQuantity).slice(0, 5);
        const alertProducts = stock.filter(p => p.status === 'empty').slice(0, 5);
        const totalValue = stock.reduce((sum, p) => sum + ((p.unitPrice || 0) * (p.currentQuantity || 0)), 0);
        return { totalQty, totalProducts: stock.length, emptyStock, okStock, topProducts, alertProducts, totalValue };
    }, [stock]);
    const { totalQty, totalProducts, emptyStock, okStock, topProducts, alertProducts, totalValue } = stockStats;

    // Hora atual para saudacao
    const hora = new Date().getHours();
    const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';

    const categoryStats = useMemo(() => categories.map(cat => {
        const catProducts = stock.filter(p => p.category === cat.id);
        return {
            ...cat,
            productCount: catProducts.length,
            totalStock: catProducts.reduce((sum, p) => sum + (p.currentQuantity || 0), 0),
            alertCount: catProducts.filter(p => p.status === 'empty').length
        };
    }), [stock, categories]);

    // === Calculos baseados em periodo (memoizados) ===
    const periodStats = useMemo(() => {
        const periodCutoff = new Date();
        periodCutoff.setDate(periodCutoff.getDate() - period);
        const periodCutoffISO = periodCutoff.toISOString();
        const periodEntries = (entries || []).filter(e => e.date >= periodCutoffISO);
        const periodExits = (exits || []).filter(e => e.date >= periodCutoffISO);
        const totalExitsInPeriod = periodExits.reduce((sum, e) => sum + parseInt(e.quantity || 0), 0);
        const giroEstoque = totalExitsInPeriod / Math.max(totalQty, 1);
        return { periodEntries, periodExits, totalExitsInPeriod, giroEstoque };
    }, [entries, exits, period, totalQty]);
    const { periodEntries, periodExits, totalExitsInPeriod, giroEstoque } = periodStats;

    // === Produtos parados (sem movimentacao em 60 dias) ===
    const stoppedProducts = useMemo(() => {
        const stoppedCutoff = new Date();
        stoppedCutoff.setDate(stoppedCutoff.getDate() - 60);
        const stoppedCutoffISO = stoppedCutoff.toISOString();
        const activeSKUs = new Set([
            ...(entries || []).filter(e => e.date >= stoppedCutoffISO).map(e => e.sku),
            ...(exits || []).filter(e => e.date >= stoppedCutoffISO).map(e => e.sku)
        ]);
        return stock.filter(p => !activeSKUs.has(p.sku));
    }, [stock, entries, exits]);

    // === Ultimas 5 movimentacoes ===
    const allMovements = useMemo(() => [
        ...(entries || []).map(e => ({ ...e, movType: 'entry' })),
        ...(exits || []).map(e => ({ ...e, movType: 'exit' }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5), [entries, exits]);

    // === Valor por categoria ===
    const categoryValues = useMemo(() => categories.map(cat => {
        const catProducts = stock.filter(p => p.category === cat.id);
        const value = catProducts.reduce((sum, p) => sum + ((p.unitPrice || 0) * (p.currentQuantity || 0)), 0);
        return { ...cat, value };
    }).filter(c => c.value > 0).sort((a, b) => b.value - a.value), [stock, categories]);

    // === Helper: agregar movimentacoes por dia ===
    const aggregateByDay = (items, days) => {
        const result = {};
        const now = new Date();
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            result[d.toISOString().slice(0, 10)] = 0;
        }
        items.forEach(item => {
            const key = item.date?.slice(0, 10);
            if (key && result[key] !== undefined) {
                result[key] += parseInt(item.quantity || 0);
            }
        });
        return result;
    };

    // Memoizar dados do chart para evitar recriacao desnecessaria
    const barChartData = useMemo(() => {
        if (stock.length === 0) return null;
        const top8 = [...stock].sort((a, b) => b.currentQuantity - a.currentQuantity).slice(0, 8);
        return {
            labels: top8.map(p => p.name.length > 15 ? p.name.substring(0, 15) + '...' : p.name),
            data: top8.map(p => p.currentQuantity)
        };
    }, [stock]);

    useEffect(() => {
        // Grafico de barras — so cria quando tab visivel (canvas precisa ter dimensoes)
        if (!isVisible || !chartRef.current || !barChartData) return;

        // Se chart ja existe, apenas atualizar dados (sem recriar = sem flicker)
        if (chartInstance.current) {
            chartInstance.current.data.labels = barChartData.labels;
            chartInstance.current.data.datasets[0].data = barChartData.data;
            chartInstance.current.update('none'); // 'none' = sem animacao
            return;
        }

        chartInstance.current = new Chart(chartRef.current, {
            type: 'bar',
            data: {
                labels: barChartData.labels,
                datasets: [{
                    data: barChartData.data,
                    backgroundColor: '#F4B08A',
                    borderRadius: 6,
                    barThickness: 28
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#2C2640',
                        titleFont: { size: 12, weight: '600' },
                        bodyFont: { size: 11 },
                        padding: 12,
                        cornerRadius: 8
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: '#F3F0EC', drawBorder: false },
                        ticks: { font: { size: 11, family: 'Inter' }, color: '#7A7585' }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { font: { size: 10, family: 'Inter' }, color: '#7A7585' }
                    }
                }
            }
        });

        return () => {
            if (chartInstance.current) {
                chartInstance.current.destroy();
                chartInstance.current = null;
            }
        };
    }, [barChartData, isVisible]);

    // Memoizar dados do grafico de linhas
    const lineChartData = useMemo(() => {
        if (!entries?.length && !exits?.length) return null;
        const entryAgg = aggregateByDay(entries || [], period);
        const exitAgg = aggregateByDay(exits || [], period);
        const labels = Object.keys(entryAgg).map(d => {
            const [, m, day] = d.split('-');
            return `${day}/${m}`;
        });
        return { labels, entryData: Object.values(entryAgg), exitData: Object.values(exitAgg) };
    }, [entries, exits, period]);

    // Grafico de linhas — movimentacoes por dia
    useEffect(() => {
        if (!isVisible || !lineChartRef.current || !lineChartData) return;

        // Se chart ja existe, apenas atualizar dados
        if (lineChartInstance.current) {
            lineChartInstance.current.data.labels = lineChartData.labels;
            lineChartInstance.current.data.datasets[0].data = lineChartData.entryData;
            lineChartInstance.current.data.datasets[1].data = lineChartData.exitData;
            lineChartInstance.current.update('none');
            return;
        }

        const rootStyles = getComputedStyle(document.documentElement);
        const successColor = rootStyles.getPropertyValue('--accent-success').trim() || '#22c55e';
        const errorColor = rootStyles.getPropertyValue('--accent-error').trim() || '#ef4444';
        const gridColor = rootStyles.getPropertyValue('--border-default').trim() || '#e5e5e5';
        const textColor = rootStyles.getPropertyValue('--text-tertiary').trim() || '#999';

        lineChartInstance.current = new Chart(lineChartRef.current, {
            type: 'line',
            data: {
                labels: lineChartData.labels,
                datasets: [
                    {
                        label: 'Entradas',
                        data: lineChartData.entryData,
                        borderColor: successColor,
                        backgroundColor: successColor + '18',
                        fill: true,
                        tension: 0.3,
                        borderWidth: 2,
                        pointRadius: 0,
                        pointHoverRadius: 4,
                        pointHoverBackgroundColor: successColor
                    },
                    {
                        label: 'Saidas',
                        data: lineChartData.exitData,
                        borderColor: errorColor,
                        backgroundColor: errorColor + '18',
                        fill: true,
                        tension: 0.3,
                        borderWidth: 2,
                        pointRadius: 0,
                        pointHoverRadius: 4,
                        pointHoverBackgroundColor: errorColor
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        align: 'end',
                        labels: {
                            boxWidth: 12, boxHeight: 12, borderRadius: 3, useBorderRadius: true,
                            font: { size: 11, family: 'Inter' },
                            color: textColor,
                            padding: 16
                        }
                    },
                    tooltip: {
                        backgroundColor: '#2C2640',
                        titleFont: { size: 12, weight: '600' },
                        bodyFont: { size: 11 },
                        padding: 12,
                        cornerRadius: 8
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: gridColor, drawBorder: false },
                        ticks: { font: { size: 11, family: 'Inter' }, color: textColor }
                    },
                    x: {
                        grid: { display: false },
                        ticks: {
                            font: { size: 10, family: 'Inter' },
                            color: textColor,
                            maxTicksLimit: period <= 15 ? period : 10
                        }
                    }
                }
            }
        });

        return () => {
            if (lineChartInstance.current) {
                lineChartInstance.current.destroy();
                lineChartInstance.current = null;
            }
        };
    }, [lineChartData, isVisible]);

    return (
        <div>
            {/* Header com Saudacao */}
            <div className="page-header" style={{marginBottom: '32px'}}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
                    <div>
                        <p style={{fontSize: '14px', color: 'var(--text-muted)', marginBottom: '4px'}}>
                            {saudacao}!
                        </p>
                        <h1 className="page-title">Dashboard</h1>
                        <p className="page-subtitle">Visao geral do seu estoque em tempo real</p>
                    </div>
                    <div style={{display: 'flex', gap: '12px'}}>
                        <div style={{
                            background: 'var(--bg-secondary)',
                            padding: '10px 16px',
                            borderRadius: 'var(--radius-lg)',
                            fontSize: '13px',
                            color: 'var(--text-secondary)',
                            boxShadow: 'var(--shadow-card)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}>
                            {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short' })}
                        </div>
                    </div>
                </div>
            </div>

            {/* Cards de Estatisticas */}
            <div className="stats-grid">
                <div className="stat-card accent">
                    <div className="stat-header">
                        <div className="stat-icon" style={{background: 'rgba(255,255,255,0.2)'}}><Icon name="stock" size={18} /></div>
                    </div>
                    <div className="stat-content">
                        <div className="stat-value">{totalQty.toLocaleString('pt-BR')}</div>
                        <div className="stat-label">Unidades em Estoque</div>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-header">
                        <div className="stat-icon purple"><Icon name="categories" size={18} /></div>
                    </div>
                    <div className="stat-content">
                        <div className="stat-value">{totalProducts}</div>
                        <div className="stat-label">Produtos Cadastrados</div>
                    </div>
                </div>

                <div className="stat-card danger">
                    <div className="stat-header">
                        <div className="stat-icon red"><Icon name="error" size={18} /></div>
                    </div>
                    <div className="stat-content">
                        <div className="stat-value">{emptyStock}</div>
                        <div className="stat-label">Sem Estoque</div>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-header">
                        <div className="stat-icon green"><Icon name="dollar" size={18} /></div>
                    </div>
                    <div className="stat-content">
                        <div className="stat-value" style={{fontSize: totalValue >= 100000 ? '22px' : '28px'}}>
                            {totalValue > 0 ? `R$ ${formatBRL(totalValue)}` : 'R$ 0,00'}
                        </div>
                        <div className="stat-label">
                            {totalValue > 0 ? 'Valor Total em Estoque' : 'Nenhum preco sincronizado via Tiny'}
                        </div>
                    </div>
                </div>
            </div>

            {/* Grid Principal */}
            <div className="dashboard-main-grid">
                {/* Grafico de Barras */}
                <div className="card">
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px'}}>
                        <h2 className="card-title" style={{marginBottom: 0}}>
                            <span className="card-title-icon">{'\u25A5'}</span>
                            Produtos com Maior Estoque
                        </h2>
                    </div>
                    <div style={{height: '280px'}}>
                        <canvas ref={chartRef}></canvas>
                    </div>
                </div>

                {/* Lista de Alertas */}
                <div className="card">
                    <h2 className="card-title" style={{marginBottom: '20px'}}>
                        <Icon name="warning" size={16} className="card-title-icon" />
                        Acoes Pendentes
                    </h2>

                    {alertProducts.length === 0 ? (
                        <div style={{
                            textAlign: 'center',
                            padding: '40px 20px',
                            color: 'var(--text-tertiary)'
                        }}>
                            <div style={{marginBottom: '12px'}}><Icon name="check" size={40} /></div>
                            <div style={{fontSize: '14px'}}>Tudo em ordem!</div>
                            <div style={{fontSize: '12px', marginTop: '4px', color: 'var(--text-tertiary)'}}>
                                Nenhum produto com estoque critico
                            </div>
                        </div>
                    ) : (
                        <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
                            {alertProducts.map((p, idx) => (
                                <div key={idx} style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px',
                                    padding: '12px',
                                    background: 'var(--bg-secondary)',
                                    border: '1px solid var(--border-default)',
                                    borderRadius: 'var(--radius)'
                                }}>
                                    <div style={{
                                        width: '32px',
                                        height: '32px',
                                        borderRadius: 'var(--radius)',
                                        background: 'var(--accent-error-subtle)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: 'var(--accent-error)'
                                    }}>
                                        <Icon name="error" size={14} />
                                    </div>
                                    <div style={{flex: 1, minWidth: 0}}>
                                        <div style={{
                                            fontSize: '13px',
                                            fontWeight: '500',
                                            color: 'var(--text-primary)',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis'
                                        }}>
                                            {p.name}
                                        </div>
                                        <div style={{fontSize: '12px', color: 'var(--text-tertiary)'}}>
                                            Sem estoque
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {emptyStock > 5 && (
                                <div style={{
                                    textAlign: 'center',
                                    marginTop: '4px',
                                    fontSize: '12px',
                                    color: 'var(--text-tertiary)'
                                }}>
                                    +{emptyStock - 5} outros produtos
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Movimentacoes */}
            <div className="card">
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px'}}>
                    <h2 className="card-title" style={{marginBottom: 0}}>
                        <Icon name="chart" size={16} className="card-title-icon" />
                        Movimentacoes
                    </h2>
                    <div className="period-toggle">
                        {[7, 15, 30, 90].map(d => (
                            <button key={d} className={`period-btn ${period === d ? 'active' : ''}`} onClick={() => setPeriod(d)}>
                                {d}d
                            </button>
                        ))}
                    </div>
                </div>
                {(entries?.length || exits?.length) ? (
                    <div style={{height: '280px'}}>
                        <canvas ref={lineChartRef}></canvas>
                    </div>
                ) : (
                    <div style={{textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)', fontSize: '13px'}}>
                        Nenhuma movimentacao registrada
                    </div>
                )}
            </div>

            {/* Metricas de Performance */}
            <div className="dashboard-analytics-grid">
                <div className="card" style={{marginBottom: 0}}>
                    <h2 className="card-title">
                        <Icon name="trendingUp" size={16} className="card-title-icon" />
                        Giro de Estoque
                    </h2>
                    <div style={{textAlign: 'center', padding: '16px 0'}}>
                        <div style={{fontSize: '36px', fontWeight: '700', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums'}}>
                            {giroEstoque.toFixed(2)}
                        </div>
                        <div style={{fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '4px'}}>
                            Saidas / Estoque atual em {period} dias
                        </div>
                    </div>
                </div>

                <div className="card" style={{marginBottom: 0}}>
                    <h2 className="card-title" style={{display: 'flex', alignItems: 'center'}}>
                        <Icon name="pause" size={16} className="card-title-icon" />
                        Produtos Parados
                        <span style={{marginLeft: 'auto', fontSize: '20px', fontWeight: '700', color: stoppedProducts.length > 0 ? 'var(--accent-warning)' : 'var(--accent-success)'}}>
                            {stoppedProducts.length}
                        </span>
                    </h2>
                    <div style={{fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '12px'}}>
                        Sem entradas ou saidas nos ultimos 60 dias
                    </div>
                    {stoppedProducts.length > 0 ? (
                        <div style={{display: 'flex', flexDirection: 'column', gap: '6px'}}>
                            {stoppedProducts.slice(0, 5).map((p, idx) => (
                                <div key={idx} style={{fontSize: '13px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', padding: '6px 10px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)'}}>
                                    {p.name}
                                </div>
                            ))}
                            {stoppedProducts.length > 5 && (
                                <div style={{fontSize: '12px', color: 'var(--text-tertiary)', textAlign: 'center', marginTop: '4px'}}>
                                    +{stoppedProducts.length - 5} outros
                                </div>
                            )}
                        </div>
                    ) : (
                        <div style={{textAlign: 'center', padding: '16px', color: 'var(--accent-success)', fontSize: '13px'}}>
                            Todos os produtos tiveram movimentacao recente
                        </div>
                    )}
                </div>
            </div>

            {/* Ultimas Movimentacoes + Valor por Categoria */}
            <div className="dashboard-analytics-grid" style={{marginTop: '4px'}}>
                <div className="card" style={{marginBottom: 0}}>
                    <h2 className="card-title">
                        <Icon name="history" size={16} className="card-title-icon" />
                        Ultimas Movimentacoes
                    </h2>
                    {allMovements.length > 0 ? (
                        <div className="table-container">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Data</th>
                                        <th>Tipo</th>
                                        <th>Produto</th>
                                        <th style={{textAlign: 'right'}}>Qtd</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {allMovements.map((m, idx) => {
                                        const product = stock.find(p => p.sku === m.sku);
                                        return (
                                            <tr key={idx} className="clickable-row" onClick={() => onNavigate && onNavigate('history')}>
                                                <td style={{whiteSpace: 'nowrap'}}>
                                                    {new Date(m.date).toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'})}
                                                    {' '}
                                                    <span style={{color: 'var(--text-tertiary)', fontSize: '11px'}}>
                                                        {new Date(m.date).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span className={`badge ${m.movType === 'entry' ? 'badge-success' : 'badge-danger'}`}>
                                                        {m.movType === 'entry' ? 'ENTRADA' : 'SAIDA'}
                                                    </span>
                                                </td>
                                                <td style={{maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                                                    {product?.name || m.sku}
                                                </td>
                                                <td style={{textAlign: 'right', fontWeight: '600', fontVariantNumeric: 'tabular-nums'}}>
                                                    {m.movType === 'entry' ? '+' : '-'}{m.quantity}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div style={{textAlign: 'center', padding: '32px', color: 'var(--text-tertiary)', fontSize: '13px'}}>
                            Nenhuma movimentacao registrada
                        </div>
                    )}
                </div>

                <div className="card" style={{marginBottom: 0}}>
                    <h2 className="card-title">
                        <Icon name="dollar" size={16} className="card-title-icon" />
                        Valor por Categoria
                    </h2>
                    {categoryValues.length > 0 ? (
                        <div style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
                            {categoryValues.map((cat) => {
                                const maxVal = categoryValues[0]?.value || 1;
                                const pct = (cat.value / maxVal) * 100;
                                return (
                                    <div key={cat.id} style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                                        <div style={{width: '28px', height: '28px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                                            <CategoryIcon icon={cat.icon} size={18} color={cat.color} />
                                        </div>
                                        <div style={{flex: 1, minWidth: 0}}>
                                            <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '4px'}}>
                                                <span style={{fontSize: '13px', fontWeight: '500', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                                                    {cat.name}
                                                </span>
                                                <span style={{fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', flexShrink: 0, marginLeft: '8px'}}>
                                                    R$ {formatBRL(cat.value)}
                                                </span>
                                            </div>
                                            <div style={{height: '4px', background: 'var(--border-default)', borderRadius: '2px', overflow: 'hidden'}}>
                                                <div style={{height: '100%', width: `${pct}%`, background: cat.color, borderRadius: '2px', transition: 'width 0.5s ease'}}></div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div style={{textAlign: 'center', padding: '32px', color: 'var(--text-tertiary)', fontSize: '13px'}}>
                            Sincronize os produtos via Tiny ERP para ver os valores
                        </div>
                    )}
                </div>
            </div>

            {/* Categorias */}
            <div className="card">
                <h2 className="card-title">
                    <Icon name="categories" size={16} className="card-title-icon" />
                    Estoque por Categoria
                </h2>
                <div className="category-grid">
                    {categoryStats.map(cat => (
                        <div key={cat.id} className="category-card">
                            <div className="category-icon" style={{background: `${cat.color}08`}}>
                                <CategoryIcon icon={cat.icon} size={20} color={cat.color} />
                            </div>
                            <div className="category-name">{cat.name}</div>
                            <div className="category-count">
                                {cat.totalStock.toLocaleString('pt-BR')}
                            </div>
                            <div className="category-meta">
                                {cat.productCount} produto{cat.productCount !== 1 ? 's' : ''}
                            </div>
                            {cat.alertCount > 0 && (
                                <div className="category-alert">
                                    {cat.alertCount} alerta{cat.alertCount !== 1 ? 's' : ''}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Top 5 Produtos */}
            <div className="card">
                <h2 className="card-title">
                    <span className="card-title-icon">{'\u25C6'}</span>
                    Top 5 Produtos em Estoque
                </h2>
                <div style={{display: 'flex', flexDirection: 'column', gap: '12px'}}>
                    {topProducts.map((p, idx) => {
                        const cat = categories.find(c => c.id === p.category);
                        const maxQty = topProducts[0]?.currentQuantity || 1;
                        const percentage = (p.currentQuantity / maxQty) * 100;

                        return (
                            <div key={idx} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '16px',
                                padding: '16px',
                                background: 'var(--bg-tertiary)',
                                borderRadius: 'var(--radius-lg)',
                                transition: 'var(--transition)'
                            }}>
                                <div style={{
                                    width: '36px',
                                    height: '36px',
                                    borderRadius: 'var(--radius)',
                                    background: idx === 0 ? 'var(--text-primary)' : 'var(--bg-tertiary)',
                                    color: idx === 0 ? 'white' : 'var(--text-tertiary)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: '700',
                                    fontSize: '13px'
                                }}>
                                    #{idx + 1}
                                </div>
                                <div style={{flex: 1, minWidth: 0}}>
                                    <div style={{
                                        fontWeight: '500',
                                        fontSize: '14px',
                                        marginBottom: '4px',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis'
                                    }}>
                                        {p.name}
                                    </div>
                                    <div style={{
                                        height: '4px',
                                        background: 'var(--border-default)',
                                        borderRadius: '2px',
                                        overflow: 'hidden'
                                    }}>
                                        <div style={{
                                            height: '100%',
                                            width: `${percentage}%`,
                                            background: idx === 0 ? 'var(--text-secondary)' : idx === 1 ? 'var(--text-tertiary)' : 'var(--border-strong)',
                                            borderRadius: '2px',
                                            transition: 'width 0.5s ease'
                                        }}></div>
                                    </div>
                                </div>
                                <div style={{textAlign: 'right'}}>
                                    <div style={{
                                        fontWeight: '700',
                                        fontSize: '20px',
                                        color: 'var(--text-primary)'
                                    }}>
                                        {p.currentQuantity.toLocaleString('pt-BR')}
                                    </div>
                                    <div style={{fontSize: '11px', color: 'var(--text-tertiary)'}}>
                                        unidades
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
