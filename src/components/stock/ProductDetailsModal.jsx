/**
 * ProductDetailsModal.jsx — Modal unificado de detalhes do produto.
 *
 * Restaura o fluxo pré-redesign (commit 3818ab9): clicar no produto
 * abre um modal com dados + histórico integrados em uma única ação.
 *
 * Fechamento: 3 formas equivalentes → backdrop click, tecla ESC,
 * botão X. Focus trap manual mantém Tab dentro do modal.
 *
 * Paleta nova aplicada (lucide-icons via utils/icons + paleta Orne).
 *
 * Props
 *  - product: produto completo do estoque
 *  - entries / exits: fonte para admin (via useEntries/useExits)
 *  - equipeHistoryCache, needsLazyHistory, isLoadingHistory: lazy-fetch
 *    reaproveitado para equipe/operador
 *  - isStockAdmin, isEquipe, isOperador: flags de permissão
 *  - canSeeSupplierClient: controla render da coluna Fornecedor/Cliente
 *  - nfsComDefeito: array de { nf, descricao, data } extraído do produto
 *  - tinySyncLoading: id do produto sincronizando (spinner)
 *  - onClose / onEdit / onDelete / onTinySync: handlers
 *  - formatDate, formatBRL, getCategoryName, getCategoryColor: helpers
 *    passados de fora para não duplicar lógica.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/utils/icons';

const HISTORY_INITIAL_LIMIT = 20;
const HISTORY_LOAD_STEP = 20;

export default function ProductDetailsModal({
    product,
    // lazy-fetch state
    equipeHistoryCache,
    needsLazyHistory,
    // perm flags
    isStockAdmin,
    isEquipe,
    isOperador,
    canSeeSupplierClient,
    // data helpers (injected; mesma fonte do StockView)
    getProductHistory,
    getNfBalance,
    nfsComDefeito = [],
    formatDate,
    formatBRL,
    getCategoryName,
    getCategoryColor,
    // actions
    tinySyncLoading,
    onClose,
    onEdit,
    onDelete,
    onTinySync,
}) {
    const modalRef = useRef(null);
    const [historyLimit, setHistoryLimit] = useState(HISTORY_INITIAL_LIMIT);

    if (!product) return null;

    const isHistoryLoading = needsLazyHistory && !equipeHistoryCache?.[product.sku];
    const fullHistory = !isHistoryLoading ? getProductHistory(product.sku) : [];
    const visibleHistory = fullHistory.slice(0, historyLimit);
    const hasMoreHistory = fullHistory.length > historyLimit;
    const nfsComSaldo = canSeeSupplierClient ? getNfBalance(product.sku) : [];

    // ── ESC + focus trap manual ─────────────────────────────────────────
    useEffect(() => {
        const modal = modalRef.current;
        if (!modal) return;

        const getFocusables = () => {
            const list = modal.querySelectorAll(
                'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])'
            );
            return Array.from(list).filter((el) => !el.hasAttribute('disabled'));
        };

        // Foco inicial no botão X (primeiro focusable logicamente)
        const focusables = getFocusables();
        const first = focusables[0];
        const prevActive = document.activeElement;
        first?.focus();

        const onKey = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
                return;
            }
            if (e.key !== 'Tab') return;
            const current = getFocusables();
            if (current.length === 0) return;
            const a = current[0];
            const b = current[current.length - 1];
            if (e.shiftKey && document.activeElement === a) {
                e.preventDefault();
                b.focus();
            } else if (!e.shiftKey && document.activeElement === b) {
                e.preventDefault();
                a.focus();
            }
        };

        window.addEventListener('keydown', onKey);
        // Bloquear scroll de fundo
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        return () => {
            window.removeEventListener('keydown', onKey);
            document.body.style.overflow = prevOverflow;
            // Restaura foco anterior (linha do produto) ao desmontar
            if (prevActive && typeof prevActive.focus === 'function') {
                try { prevActive.focus(); } catch { /* noop */ }
            }
        };
    }, [onClose]);

    // ── Botões do rodapé conforme permissões ────────────────────────────
    // Admin: Excluir | (spacer) | Atualizar Tiny | Fechar | Editar
    // Operador: Fechar | Editar   (sem Excluir, sem Atualizar Tiny)
    // Equipe: Fechar
    const canEdit = isStockAdmin || isOperador;
    const canDelete = isStockAdmin;
    const canTinySync = isStockAdmin && !!product.sku;

    const categoryName = getCategoryName ? getCategoryName(product.category) : product.category;
    const categoryColor = getCategoryColor ? getCategoryColor(product.category) : '#6B7280';

    return (
        <div
            className="modal-overlay"
            onClick={onClose}
            role="button"
            tabIndex={-1}
            aria-label="Fechar detalhes"
        >
            <div
                className="modal-content product-details-modal"
                ref={modalRef}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="pd-modal-title"
                style={{
                    maxWidth: '720px',
                    width: '95%',
                    maxHeight: '90vh',
                    overflowY: 'auto',
                    padding: 0,
                }}
            >
                {/* ── Cabeçalho ───────────────────────────────────────── */}
                <header
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: '16px',
                        padding: '24px 24px 16px',
                        borderBottom: '1px solid #E5E7EB',
                    }}
                >
                    <div style={{ minWidth: 0, flex: 1 }}>
                        <h2
                            id="pd-modal-title"
                            style={{
                                margin: 0,
                                fontSize: '20px',
                                fontWeight: 700,
                                color: '#1E1E1E',
                                lineHeight: 1.3,
                            }}
                        >
                            {product.name}
                        </h2>
                        <div
                            style={{
                                marginTop: '6px',
                                fontSize: '13px',
                                color: '#b4b4b4',
                                display: 'flex',
                                gap: '12px',
                                flexWrap: 'wrap',
                            }}
                        >
                            <span>
                                SKU <strong style={{ color: 'var(--text-secondary)' }}>{product.sku}</strong>
                            </span>
                            {product.ean && (
                                <span>
                                    EAN <strong style={{ color: 'var(--text-secondary)' }}>{product.ean}</strong>
                                </span>
                            )}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Fechar"
                        title="Fechar"
                        style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '6px',
                            borderRadius: '6px',
                            color: '#6B7280',
                            lineHeight: 0,
                            flexShrink: 0,
                        }}
                    >
                        <Icon name="close" size={20} />
                    </button>
                </header>

                {/* ── Grid principal: imagem + dados ─────────────────── */}
                <div className="pd-main-grid" style={{ padding: '20px 24px' }}>
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'minmax(140px, 160px) 1fr',
                            gap: '20px',
                            alignItems: 'start',
                        }}
                        className="pd-grid-inner"
                    >
                        {/* Imagem */}
                        <div
                            style={{
                                width: '100%',
                                aspectRatio: '1 / 1',
                                borderRadius: '8px',
                                border: '1px solid #E5E7EB',
                                background: '#fff',
                                overflow: 'hidden',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            {product.imagemUrl && product.imagemUrl !== 'sem-imagem' ? (
                                <img
                                    src={product.imagemUrl}
                                    alt={product.name}
                                    loading="lazy"
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                            ) : (
                                <Icon name="boxOpen" size={48} style={{ opacity: 0.25 }} />
                            )}
                        </div>

                        {/* Dados */}
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 1fr',
                                gap: '12px 20px',
                                fontSize: '14px',
                            }}
                            className="pd-data-grid"
                        >
                            <Field label="Categoria">
                                {categoryName ? (
                                    <span
                                        style={{
                                            display: 'inline-block',
                                            padding: '3px 10px',
                                            borderRadius: '12px',
                                            fontSize: '12px',
                                            fontWeight: 500,
                                            background: categoryColor + '22',
                                            color: categoryColor,
                                            border: `1px solid ${categoryColor}44`,
                                        }}
                                    >
                                        {categoryName}
                                    </span>
                                ) : (
                                    <span style={{ color: '#b4b4b4' }}>—</span>
                                )}
                            </Field>
                            <Field label="Estoque">
                                <span
                                    style={{
                                        fontWeight: 700,
                                        fontSize: '16px',
                                        color:
                                            product.currentQuantity > 0
                                                ? '#39845f'
                                                : '#893030',
                                    }}
                                >
                                    {product.currentQuantity ?? 0} un
                                </span>
                            </Field>
                            <Field label="Preço">
                                {product.unitPrice > 0 && formatBRL
                                    ? `R$ ${formatBRL(product.unitPrice)}`
                                    : <span style={{ color: '#b4b4b4' }}>—</span>}
                            </Field>
                            <Field label="Estoque mínimo">{product.minStock ?? 3}</Field>
                            <Field label="Local" span={2}>
                                {product.local ? (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                        <Icon name="mapPin" size={14} /> {product.local}
                                    </span>
                                ) : (
                                    <span style={{ color: '#b4b4b4' }}>—</span>
                                )}
                            </Field>
                            {product.observations && (
                                <Field label="Observações" span={2}>
                                    <span style={{ color: 'var(--text-secondary)' }}>
                                        {product.observations}
                                    </span>
                                </Field>
                            )}
                            {product.defeito && (
                                <Field label="Defeito" span={2}>
                                    <span
                                        style={{
                                            display: 'inline-block',
                                            padding: '3px 10px',
                                            borderRadius: '12px',
                                            fontSize: '12px',
                                            fontWeight: 600,
                                            background: 'rgba(137,48,48,0.20)',
                                            color: '#893030',
                                        }}
                                    >
                                        Produto com defeito
                                    </span>
                                    {product.defeitoDescricao && (
                                        <div
                                            style={{
                                                marginTop: '4px',
                                                fontSize: '12px',
                                                color: '#893030',
                                            }}
                                        >
                                            {product.defeitoDescricao}
                                        </div>
                                    )}
                                </Field>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── Defeitos por NF ──────────────────────────────────── */}
                {nfsComDefeito && nfsComDefeito.length > 0 && (
                    <section
                        style={{
                            padding: '16px 24px',
                            borderTop: '1px solid #E5E7EB',
                        }}
                    >
                        <h3
                            style={{
                                margin: '0 0 12px',
                                fontSize: '14px',
                                fontWeight: 600,
                                color: '#1E1E1E',
                            }}
                        >
                            Defeitos por NF
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {nfsComDefeito.map((d, i) => (
                                <div
                                    key={i}
                                    style={{
                                        padding: '10px 12px',
                                        background: 'rgba(137,48,48,0.10)',
                                        border: '1px solid rgba(137,48,48,0.20)',
                                        borderRadius: '8px',
                                        fontSize: '13px',
                                    }}
                                >
                                    <div
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'baseline',
                                            gap: '12px',
                                            marginBottom: d.descricao ? '4px' : 0,
                                        }}
                                    >
                                        <span style={{ fontWeight: 600, color: '#893030' }}>
                                            NF {d.nf || '—'}
                                        </span>
                                        {d.data && (
                                            <span style={{ fontSize: '11px', color: '#b4b4b4' }}>
                                                {formatDate ? formatDate(d.data) : d.data}
                                            </span>
                                        )}
                                    </div>
                                    {d.descricao && (
                                        <div style={{ color: '#6B7280' }}>{d.descricao}</div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* ── NF balance (apenas admin) ────────────────────────── */}
                {canSeeSupplierClient && nfsComSaldo && nfsComSaldo.length > 0 && (
                    <section
                        style={{
                            padding: '16px 24px',
                            borderTop: '1px solid #E5E7EB',
                        }}
                    >
                        <h3
                            style={{
                                margin: '0 0 12px',
                                fontSize: '14px',
                                fontWeight: 600,
                                color: '#1E1E1E',
                            }}
                        >
                            Estoque por NF de entrada
                        </h3>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {nfsComSaldo.map(([nf, dados]) => (
                                <div
                                    key={nf}
                                    style={{
                                        background: '#fff',
                                        border: '1px solid #E5E7EB',
                                        padding: '6px 12px',
                                        borderRadius: '8px',
                                        fontSize: '12px',
                                    }}
                                >
                                    <strong>NF {nf === 'SEM_NF' ? '(sem NF)' : nf}:</strong>{' '}
                                    {dados.entradas - dados.saidas} un.
                                    {dados.local && dados.local !== '-' && (
                                        <span
                                            style={{
                                                marginLeft: '6px',
                                                color: '#8c52ff',
                                                fontSize: '11px',
                                            }}
                                        >
                                            {dados.local}
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* ── Histórico ────────────────────────────────────────── */}
                <section
                    style={{
                        padding: '16px 24px',
                        borderTop: '1px solid #E5E7EB',
                    }}
                >
                    <h3
                        style={{
                            margin: '0 0 12px',
                            fontSize: '14px',
                            fontWeight: 600,
                            color: '#1E1E1E',
                        }}
                    >
                        Histórico de movimentações
                    </h3>

                    {isHistoryLoading ? (
                        <div
                            style={{
                                padding: '32px 16px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                color: 'var(--text-secondary)',
                                fontSize: '13px',
                            }}
                        >
                            <Icon
                                name="spinner"
                                size={14}
                                style={{ animation: 'spin 1s linear infinite' }}
                            />
                            Carregando histórico...
                        </div>
                    ) : fullHistory.length === 0 ? (
                        <div
                            style={{
                                padding: '24px 16px',
                                textAlign: 'center',
                                color: '#b4b4b4',
                                fontSize: '13px',
                            }}
                        >
                            Nenhuma movimentação registrada
                        </div>
                    ) : (
                        <>
                            <div className="table-container" style={{ border: '1px solid #E5E7EB', borderRadius: '8px', overflow: 'hidden' }}>
                                <table className="table" style={{ marginBottom: 0 }}>
                                    <thead>
                                        <tr>
                                            <th>Data</th>
                                            <th>Tipo</th>
                                            <th>Qtd</th>
                                            <th>NF Entrada</th>
                                            <th>NF Saída</th>
                                            {canSeeSupplierClient && <th>Fornecedor/Cliente</th>}
                                            <th>Obs.</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {visibleHistory.map((mov, idx) => {
                                            const isEntrada = mov.movimento === 'ENTRADA';
                                            return (
                                                <tr key={idx}>
                                                    <td
                                                        style={{
                                                            fontSize: '11px',
                                                            whiteSpace: 'nowrap',
                                                        }}
                                                    >
                                                        {formatDate ? formatDate(mov.date) : mov.date}
                                                    </td>
                                                    <td>
                                                        <span
                                                            style={{
                                                                display: 'inline-block',
                                                                padding: '2px 10px',
                                                                borderRadius: '12px',
                                                                fontSize: '10px',
                                                                fontWeight: 600,
                                                                background: isEntrada
                                                                    ? 'rgba(57,132,95,0.15)'
                                                                    : 'rgba(137,48,48,0.15)',
                                                                color: isEntrada ? '#39845f' : '#893030',
                                                            }}
                                                        >
                                                            {mov.movimento}
                                                        </span>
                                                    </td>
                                                    <td
                                                        style={{
                                                            fontWeight: 600,
                                                            color: isEntrada ? '#39845f' : '#893030',
                                                        }}
                                                    >
                                                        {isEntrada ? '+' : '-'}
                                                        {mov.quantity}
                                                    </td>
                                                    <td style={{ fontFamily: 'monospace', fontSize: '11px' }}>
                                                        {isEntrada ? mov.nf || '-' : mov.nfOrigem || '-'}
                                                    </td>
                                                    <td style={{ fontFamily: 'monospace', fontSize: '11px' }}>
                                                        {!isEntrada ? mov.nf || '-' : '-'}
                                                    </td>
                                                    {canSeeSupplierClient && (
                                                        <td style={{ fontSize: '12px' }}>
                                                            {mov.supplier || mov.client || '-'}
                                                        </td>
                                                    )}
                                                    <td
                                                        style={{
                                                            fontSize: '11px',
                                                            color: 'var(--text-muted)',
                                                            maxWidth: '200px',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap',
                                                        }}
                                                    >
                                                        {mov.observations || mov.defeitoDescricao || '-'}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            {hasMoreHistory && (
                                <div style={{ marginTop: '12px', textAlign: 'center' }}>
                                    <button
                                        type="button"
                                        className="btn btn-secondary"
                                        onClick={() =>
                                            setHistoryLimit((n) => n + HISTORY_LOAD_STEP)
                                        }
                                        style={{ fontSize: '12px' }}
                                    >
                                        Carregar mais ({fullHistory.length - historyLimit} restantes)
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </section>

                {/* ── Rodapé com ações ─────────────────────────────────── */}
                <footer
                    className="pd-footer"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '16px 24px',
                        borderTop: '1px solid #E5E7EB',
                        background: '#FAFAFA',
                        borderBottomLeftRadius: '8px',
                        borderBottomRightRadius: '8px',
                        flexWrap: 'wrap',
                    }}
                >
                    {canDelete && (
                        <button
                            type="button"
                            onClick={() => onDelete?.(product)}
                            className="btn btn-secondary"
                            style={{
                                color: '#893030',
                                borderColor: '#893030',
                                fontSize: '13px',
                            }}
                        >
                            <Icon name="delete" size={14} /> Excluir
                        </button>
                    )}
                    <div style={{ flex: 1 }} />
                    {canTinySync && (
                        <button
                            type="button"
                            onClick={() => onTinySync?.(product)}
                            disabled={tinySyncLoading === product.id}
                            className="btn btn-secondary"
                            style={{ fontSize: '13px' }}
                        >
                            {tinySyncLoading === product.id ? (
                                <>
                                    <Icon
                                        name="spinner"
                                        size={14}
                                        style={{ animation: 'spin 1s linear infinite' }}
                                    />{' '}
                                    Atualizando...
                                </>
                            ) : (
                                <>
                                    <Icon name="sync" size={14} /> Atualizar do Tiny
                                </>
                            )}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onClose}
                        className="btn btn-secondary"
                        style={{ fontSize: '13px' }}
                    >
                        Fechar
                    </button>
                    {canEdit && (
                        <button
                            type="button"
                            onClick={() => onEdit?.(product)}
                            className="btn btn-primary"
                            style={{
                                background: '#8c52ff',
                                borderColor: '#8c52ff',
                                fontSize: '13px',
                            }}
                        >
                            <Icon name="edit" size={14} /> Editar
                        </button>
                    )}
                </footer>
            </div>
        </div>
    );
}

function Field({ label, span = 1, children }) {
    return (
        <div style={{ gridColumn: `span ${span}`, minWidth: 0 }}>
            <div
                style={{
                    fontSize: '11px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: '#b4b4b4',
                    fontWeight: 600,
                    marginBottom: '4px',
                }}
            >
                {label}
            </div>
            <div style={{ fontSize: '14px', color: '#1E1E1E' }}>{children}</div>
        </div>
    );
}
