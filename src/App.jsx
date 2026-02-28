/**
 * App.jsx — Main application component
 *
 * Replaces the monolithic App function from index-legacy.html L2331-3079.
 * Uses ALL extracted hooks — no duplicated logic.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { supabaseClient } from '@/config/supabase';

// Hooks
import { useAuth } from '@/hooks/useAuth';
import { useProducts } from '@/hooks/useProducts';
import { useEntries } from '@/hooks/useEntries';
import { useExits } from '@/hooks/useExits';
import { useShippings } from '@/hooks/useShippings';
import { useSeparations } from '@/hooks/useSeparations';
import { useCategories, DEFAULT_CATEGORIES } from '@/hooks/useCategories';
import { useLocaisOrigem } from '@/hooks/useLocaisOrigem';
import { useStock } from '@/hooks/useStock';
import { setupSupabaseCollection } from '@/hooks/useSupabaseCollection';

// Mappers
import { mapEntryFromDB, mapExitFromDB, mapShippingFromDB, mapSeparationFromDB } from '@/utils/mappers';

// Icons
import { Icon, ICONS } from '@/utils/icons';

// Auth screens
import LoginScreen from '@/components/auth/LoginScreen';
import PendingApprovalScreen from '@/components/auth/PendingApprovalScreen';
import RejectedScreen from '@/components/auth/RejectedScreen';
import AccessRestricted from '@/components/auth/AccessRestricted';

// Page components
import Dashboard from '@/components/dashboard/Dashboard';
import StockView from '@/components/stock/StockView';
import CategoryManager from '@/components/categories/CategoryManager';
import EntryForm from '@/components/entries/EntryForm';
import ExitForm from '@/components/exits/ExitForm';
import ShippingManager from '@/components/shipping/ShippingManager';
import SeparationManager from '@/components/separation/SeparationManager';
import History from '@/components/history/History';
import TinyERPPage from '@/components/tiny/TinyERPPage';
import ProductForm from '@/components/stock/ProductForm';
import ImportHub from '@/components/import/ImportHub';
import AdminPanel from '@/components/admin/AdminPanel';

const tabTitles = {
  dashboard: 'Dashboard',
  stock: 'Estoque',
  entry: 'Entrada',
  exit: 'Saída',
  separation: 'Separação',
  shipping: 'Despachos',
  history: 'Histórico',
  tiny: 'Tiny ERP',
  admin: 'Usuários',
};

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, fontFamily: 'Inter, monospace', color: '#c00' }}>
          <h2>Erro na aplicação</h2>
          <pre style={{ whiteSpace: 'pre-wrap', background: '#fef2f2', padding: 16, borderRadius: 8 }}>
            {this.state.error?.message}
            {'\n\n'}
            {this.state.error?.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  // ── Auth ──────────────────────────────────────────────────────────────
  const {
    user,
    userProfile,
    isStockAdmin,
    isSuperAdmin,
    loading,
    profileLoading,
    handleLogout,
  } = useAuth();

  // ── Tab navigation (persisted in sessionStorage) ─────────────────────
  const [activeTab, setActiveTabRaw] = useState(() => {
    try {
      return sessionStorage.getItem('orne_activeTab') || 'dashboard';
    } catch {
      return 'dashboard';
    }
  });
  const setActiveTab = (tab) => {
    setActiveTabRaw(tab);
    try {
      sessionStorage.setItem('orne_activeTab', tab);
    } catch {}
  };

  // ── Data hooks ────────────────────────────────────────────────────────
  const {
    products,
    setProducts,
    loadProducts,
    addProduct,
    updateProduct,
    deleteProduct,
    refetchData,
    handleImport,
  } = useProducts(user, isStockAdmin);

  const { entries, setEntries, addEntry, updateEntry, deleteEntry } =
    useEntries(user, isStockAdmin, setProducts);

  const { exits, setExits, addExit, updateExit, deleteExit } =
    useExits(user, isStockAdmin);

  const { shippings, setShippings, addShipping, updateShipping, deleteShipping } =
    useShippings(user, isStockAdmin);

  const { separations, setSeparations, addSeparation, updateSeparation, deleteSeparation } =
    useSeparations(user, isStockAdmin);

  const { categories, setCategories, addCategory, updateCategory, deleteCategory } =
    useCategories(isStockAdmin);

  const { locaisOrigem, initLocais, updateLocaisOrigem } =
    useLocaisOrigem(isStockAdmin);

  // ── Stock calculation ─────────────────────────────────────────────────
  const { stockMap, currentStock } = useStock(products, entries, exits);

  // ── UI-only states ────────────────────────────────────────────────────
  const [syncStatus, setSyncStatus] = useState('syncing');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileSheet, setMobileSheet] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [pendingDispatchData, setPendingDispatchData] = useState(null);

  // ── Tab change ──────────────────────────────────────────────────────────
  const handleTabChange = (tab) => {
    if (tab === activeTab) return;
    setActiveTab(tab);
    if (sidebarOpen) setSidebarOpen(false);
    if (mobileSheet) setMobileSheet(null);
  };

  // ── Separation → Dispatch handoff ─────────────────────────────────────
  const handleSendSeparationToDispatch = useCallback((dispatchData) => {
    setPendingDispatchData(dispatchData);
    setActiveTab('shipping');
  }, []);

  // ── Data loading (realtime subscriptions + paginated fetch) ───────────
  useEffect(() => {
    if (!user) return;

    setSyncStatus('syncing');
    const channels = [];

    // Categories — insert defaults if empty
    channels.push(
      setupSupabaseCollection('categories', (cats) => {
        if (cats.length === 0) {
          DEFAULT_CATEGORIES.forEach((cat) => {
            supabaseClient.from('categories').upsert(cat);
          });
          setCategories(DEFAULT_CATEGORIES);
        } else {
          setCategories(cats);
        }
      })
    );

    // Products — no Realtime, paginated fetch (> 1000 products)
    loadProducts().then(() => setSyncStatus('online'));

    // Entries
    channels.push(
      setupSupabaseCollection('entries', setEntries, {
        transform: mapEntryFromDB,
      })
    );

    // Exits
    channels.push(
      setupSupabaseCollection('exits', setExits, {
        transform: mapExitFromDB,
      })
    );

    // Shippings
    channels.push(
      setupSupabaseCollection('shippings', setShippings, {
        transform: mapShippingFromDB,
      })
    );

    // Separations
    channels.push(
      setupSupabaseCollection('separations', setSeparations, {
        transform: mapSeparationFromDB,
      })
    );

    // Locais de origem (fetch + realtime channel)
    const locaisChannel = initLocais();
    channels.push(locaisChannel);

    setSyncStatus('online');

    return () => {
      channels.forEach((ch) => supabaseClient.removeChannel(ch));
    };
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Refetch wrapper for TinyERPPage ───────────────────────────────────
  const handleDataChanged = useCallback(() => {
    return refetchData(setEntries, setExits);
  }, [refetchData, setEntries, setExits]);

  // ── Conditional rendering: auth gates ─────────────────────────────────
  if (!user) return <LoginScreen loading={loading} />;
  if (profileLoading) return <LoginScreen loading={true} />;
  if (userProfile?.status === 'pending')
    return <PendingApprovalScreen onLogout={handleLogout} />;
  if (userProfile?.status === 'rejected')
    return <RejectedScreen onLogout={handleLogout} />;

  return (
    <ErrorBoundary>
    <div className="app-container">
      {/* ── Mobile Header ─────────────────────────────────────────── */}
      <div className="mobile-header">
        <div className="mobile-header-title">
          {tabTitles[activeTab] || 'Orne'}
        </div>
        <div className="mobile-header-actions">
          <div className="mobile-avatar" aria-label="Perfil">
            {user.email ? user.email.charAt(0).toUpperCase() : 'U'}
          </div>
        </div>
      </div>

      {/* ── Sidebar Overlay ───────────────────────────────────────── */}
      <div
        className={`sidebar-overlay ${sidebarOpen ? 'visible' : ''}`}
        onClick={() => setSidebarOpen(false)}
      ></div>

      {/* ── Sidebar ───────────────────────────────────────────────── */}
      <div className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="logo-container">
          <img
            src="/logo-orne.png"
            alt="Orne"
            className="logo"
            onError={(e) => (e.target.style.display = 'none')}
          />
        </div>

        <div className="user-info">
          <div className="user-email">{user.email}</div>
          <button className="btn-logout" onClick={handleLogout}>
            Sair
          </button>
        </div>

        <div style={{ padding: '0 14px', marginBottom: '16px' }}>
          <button
            onClick={() => {
              const url = window.location.origin + '/consulta.html';
              navigator.clipboard.writeText(url);
              alert(
                'Link copiado!\n\n' +
                  url +
                  '\n\nCompartilhe com sua equipe para visualização (somente leitura).'
              );
            }}
            style={{
              width: '100%',
              padding: '9px',
              background: 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.18)',
              borderRadius: '10px',
              color: 'rgba(255,255,255,0.85)',
              cursor: 'pointer',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              fontFamily: 'inherit',
              fontWeight: '400',
              letterSpacing: '0.2px',
              transition: 'all 0.2s',
            }}
          >
            <Icon name="share" size={14} /> Compartilhar Consulta
          </button>
        </div>

        <ul className="nav-menu">
          <li className="nav-item">
            <a
              className={`nav-link ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => handleTabChange('dashboard')}
            >
              <span
                className="nav-icon"
                dangerouslySetInnerHTML={{ __html: ICONS.dashboard }}
              ></span>
              Dashboard
            </a>
          </li>
          <li className="nav-item">
            <a
              className={`nav-link ${activeTab === 'stock' ? 'active' : ''}`}
              onClick={() => handleTabChange('stock')}
            >
              <span
                className="nav-icon"
                dangerouslySetInnerHTML={{ __html: ICONS.stock }}
              ></span>
              Estoque
            </a>
          </li>

          {isStockAdmin && (
            <>
              <div className="nav-section">Movimentações</div>
              <li className="nav-item">
                <a
                  className={`nav-link ${activeTab === 'entry' ? 'active' : ''}`}
                  onClick={() => handleTabChange('entry')}
                >
                  <span
                    className="nav-icon"
                    dangerouslySetInnerHTML={{ __html: ICONS.entry }}
                  ></span>
                  Entrada
                </a>
              </li>
              <li className="nav-item">
                <a
                  className={`nav-link ${activeTab === 'exit' ? 'active' : ''}`}
                  onClick={() => handleTabChange('exit')}
                >
                  <span
                    className="nav-icon"
                    dangerouslySetInnerHTML={{ __html: ICONS.exit }}
                  ></span>
                  Saída
                </a>
              </li>
              <li className="nav-item">
                <a
                  className={`nav-link ${activeTab === 'separation' ? 'active' : ''}`}
                  onClick={() => handleTabChange('separation')}
                >
                  <span
                    className="nav-icon"
                    dangerouslySetInnerHTML={{ __html: ICONS.clipboard }}
                  ></span>
                  Separação
                </a>
              </li>
              <li className="nav-item">
                <a
                  className={`nav-link ${activeTab === 'shipping' ? 'active' : ''}`}
                  onClick={() => handleTabChange('shipping')}
                >
                  <span
                    className="nav-icon"
                    dangerouslySetInnerHTML={{ __html: ICONS.shipping }}
                  ></span>
                  Despachos
                </a>
              </li>
            </>
          )}

          <div className="nav-section">Relatórios</div>
          <li className="nav-item">
            <a
              className={`nav-link ${activeTab === 'history' ? 'active' : ''}`}
              onClick={() => handleTabChange('history')}
            >
              <span
                className="nav-icon"
                dangerouslySetInnerHTML={{ __html: ICONS.history }}
              ></span>
              Histórico
            </a>
          </li>

          <div className="nav-section">Integrações</div>
          <li className="nav-item">
            <a
              className={`nav-link ${activeTab === 'tiny' ? 'active' : ''}`}
              onClick={() => handleTabChange('tiny')}
            >
              <span
                className="nav-icon"
                dangerouslySetInnerHTML={{ __html: ICONS.tiny }}
              ></span>
              Tiny ERP
            </a>
          </li>

          {isSuperAdmin && (
            <>
              <div className="nav-section">Administração</div>
              <li className="nav-item">
                <a
                  className={`nav-link ${activeTab === 'admin' ? 'active' : ''}`}
                  onClick={() => handleTabChange('admin')}
                >
                  <span
                    className="nav-icon"
                    dangerouslySetInnerHTML={{ __html: ICONS.user }}
                  ></span>
                  Usuários
                </a>
              </li>
            </>
          )}
        </ul>
      </div>

      {/* ── Main Content ──────────────────────────────────────────── */}
      <div className="main-content">
        <div className="fade-in">
          {/* Frequent tabs — kept mounted, hidden via display:none */}
          <div style={{ display: activeTab === 'dashboard' ? 'block' : 'none' }}>
            <Dashboard
              stock={currentStock}
              categories={categories}
              isVisible={activeTab === 'dashboard'}
              entries={entries}
              exits={exits}
              onNavigate={handleTabChange}
            />
          </div>
          <div style={{ display: activeTab === 'stock' ? 'block' : 'none' }}>
            <StockView
              stock={currentStock}
              categories={categories}
              onUpdate={updateProduct}
              onDelete={deleteProduct}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              entries={entries}
              exits={exits}
              locaisOrigem={locaisOrigem}
            />
          </div>
          <div style={{ display: activeTab === 'categories' ? 'block' : 'none' }}>
            <CategoryManager
              categories={categories}
              onAdd={addCategory}
              onUpdate={updateCategory}
              onDelete={deleteCategory}
              products={currentStock}
            />
          </div>
          <div style={{ display: activeTab === 'entry' ? 'block' : 'none' }}>
            {isStockAdmin ? (
              <EntryForm
                products={products}
                onSubmit={addEntry}
                onAddProduct={addProduct}
                categories={categories}
                locaisOrigem={locaisOrigem}
                onUpdateLocais={updateLocaisOrigem}
                entries={entries}
                exits={exits}
                stock={currentStock}
                onAddCategory={addCategory}
                onUpdateCategory={updateCategory}
                onDeleteCategory={deleteCategory}
              />
            ) : (
              <AccessRestricted />
            )}
          </div>
          <div style={{ display: activeTab === 'exit' ? 'block' : 'none' }}>
            {isStockAdmin ? (
              <ExitForm
                products={products}
                stock={currentStock}
                onSubmit={addExit}
                entries={entries}
                exits={exits}
                onAddProduct={addProduct}
                categories={categories}
                locaisOrigem={locaisOrigem}
                onUpdateLocais={updateLocaisOrigem}
                onAddCategory={addCategory}
                onUpdateCategory={updateCategory}
                onDeleteCategory={deleteCategory}
              />
            ) : (
              <AccessRestricted />
            )}
          </div>
          <div style={{ display: activeTab === 'separation' ? 'block' : 'none' }}>
            {isStockAdmin ? (
              <SeparationManager
                separations={separations}
                onAdd={addSeparation}
                onUpdate={updateSeparation}
                onDelete={deleteSeparation}
                products={products}
                stock={currentStock}
                entries={entries}
                exits={exits}
                shippings={shippings}
                categories={categories}
                locaisOrigem={locaisOrigem}
                onUpdateLocais={updateLocaisOrigem}
                onAddProduct={addProduct}
                onAddCategory={addCategory}
                onUpdateCategory={updateCategory}
                onDeleteCategory={deleteCategory}
                user={user}
                onSendToDispatch={handleSendSeparationToDispatch}
                isStockAdmin={isStockAdmin}
              />
            ) : (
              <AccessRestricted />
            )}
          </div>
          <div style={{ display: activeTab === 'shipping' ? 'block' : 'none' }}>
            <ShippingManager
              shippings={shippings}
              onAdd={addShipping}
              onUpdate={updateShipping}
              onDelete={deleteShipping}
              stock={currentStock}
              products={products}
              onAddExit={addExit}
              onAddEntry={addEntry}
              locaisOrigem={locaisOrigem}
              onUpdateLocais={updateLocaisOrigem}
              onAddProduct={addProduct}
              categories={categories}
              entries={entries}
              exits={exits}
              isStockAdmin={isStockAdmin}
              onAddCategory={addCategory}
              onUpdateCategory={updateCategory}
              onDeleteCategory={deleteCategory}
              pendingDispatchData={pendingDispatchData}
              onClearPendingDispatch={() => setPendingDispatchData(null)}
            />
          </div>
          <div style={{ display: activeTab === 'history' ? 'block' : 'none' }}>
            <History
              entries={entries}
              exits={exits}
              products={products}
              shippings={shippings}
              onUpdateEntry={updateEntry}
              onDeleteEntry={deleteEntry}
              onUpdateExit={updateExit}
              onDeleteExit={deleteExit}
              isStockAdmin={isStockAdmin}
            />
          </div>
          {/* Tiny ERP — kept mounted to preserve connection status & sync progress */}
          <div style={{ display: activeTab === 'tiny' ? 'block' : 'none' }}>
            <TinyERPPage
              user={user}
              onDataChanged={handleDataChanged}
              products={products}
              entries={entries}
              exits={exits}
              stock={currentStock}
              onAddEntry={addEntry}
              onAddExit={addExit}
              onAddProduct={addProduct}
              categories={categories}
              locaisOrigem={locaisOrigem}
              onUpdateLocais={updateLocaisOrigem}
              onAddCategory={addCategory}
              onUpdateCategory={updateCategory}
              onDeleteCategory={deleteCategory}
            />
          </div>

          {/* Rare tabs — mounted on demand */}
          {activeTab === 'newproduct' && (
            <ProductForm
              onSubmit={addProduct}
              products={products}
              categories={categories}
            />
          )}
          {activeTab === 'import' &&
            (isStockAdmin ? (
              <ImportHub
                products={products}
                onImport={handleImport}
                onAddProduct={addProduct}
                categories={categories}
                locaisOrigem={locaisOrigem}
                onUpdateLocais={updateLocaisOrigem}
                entries={entries}
                exits={exits}
                stock={currentStock}
                onAddEntry={addEntry}
                onAddExit={addExit}
              />
            ) : (
              <AccessRestricted />
            ))}
          {activeTab === 'admin' && isSuperAdmin && (
            <AdminPanel currentUserId={user.id} />
          )}
        </div>
      </div>

      {/* ── Sync Status ───────────────────────────────────────────── */}
      <div className="sync-status">
        <div className={`sync-indicator ${syncStatus}`}></div>
        <span>
          {syncStatus === 'online'
            ? 'Sincronizado'
            : syncStatus === 'offline'
              ? 'Offline'
              : 'Sincronizando...'}
        </span>
      </div>

      {/* ── Mobile Bottom Navigation ──────────────────────────────── */}
      <div
        className="mobile-bottom-nav"
        role="navigation"
        aria-label="Navegação principal"
      >
        <button
          className={`nav-tab ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => handleTabChange('dashboard')}
          aria-current={activeTab === 'dashboard' ? 'page' : undefined}
          aria-label="Dashboard"
        >
          <Icon name="layoutDashboard" size={22} />
          <span>Início</span>
        </button>
        <button
          className={`nav-tab ${activeTab === 'stock' ? 'active' : ''}`}
          onClick={() => handleTabChange('stock')}
          aria-current={activeTab === 'stock' ? 'page' : undefined}
          aria-label="Estoque"
        >
          <Icon name="package" size={22} />
          <span>Produtos</span>
        </button>
        {isStockAdmin && (
          <button
            className="nav-tab action-btn"
            onClick={() => handleTabChange('entry')}
            aria-label="Nova entrada"
          >
            <Icon name="plusCircle" size={26} />
            <span>Novo</span>
          </button>
        )}
        {isStockAdmin && (
          <button
            className={`nav-tab ${['entry', 'exit', 'separation', 'shipping', 'history'].includes(activeTab) ? 'active' : ''}`}
            onClick={() =>
              setMobileSheet(mobileSheet === 'moves' ? null : 'moves')
            }
            aria-label="Movimentações"
            aria-expanded={mobileSheet === 'moves'}
          >
            <Icon name="arrowLeftRight" size={22} />
            <span>Movimentar</span>
          </button>
        )}
        <button
          className="nav-tab"
          onClick={() => setSidebarOpen(true)}
          aria-label="Menu completo"
        >
          <Icon name="menuIcon" size={22} />
          <span>Mais</span>
        </button>
      </div>

      {/* ── Bottom Sheet — Movimentações ──────────────────────────── */}
      <div
        className={`bottom-sheet-overlay ${mobileSheet === 'moves' ? 'visible' : ''}`}
        onClick={() => setMobileSheet(null)}
      ></div>
      <div
        className={`bottom-sheet ${mobileSheet === 'moves' ? 'open' : ''}`}
        role="dialog"
        aria-label="Movimentações"
      >
        <div className="bottom-sheet-handle"></div>
        <div className="bottom-sheet-title">Movimentações</div>
        <button
          className="bottom-sheet-item"
          onClick={() => handleTabChange('entry')}
        >
          <span dangerouslySetInnerHTML={{ __html: ICONS.entry }}></span>
          Entrada de Estoque
        </button>
        <button
          className="bottom-sheet-item"
          onClick={() => handleTabChange('exit')}
        >
          <span dangerouslySetInnerHTML={{ __html: ICONS.exit }}></span>
          Saída de Estoque
        </button>
        <button
          className="bottom-sheet-item"
          onClick={() => handleTabChange('separation')}
        >
          <span dangerouslySetInnerHTML={{ __html: ICONS.clipboard }}></span>
          Separação
        </button>
        <button
          className="bottom-sheet-item"
          onClick={() => handleTabChange('shipping')}
        >
          <span dangerouslySetInnerHTML={{ __html: ICONS.shipping }}></span>
          Despachos
        </button>
        <button
          className="bottom-sheet-item"
          onClick={() => handleTabChange('history')}
        >
          <span dangerouslySetInnerHTML={{ __html: ICONS.history }}></span>
          Histórico
        </button>
      </div>
    </div>
    </ErrorBoundary>
  );
}
