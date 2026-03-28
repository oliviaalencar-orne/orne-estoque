# Auditoria de Reatividade — Orne Estoque

**Data:** 2026-03-28
**Branch:** staging

---

## 1. Padrão Atual de Data Fetching

### Arquitetura

- **Sem state manager global** (sem Redux, Zustand, Context API wrapper)
- **Sem React Query / TanStack Query**
- Dados gerenciados via hooks customizados (`useShippings`, `useEntries`, etc.) com `useState`
- App.jsx é o hub central — chama todos os hooks e passa dados/funções via props

### Supabase Realtime

O app **já usa Realtime** via `useSupabaseCollection.js`:
- Debounce de 500ms
- Batching: >20 mudanças = refetch completo; <20 = incremental
- Canal por tabela com `postgres_changes` event `*`

**Canais Realtime por role:**

| Tabela | Admin | Operador/Equipe |
|--------|-------|-----------------|
| categories | Realtime | Fetch-only |
| products | Fetch-only (paginado) | Fetch-only (paginado) |
| entries | Realtime | Fetch-only |
| exits | Realtime | Fetch-only |
| shippings | Realtime | Realtime |
| separations | Realtime | Realtime |
| locais_origem | Realtime | Fetch-only |
| hubs | Realtime | Fetch-only |
| user_profiles | Realtime (AdminPanel) | N/A |

### Diagnóstico Principal

**Se o Realtime estiver funcionando**, mudanças no DB deveriam propagar para a UI em ~500ms. O fato de o usuário precisar de F5 indica que:

1. **Realtime pode não estar funcionando de forma confiável** (limites do Free tier, conexão WebSocket instável, RLS bloqueando eventos)
2. **Operador/Equipe só têm Realtime em 2 tabelas** — todas as outras requerem F5
3. **Products NUNCA tem Realtime** (nenhuma role) — sempre requer refetch manual
4. **Mutações nos hooks não atualizam state local** — dependem 100% do Realtime

**Solução:** Adicionar refetch/atualização de state explícita após cada mutação. Isso funciona como "belt-and-suspenders" — mesmo que o Realtime esteja OK, a UI atualiza imediatamente.

---

## 2. Mapa Completo de Mutações

### 2.1 Expedição (shippings)

| Arquivo | Linha | Ação | Refetch? |
|---------|-------|------|----------|
| useShippings.js | 58 | UPSERT (addShipping) | ❌ Retorna objeto, sem state update |
| useShippings.js | 106 | UPDATE (updateShipping) | ❌ Sem retorno, sem state update |
| useShippings.js | 124 | DELETE (deleteShipping) | ❌ Sem retorno, sem state update |
| ShippingManager.jsx | 289 | INSERT despacho (single) | ❌ Limpa form, não chama onRefresh |
| ShippingManager.jsx | 385 | INSERT despacho (lote) | ❌ Não chama onRefresh |
| ShippingManager.jsx | 238 | INSERT devolução | ❌ Não chama onRefresh |
| ShippingList.jsx | 200 | UPDATE comprovante | ❌ Fecha modal, sem refetch |
| ShippingList.jsx | 410 | UPDATE status | ❌ Sem refetch |
| ShippingList.jsx | 1379 | UPDATE via modal edição | ❌ Fecha modal, sem refetch |
| ShippingList.jsx | 1145 | DELETE | ❌ Callback pro parent, sem refetch |
| ShippingList.jsx | 264 | UPDATE rastreio individual | ❌ Sem refetch (EF persiste direto) |
| ShippingList.jsx | 452 | UPDATE rastreio NF ME | ❌ Sem refetch |
| ShippingList.jsx | 252 | Rastreio EF v15 | ✅ onRefresh() |
| ShippingList.jsx | 363 | Rastreio lote | ✅ onRefresh() |
| ShippingList.jsx | 495 | Vincular ME lote | ✅ onRefresh() |
| ShippingList.jsx | 521 | DANFE preload | ✅ onRefresh() |
| ShippingList.jsx | 548 | DANFE individual | ✅ onRefresh() |
| ShippingList.jsx | 599 | DANFE lote | ✅ onRefresh() |

### 2.2 Separação (separations)

| Arquivo | Linha | Ação | Refetch? |
|---------|-------|------|----------|
| useSeparations.js | 31 | UPSERT (addSeparation) | ⚠️ Otimista — atualiza state ANTES da resposta |
| useSeparations.js | 62-77 | UPDATE (updateSeparation) | ⚠️ Otimista — atualiza state ANTES da resposta |
| useSeparations.js | 93-94 | DELETE (deleteSeparation) | ⚠️ Otimista — remove do state ANTES da resposta |
| SeparationManager.jsx | 166 | CREATE via onAdd | ⚠️ Depende do otimista do hook |
| SeparationManager.jsx | 164 | UPDATE (editar) | ⚠️ Depende do otimista do hook |
| SeparationManager.jsx | 209 | UPDATE status lote | ⚠️ Depende do otimista do hook |
| SeparationManager.jsx | 305 | UPDATE → despachado | ⚠️ Depende do otimista do hook |

**Nota:** Separações usam atualização otimista — a UI atualiza imediatamente, MAS sem rollback se o DB falhar.

### 2.3 Entradas (entries)

| Arquivo | Linha | Ação | Refetch? |
|---------|-------|------|----------|
| useEntries.js | 41 | INSERT (addEntry) | ✅ State update com `.select().single()` |
| useEntries.js | 71-74 | UPDATE produto (estoque) | ✅ Atualiza state local de products |
| useEntries.js | 97 | UPDATE (updateEntry) | ❌ Sem state update |
| useEntries.js | 112 | DELETE (deleteEntry) | ❌ Sem state update |

### 2.4 Saídas (exits)

| Arquivo | Linha | Ação | Refetch? |
|---------|-------|------|----------|
| useExits.js | 44 | INSERT (addExit) | ✅ State update com `.select().single()` |
| useExits.js | 79 | UPDATE (updateExit) | ❌ Sem state update |
| useExits.js | 94 | DELETE (deleteExit) | ❌ Sem state update |

### 2.5 Produtos (products)

| Arquivo | Linha | Ação | Refetch? |
|---------|-------|------|----------|
| useProducts.js | 55-66 | UPSERT (addProduct) | ✅ State update local |
| useProducts.js | 102 | UPDATE (updateProduct) | ✅ State update local |
| useProducts.js | 120 | DELETE (deleteProduct) | ✅ State removal local |
| useProducts.js | 138-144 | REFETCH (refetchData) | ✅ Busca products + entries + exits |

### 2.6 Categorias (categories)

| Arquivo | Linha | Ação | Refetch? |
|---------|-------|------|----------|
| useCategories.js | 41 | UPSERT (addCategory) | ❌ Retorna objeto, sem state update |
| useCategories.js | 63 | UPDATE (updateCategory) | ❌ Sem state update |
| useCategories.js | 78 | DELETE (deleteCategory) | ❌ Sem state update |

### 2.7 Tiny ERP

| Arquivo | Linha | Ação | Refetch? |
|---------|-------|------|----------|
| TinyERPPage.jsx | 209 | OAuth exchange_code | ✅ Chama loadStatus() |
| TinyERPPage.jsx | 245 | save_config | ✅ Chama loadStatus() |
| TinyERPPage.jsx | 283 | disconnect | ✅ Chama loadStatus() |
| TinyERPPage.jsx | 301 | sync-products | ✅ loadSyncLogs() + onDataChanged() |
| TinyERPPage.jsx | 330 | sync-stock | ✅ loadSyncLogs() + onDataChanged() |
| TinyERPPage.jsx | 334 | sync-nfe | ✅ loadSyncLogs() + onDataChanged() |
| TinyERPPage.jsx | 375 | sync-images | ✅ onDataChanged() |

**Nota:** TinyERPPage está BEM — todas as mutações têm refetch. O problema de OAuth não é refetch, é que o redirect externo não dispara re-verificação automática. Precisa de `focus` listener.

### 2.8 Usuários (user_profiles)

| Arquivo | Linha | Ação | Refetch? |
|---------|-------|------|----------|
| AdminPanel.jsx | 31 | UPDATE (aprovar/rejeitar/role) | ✅ Chama loadUsers() + tem Realtime |

---

## 3. Resumo de Prioridades

### CRÍTICO (❌ = sem refetch, alta frequência de uso)

1. **useShippings.js** — updateShipping e deleteShipping não atualizam state
2. **ShippingManager.jsx** — handleSubmit/salvarDespachosLote não chamam onRefresh
3. **ShippingList.jsx** — edit modal, status change, comprovante não chamam onRefresh
4. **useCategories.js** — nenhuma mutação atualiza state

### IMPORTANTE (❌ mas menor frequência)

5. **useEntries.js** — updateEntry e deleteEntry sem state update
6. **useExits.js** — updateExit e deleteExit sem state update
7. **ShippingList.jsx** — rastreio individual (L264) e busca ME (L452) sem refetch

### BAIXO RISCO (⚠️ funciona mas sem rollback)

8. **useSeparations.js** — otimista sem rollback em caso de erro DB

### OK (✅)

9. Products — todas as mutações do hook atualizam state local
10. TinyERPPage — todas as ações chamam refetch/onDataChanged
11. AdminPanel — tem Realtime + loadUsers após mutação
12. Entries/Exits — INSERT atualiza state (UPDATE/DELETE não)

---

## 4. Plano de Correção

### Abordagem: Refetch explícito após mutação

Como o app já tem `refreshShippings()`, `refetchData()`, e os hooks expõem setters, a correção é adicionar chamadas de refetch/state update após cada mutação que hoje não tem.

**Ordem:**
1. Expedição (shippings) — maior impacto, 12 pontos sem refetch
2. Categorias — 3 pontos sem refetch
3. Entradas/Saídas — 4 pontos sem refetch (update/delete)
4. OAuth Tiny — listener de focus para re-verificar status
5. Separações — adicionar rollback em caso de erro (opcional)

**NÃO faremos:**
- Adicionar Realtime onde não existe (limites Free tier)
- Instalar React Query (mudança grande demais)
- Alterar a arquitetura de state management
- Tocar em RLS, Edge Functions, ou estrutura de banco
