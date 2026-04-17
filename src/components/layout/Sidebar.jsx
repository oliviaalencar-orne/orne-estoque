/**
 * Sidebar.jsx — Collapsible graphite sidebar with groups (Fase 1 redesign)
 *
 * Responsibilities:
 *   - Desktop: collapsed (~60px) / expanded (~200px) with animated toggle
 *   - Mobile (< 1024px): full drawer slide-in (controlled via `open` prop)
 *   - Groups (Movimentações, Relatórios, Integrações, Administração) collapse/expand
 *   - Persists expanded + open-groups state in localStorage
 *
 * Preserves ALL existing navigation behavior: same activeTab values, same
 * permission gates, same handleTabChange. Only the visual shell changes.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Icon, ICONS } from '@/utils/icons';
import logoFull from '@/assets/logo-full.png';
import logoIcon from '@/assets/logo-icon.png';

const LS_EXPANDED = 'orne.sidebar.expanded';
const LS_GROUPS = 'orne.sidebar.groupsOpen';

function readLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}
function writeLS(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

// A raw SVG icon rendered via dangerouslySetInnerHTML, so we can accept the
// project's custom ICONS object without re-writing every <svg>
function RawIcon({ name, size = 18 }) {
  const svg = ICONS[name];
  if (!svg) return null;
  return (
    <span
      className="sb-icon"
      style={{ width: size, height: size, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export default function Sidebar({
  activeTab,
  onTabChange,
  user,
  userProfile,
  onLogout,
  isStockAdmin,
  isOperador,
  isEquipe,
  isSuperAdmin,
  mobileOpen = false,
  onCloseMobile = () => {},
}) {
  // Desktop expanded/collapsed state — persisted. Default: collapsed.
  const [expanded, setExpanded] = useState(() => readLS(LS_EXPANDED, false));
  // Per-group expanded state — persisted
  const [groupsOpen, setGroupsOpen] = useState(() => readLS(LS_GROUPS, {
    moves: true,
    reports: false,
    integrations: false,
    admin: false,
  }));

  useEffect(() => { writeLS(LS_EXPANDED, expanded); }, [expanded]);
  useEffect(() => { writeLS(LS_GROUPS, groupsOpen); }, [groupsOpen]);

  // Propagate expanded state to <body> so main-content margin can react via CSS
  useEffect(() => {
    const cls = 'sidebar-expanded';
    if (expanded) document.body.classList.add(cls);
    else document.body.classList.remove(cls);
    return () => document.body.classList.remove(cls);
  }, [expanded]);

  const toggleGroup = (key) => setGroupsOpen(prev => ({ ...prev, [key]: !prev[key] }));

  const handleItemClick = (tab) => {
    onTabChange(tab);
    // Close mobile drawer after navigation
    if (mobileOpen) onCloseMobile();
  };

  // Detect whether any child of a group is active (to visually mark the group)
  const isGroupActive = (tabs) => tabs.includes(activeTab);

  // Build menu structure based on permissions
  const movesTabs = useMemo(() => {
    const list = [];
    if (isStockAdmin) list.push({ tab: 'entry', label: 'Entrada', icon: 'entry' });
    if (isStockAdmin) list.push({ tab: 'exit', label: 'Saída', icon: 'exit' });
    list.push({ tab: 'separation', label: 'Separação', icon: 'clipboard' });
    list.push({ tab: 'shipping', label: 'Expedição', icon: 'shipping' });
    return list;
  }, [isStockAdmin]);

  const reportsTabs = useMemo(() => {
    const list = [];
    if (isStockAdmin || isOperador) list.push({ tab: 'history', label: 'Histórico', icon: 'history' });
    return list;
  }, [isStockAdmin, isOperador]);

  const integrationsTabs = useMemo(() => {
    const list = [];
    if (isStockAdmin) list.push({ tab: 'tiny', label: 'Tiny ERP', icon: 'tiny' });
    return list;
  }, [isStockAdmin]);

  const adminTabs = useMemo(() => {
    const list = [];
    if (isSuperAdmin) list.push({ tab: 'admin', label: 'Usuários', icon: 'user' });
    return list;
  }, [isSuperAdmin]);

  const showMoves = (isStockAdmin || isEquipe || isOperador) && movesTabs.length > 0;
  const showReports = reportsTabs.length > 0;
  const showIntegrations = integrationsTabs.length > 0;
  const showAdmin = adminTabs.length > 0;

  // Build className
  const cls = [
    'sb',
    expanded ? 'sb--expanded' : 'sb--collapsed',
    mobileOpen ? 'sb--mobile-open' : '',
  ].filter(Boolean).join(' ');

  const showLabels = expanded || mobileOpen;

  return (
    <>
      {/* Mobile overlay (click to close drawer) */}
      <div
        className={`sb-mobile-overlay ${mobileOpen ? 'visible' : ''}`}
        onClick={onCloseMobile}
        aria-hidden="true"
      />

      <aside className={cls} aria-label="Navegação principal">
        {/* Logo header */}
        <div className="sb-logo">
          <img
            src={showLabels ? logoFull : logoIcon}
            alt="Orne"
            className={showLabels ? 'sb-logo-full' : 'sb-logo-icon'}
          />
        </div>

        {/* Desktop toggle — hidden on mobile */}
        <button
          type="button"
          className="sb-toggle"
          onClick={() => setExpanded(v => !v)}
          aria-label={expanded ? 'Recolher menu' : 'Expandir menu'}
          title={expanded ? 'Recolher menu' : 'Expandir menu'}
        >
          <RawIcon name={expanded ? 'chevronLeft' : 'chevronRight'} size={14} />
        </button>

        {/* Role badge (only for operador/equipe, expanded mode) */}
        {showLabels && (isEquipe || isOperador) && (
          <div className="sb-role-badge">
            {isOperador ? 'Acesso: Operador' : 'Acesso: Consulta'}
          </div>
        )}

        {/* Nav list */}
        <nav className="sb-nav">
          <SidebarItem
            icon="dashboard" label="Dashboard"
            active={activeTab === 'dashboard'}
            onClick={() => handleItemClick('dashboard')}
            showLabel={showLabels}
          />
          <SidebarItem
            icon="stock" label="Estoque"
            active={activeTab === 'stock'}
            onClick={() => handleItemClick('stock')}
            showLabel={showLabels}
          />

          {showMoves && (
            <SidebarGroup
              id="moves" label="Movimentações" icon="arrowLeftRight"
              open={groupsOpen.moves}
              childActive={isGroupActive(movesTabs.map(t => t.tab))}
              onToggle={() => toggleGroup('moves')}
              showLabel={showLabels}
            >
              {movesTabs.map(t => (
                <SidebarItem
                  key={t.tab}
                  icon={t.icon} label={t.label}
                  active={activeTab === t.tab}
                  onClick={() => handleItemClick(t.tab)}
                  showLabel={showLabels}
                  nested
                />
              ))}
            </SidebarGroup>
          )}

          {showReports && (
            <SidebarGroup
              id="reports" label="Relatórios" icon="history"
              open={groupsOpen.reports}
              childActive={isGroupActive(reportsTabs.map(t => t.tab))}
              onToggle={() => toggleGroup('reports')}
              showLabel={showLabels}
            >
              {reportsTabs.map(t => (
                <SidebarItem
                  key={t.tab}
                  icon={t.icon} label={t.label}
                  active={activeTab === t.tab}
                  onClick={() => handleItemClick(t.tab)}
                  showLabel={showLabels}
                  nested
                />
              ))}
            </SidebarGroup>
          )}

          {showIntegrations && (
            <SidebarGroup
              id="integrations" label="Integrações" icon="plug"
              open={groupsOpen.integrations}
              childActive={isGroupActive(integrationsTabs.map(t => t.tab))}
              onToggle={() => toggleGroup('integrations')}
              showLabel={showLabels}
            >
              {integrationsTabs.map(t => (
                <SidebarItem
                  key={t.tab}
                  icon={t.icon} label={t.label}
                  active={activeTab === t.tab}
                  onClick={() => handleItemClick(t.tab)}
                  showLabel={showLabels}
                  nested
                />
              ))}
            </SidebarGroup>
          )}

          {showAdmin && (
            <SidebarGroup
              id="admin" label="Administração" icon="user"
              open={groupsOpen.admin}
              childActive={isGroupActive(adminTabs.map(t => t.tab))}
              onToggle={() => toggleGroup('admin')}
              showLabel={showLabels}
            >
              {adminTabs.map(t => (
                <SidebarItem
                  key={t.tab}
                  icon={t.icon} label={t.label}
                  active={activeTab === t.tab}
                  onClick={() => handleItemClick(t.tab)}
                  showLabel={showLabels}
                  nested
                />
              ))}
            </SidebarGroup>
          )}
        </nav>

        {/* Footer */}
        <div className="sb-footer">
          {showLabels ? (
            <>
              {userProfile?.nome && (
                <div className="sb-user-name">{userProfile.nome}</div>
              )}
              <div className="sb-user-email">{user?.email}</div>
              <button className="sb-logout" onClick={onLogout} title="Sair">
                <RawIcon name="logOut" size={14} />
                <span>Sair</span>
              </button>
            </>
          ) : (
            <button
              className="sb-logout sb-logout--icon-only"
              onClick={onLogout}
              title="Sair"
              aria-label="Sair"
            >
              <RawIcon name="logOut" size={16} />
            </button>
          )}
        </div>
      </aside>
    </>
  );
}

/** SidebarItem — single nav link */
function SidebarItem({ icon, label, active, onClick, showLabel, nested = false }) {
  return (
    <button
      type="button"
      className={`sb-item ${active ? 'sb-item--active' : ''} ${nested ? 'sb-item--nested' : ''}`}
      onClick={onClick}
      title={!showLabel ? label : undefined}
    >
      {active && <span className="sb-item-marker" aria-hidden="true" />}
      <span className="sb-item-icon">
        <RawIcon name={icon} size={nested ? 16 : 18} />
      </span>
      {showLabel && <span className="sb-item-label">{label}</span>}
    </button>
  );
}

/** SidebarGroup — collapsible section with header + children */
function SidebarGroup({ id, label, icon, open, childActive, onToggle, showLabel, children }) {
  // When collapsed (desktop icon mode), don't render group header chrome —
  // just render nested items as top-level icons, so users can still navigate.
  if (!showLabel) {
    return <div className="sb-group sb-group--icons-only">{children}</div>;
  }
  return (
    <div className={`sb-group ${open ? 'sb-group--open' : ''} ${childActive ? 'sb-group--has-active' : ''}`}>
      <button
        type="button"
        className="sb-group-header"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="sb-item-icon">
          <RawIcon name={icon} size={18} />
        </span>
        <span className="sb-item-label">{label}</span>
        <span className={`sb-group-chevron ${open ? 'sb-group-chevron--open' : ''}`}>
          <RawIcon name="chevronRight" size={14} />
        </span>
      </button>
      {open && <div className="sb-group-children">{children}</div>}
    </div>
  );
}
