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

// Layout
import Sidebar from '@/components/layout/Sidebar';

// Error boundary (wrapper sobre Sentry.ErrorBoundary)
import { ErrorBoundary } from '@/components/ErrorBoundary';

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

// ErrorBoundary agora é importado de src/components/ErrorBoundary.jsx
// (wrapper sobre Sentry.ErrorBoundary com fallback UI da paleta do
// design system). A classe local antiga foi removida para que erros
// cheguem ao Sentry.

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
  // Operador can edit separations and shippings (but not create/delete)
  const canViewSeparation = isStockAdmin || isEquipe || isOperador;
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
    useExits(user, isStockAdmin, isOperador);

  const { shippings, setShippings, addShipping, updateShipping, deleteShipping, refreshShippings } =
    useShippings(user, isStockAdmin, isOperador);

  const { separations, setSeparations, addSeparation, updateSeparation, deleteSeparation } =
    useSeparations(user, isStockAdmin, isOperador);

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

    // ─── Helper: debounced refetch subscription (for paginated tables) ───
    const subscribeRefetch = (tableName, refetchFn, debounceMs = 800) => {
      let timer = null;
      const ch = supabaseClient
        .channel(tableName + '-refetch')
        .on('postgres_changes', { event: '*', schema: 'public', table: tableName }, () => {
          clearTimeout(timer);
          timer = setTimeout(() => { refetchFn(); }, debounceMs);
        })
        .subscribe();
      return ch;
    };

    if (isEquipe || isOperador) {
      // ═══ EQUIPE/OPERADOR MODE: realtime channels ═══

      // Categories — fetch once, no realtime
      supabaseClient.from('categories').select('*').then(({ data, error }) => {
        if (error) { console.error('Erro ao buscar categorias:', error); return; }
        if (data && data.length > 0) setCategories(data);
        else setCategories(DEFAULT_CATEGORIES);
      });

      // Products — paginated fetch + realtime refetch
      loadProducts();
      channels.push(subscribeRefetch('products', loadProducts));

      // Entries/Exits: NÃO carregar nem subscrever no modo equipe/operador
      // (usam RPC stock map para evitar carregar milhares de linhas)

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
      supabaseClient.from('locais_origem').select('name').order('id').then(({ data, error }) => {
        if (error) { console.error('Erro ao buscar locais:', error); return; }
        if (data && data.length > 0) setLocaisOrigem(data.map((d) => d.name));
      });

      // Hubs — fetch once, no realtime
      supabaseClient.from('hubs').select('*').order('name').then(({ data, error }) => {
        if (error) { console.error('Erro ao buscar hubs:', error); return; }
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
              supabaseClient.from('categories').upsert(cat).then(({ error }) => {
                if (error) console.error('Erro ao inserir categoria default:', error);
              });
            });
            setCategories(DEFAULT_CATEGORIES);
          } else {
            setCategories(cats);
          }
        })
      );

      // Products — paginated fetch + realtime refetch
      loadProducts().then(() => setSyncStatus('online'));
      channels.push(subscribeRefetch('products', loadProducts));

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

      {/* ── Sidebar (novo componente colapsável — Fase 1) ─────────── */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        user={user}
        userProfile={userProfile}
        onLogout={handleLogout}
        isStockAdmin={isStockAdmin}
        isOperador={isOperador}
        isEquipe={isEquipe}
        isSuperAdmin={isSuperAdmin}
        mobileOpen={sidebarOpen}
        onCloseMobile={() => setSidebarOpen(false)}
      />

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
              isOperador={isOperador}
              isStockAdmin={isStockAdmin}
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
                onUpdateProduct={updateProduct}
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
                onDeleteShipping={deleteShipping}
                onDeleteExit={deleteExit}
                isStockAdmin={isStockAdmin}
                isOperador={isOperador}
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
              onUpdateProduct={updateProduct}
            />
          </div>
          <div style={{ display: activeTab === 'history' ? 'block' : 'none' }}>
            {(isStockAdmin || isOperador) ? (
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
            ) : (
              <AccessRestricted />
            )}
          </div>
          {/* Tiny ERP — kept mounted to preserve connection status & sync progress */}
          <div style={{ display: activeTab === 'tiny' ? 'block' : 'none' }}>
            {isStockAdmin ? <TinyERPPage
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
            /> : <AccessRestricted />}
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
        {(isStockAdmin || isOperador) && (
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
