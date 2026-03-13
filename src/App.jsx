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
import { useHubs } from '@/hooks/useHubs';
import { useStock } from '@/hooks/useStock';
import { setupSupabaseCollection } from '@/hooks/useSupabaseCollection';
import { useEquipeProducts, loadStockSummary } from '@/hooks/useEquipeData';

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
  shipping: 'Expedição',
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
    isEquipe,
    isOperador,
    isSuperAdmin,
    loading,
    profileLoading,
    handleLogout,
  } = useAuth();

  // Equipe has read access to separation and shipping (but no admin actions)
  const canViewSeparation = isStockAdmin || isEquipe;
  const canViewShipping = isStockAdmin || isEquipe || isOperador;

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

  const { shippings, setShippings, addShipping, updateShipping, deleteShipping, refreshShippings } =
    useShippings(user, isStockAdmin, isOperador);

  const { separations, setSeparations, addSeparation, updateSeparation, deleteSeparation } =
    useSeparations(user, isStockAdmin);

  const { categories, setCategories, addCategory, updateCategory, deleteCategory } =
    useCategories(isStockAdmin);

  const { locaisOrigem, setLocaisOrigem, initLocais, updateLocaisOrigem } =
    useLocaisOrigem(isStockAdmin);

  const { hubs, setHubs, initHubs, addHub, updateHub, deleteHub } =
    useHubs(isStockAdmin);

  // ── Equipe-specific data (lazy loaded, server-side search) ───────────
  const {
    equipeProducts,
    totalCount: equipeTotalCount,
    isLoading: equipeLoading,
    hasMore: equipeHasMore,
    loadMore: equipeLoadMore,
    searchProducts: equipeSearch,
    initLoad: equipeInitLoad,
  } = useEquipeProducts();

  const [equipeStockMap, setEquipeStockMap] = useState(null);

  // ── Stock calculation ─────────────────────────────────────────────────
  // Equipe: uses precomputed stock map from RPC (avoids loading entries/exits)
  // Admin: computes from entries/exits as before
  const { stockMap, currentStock } = useStock(products, entries, exits, isEquipe ? equipeStockMap : null);

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

  // ── Data loading (role-based: admin=full subs, equipe=minimal) ───────
  const userRole = userProfile?.role || null;

  useEffect(() => {
    if (!user || !userRole) return;

    setSyncStatus('syncing');
    const channels = [];

    if (isEquipe) {
      // ═══ EQUIPE MODE: 2 realtime channels (shippings + separations) ═══

      // Categories — fetch once, no realtime
      supabaseClient.from('categories').select('*').then(({ data }) => {
        if (data && data.length > 0) setCategories(data);
        else setCategories(DEFAULT_CATEGORIES);
      });

      // Products — paginated fetch, no realtime (needed for Dashboard & SeparationManager)
      loadProducts();

      // Stock summary via RPC (for Dashboard — avoids loading entries/exits)
      loadStockSummary().then((map) => setEquipeStockMap(map));

      // Equipe products — paginated via RPC (for StockView server-side search)
      equipeInitLoad();

      // Shippings — realtime
      channels.push(
        setupSupabaseCollection('shippings', setShippings, {
          transform: mapShippingFromDB,
        })
      );

      // Separations — realtime
      channels.push(
        setupSupabaseCollection('separations', setSeparations, {
          transform: mapSeparationFromDB,
        })
      );

      // Locais — fetch once, no realtime
      supabaseClient.from('locais_origem').select('name').order('id').then(({ data }) => {
        if (data && data.length > 0) setLocaisOrigem(data.map((d) => d.name));
      });

      // Hubs — fetch once, no realtime
      supabaseClient.from('hubs').select('*').order('name').then(({ data }) => {
        if (data) setHubs(data);
      });

      setSyncStatus('online');
    } else {
      // ═══ ADMIN MODE: Full subscriptions (7 realtime channels) ═══

      // Categories — realtime + insert defaults if empty
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

      // Entries — realtime
      channels.push(
        setupSupabaseCollection('entries', setEntries, {
          transform: mapEntryFromDB,
        })
      );

      // Exits — realtime
      channels.push(
        setupSupabaseCollection('exits', setExits, {
          transform: mapExitFromDB,
        })
      );

      // Shippings — realtime
      channels.push(
        setupSupabaseCollection('shippings', setShippings, {
          transform: mapShippingFromDB,
        })
      );

      // Separations — realtime
      channels.push(
        setupSupabaseCollection('separations', setSeparations, {
          transform: mapSeparationFromDB,
        })
      );

      // Locais de origem (fetch + realtime channel)
      const locaisChannel = initLocais();
      channels.push(locaisChannel);

      // Hubs (fetch + realtime channel)
      const hubsChannel = initHubs();
      channels.push(hubsChannel);

      setSyncStatus('online');
    }

    return () => {
      channels.forEach((ch) => supabaseClient.removeChannel(ch));
    };
  }, [user, userRole]); // eslint-disable-line react-hooks/exhaustive-deps

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
          {userProfile?.nome && (
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.95)', marginBottom: '2px' }}>
              {userProfile.nome}
            </div>
          )}
          <div className="user-email">{user.email}</div>
          <button className="btn-logout" onClick={handleLogout}>
            Sair
          </button>
        </div>


        {isEquipe && (
          <div style={{ padding: '0 14px', marginBottom: '16px' }}>
            <div style={{
              width: '100%',
              padding: '9px',
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '10px',
              color: 'rgba(255,255,255,0.65)',
              fontSize: '11px',
              textAlign: 'center',
              fontFamily: 'inherit',
              letterSpacing: '0.2px',
            }}>
              Acesso: Consulta
            </div>
          </div>
        )}

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

          {(isStockAdmin || isEquipe || isOperador) && (
            <>
              <div className="nav-section">Movimentações</div>
              {isStockAdmin && (
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
              )}
              {isStockAdmin && (
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
              )}
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
                  Expedição
                </a>
              </li>
            </>
          )}

          {isStockAdmin && (
            <>
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
            </>
          )}

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
              shippings={shippings}
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
              onAddCategory={addCategory}
              onUpdateCategory={updateCategory}
              onDeleteCategory={deleteCategory}
              products={products}
              isEquipe={isEquipe}
              equipeProducts={equipeProducts}
              equipeLoading={equipeLoading}
              equipeHasMore={equipeHasMore}
              onEquipeLoadMore={equipeLoadMore}
              onEquipeSearch={equipeSearch}
              equipeTotalCount={equipeTotalCount}
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
            {canViewSeparation ? (
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
                onAddShipping={addShipping}
                onAddExit={addExit}
                isStockAdmin={isStockAdmin}
                hubs={hubs}
                onAddHub={addHub}
                onUpdateHub={updateHub}
                onDeleteHub={deleteHub}
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
              isOperador={isOperador}
              isEquipe={isEquipe}
              onAddCategory={addCategory}
              onUpdateCategory={updateCategory}
              onDeleteCategory={deleteCategory}
              pendingDispatchData={pendingDispatchData}
              onClearPendingDispatch={() => setPendingDispatchData(null)}
              onRefreshShippings={refreshShippings}
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
        {(isStockAdmin || isEquipe || isOperador) && (
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
        {isStockAdmin && (
          <button
            className="bottom-sheet-item"
            onClick={() => handleTabChange('entry')}
          >
            <span dangerouslySetInnerHTML={{ __html: ICONS.entry }}></span>
            Entrada de Estoque
          </button>
        )}
        {isStockAdmin && (
          <button
            className="bottom-sheet-item"
            onClick={() => handleTabChange('exit')}
          >
            <span dangerouslySetInnerHTML={{ __html: ICONS.exit }}></span>
            Saída de Estoque
          </button>
        )}
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
          Expedição
        </button>
        {isStockAdmin && (
          <button
            className="bottom-sheet-item"
            onClick={() => handleTabChange('history')}
          >
            <span dangerouslySetInnerHTML={{ __html: ICONS.history }}></span>
            Histórico
          </button>
        )}
      </div>
    </div>
    </ErrorBoundary>
  );
}
