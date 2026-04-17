# Auditoria de Saude — Orne Estoque

**Data:** 2026-03-28
**Branch:** staging
**Escopo:** Revisao completa de codigo (68 arquivos, ~18.000 linhas)

---

## Resumo Executivo

| Severidade | Qtd |
|-----------|-----|
| 🔴 Critico | 12 |
| 🟠 Alto | 18 |
| 🟡 Medio | 16 |
| 🔵 Baixo | 6 |
| **Total** | **52** |

**Areas mais criticas:** Operacoes multi-step sem atomicidade (shipping + stock), race conditions em estoque, Edge Functions sem idempotencia, vulnerabilidades npm.

---

## 1. Seguranca

### 🟠 SEC-01: Permissoes sao apenas frontend — RLS e a unica barreira real
- **Arquivos:** useProducts.js, useEntries.js, useExits.js, useShippings.js, useSeparations.js
- **Descricao:** Todas as verificacoes de permissao (`isStockAdmin`, `isOperador`) sao feitas em JavaScript. Um usuario com DevTools pode bypass. A seguranca depende 100% de RLS no Supabase estar corretamente configurado.
- **Recomendacao:** Verificar que RLS esta ativo em TODAS as tabelas e que as policies checam role do user_profiles.

### 🟠 SEC-02: SuperAdmin hardcoded em email unico
- **Arquivo:** useAuth.js L32
- **Descricao:** `isSuperAdmin = userProfile?.email === 'oliviaalencar@hotmail.com'`. Se a conta for comprometida, nao tem como revogar sem deploy.
- **Recomendacao:** Mover para campo `is_super_admin` na tabela user_profiles.

### 🟡 SEC-03: Headers de seguranca ausentes no Vercel
- **Arquivo:** vercel.json
- **Descricao:** Faltam: `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, `Content-Security-Policy`.
- **Recomendacao:** Adicionar no vercel.json.

### 🟡 SEC-04: Upload de fotos sem validacao explicita
- **Arquivos:** ShippingForm.jsx L61-87, ShippingList.jsx L76-120
- **Descricao:** Upload ao bucket `comprovantes` sem verificacao de MIME type ou tamanho maximo no codigo. Depende de policies do Storage.
- **Recomendacao:** Adicionar `file.type` check e `file.size < 5MB` antes do upload.

### 🟡 SEC-05: postMessage sem verificacao de origin no receptor
- **Arquivo:** TinyERPPage.jsx L210-236
- **Descricao:** Listener de `message` nao verifica `event.origin`. Outra aba/site pode enviar mensagem falsa.
- **Recomendacao:** Adicionar `if (event.origin !== window.location.origin) return;`.

### 🟡 SEC-06: Status do Tiny retorna client_secret em plaintext
- **Arquivo:** Edge Function tiny-auth, action `status`
- **Descricao:** Endpoint retorna client_id e client_secret no JSON. Deveria mascarar.

### 🔵 SEC-07: Supabase anon key hardcoded como fallback
- **Arquivo:** supabase.js L3-4
- **Descricao:** Anon key e publica por design, mas o fallback hardcoded poderia ser removido para forcar env vars.

---

## 2. Integridade de Dados

### 🟠 DAT-01: ID gerado com Math.random — risco de colisao
- **Arquivo:** helpers.js L10
- **Descricao:** `generateId()` usa `Math.random().toString(36).substr(2, 9)`. Apenas ~50 bits de entropia. Com upsert, colisao pode sobrescrever registro existente silenciosamente.
- **Recomendacao:** Substituir por `crypto.randomUUID()`.

### 🟠 DAT-02: HUB normalizacao so aplicada em analytics, nao ao salvar
- **Arquivo:** ShippingAnalytics.jsx L12-30 vs useShippings.js L36
- **Descricao:** `HUB_MAP` normaliza nomes apenas no grafico. No banco, `"Loja Principal"`, `"HUB VG"` e `"VG (Vila Guilherme)"` coexistem como valores diferentes.
- **Recomendacao:** Normalizar no momento do save, nao no display.

### 🟡 DAT-03: Otimista + Realtime pode causar flicker
- **Arquivo:** useSeparations.js L61-64
- **Descricao:** State atualiza antes do DB. Se evento realtime chega com dado antigo antes do UPDATE completar, UI mostra valor antigo brevemente.
- **Recomendacao:** Adicionar debounce ou flag de "update pendente" para ignorar realtime temporariamente.

### 🟡 DAT-04: Mapper nao inclui todos os campos na ida (addShipping)
- **Arquivo:** useShippings.js L31-57 vs mappers.js L47-77
- **Descricao:** `addShipping` nao envia `rastreio_info` ao DB. Se mapper le e depois update parcial e feito, campo pode reverter.
- **Recomendacao:** Garantir que addShipping inclua todos os campos do mapper.

### 🟡 DAT-05: Datas UTC no banco mas display local sem indicacao
- **Arquivos:** useShippings.js L46, Dashboard.jsx L95
- **Descricao:** Datas salvas em UTC mas exibidas com `toLocaleDateString('pt-BR')`. Perto da meia-noite, filtro de periodo pode excluir/incluir registro do dia errado.

### 🔵 DAT-06: Campo `quantidade` vs `quantity` no JSONB
- **Arquivos:** SeparationForm.jsx, ShippingForm.jsx, DevolucaoForm.jsx
- **Descricao:** JSONB de `produtos` usa `quantidade` (portugues). Tabelas entries/exits usam `quantity` (ingles). Consistente dentro de cada contexto mas confuso para manutencao.

---

## 3. Tratamento de Erros

### 🔴 ERR-01: Criacao de despacho + baixa de estoque sem atomicidade
- **Arquivo:** ShippingManager.jsx L257-364
- **Descricao:** Fluxo: (1) cria shipping, (2) cria exits para cada produto, (3) atualiza shipping com exitIds. Se passo 2 falha parcialmente, shipping existe sem baixa de estoque. Se passo 3 falha, exits existem mas nao tem vinculo. **Nao ha rollback.**
- **Recomendacao:** Criar Edge Function/RPC que faca tudo em transacao atomica.

### 🔴 ERR-02: Race condition em baixa de estoque concorrente
- **Arquivo:** useExits.js L44-48
- **Descricao:** Dois usuarios podem criar saida para mesmo produto simultaneamente. Estoque calculado no frontend (entries - exits) nao tem lock no DB. Pode causar overselling.
- **Recomendacao:** Adicionar check constraint ou trigger no DB que valide saldo >= 0.

### 🔴 ERR-03: Queries de dados iniciais ignoram erros
- **Arquivo:** App.jsx L209, L238, L243
- **Descricao:** `.then(({ data }) => ...)` sem checar `error`. Se Supabase retorna erro, `data` e null/undefined. State fica vazio sem feedback ao usuario.
- **Recomendacao:** Checar `{ data, error }` em todas as queries.

### 🟠 ERR-04: Catch blocks vazios em operacoes de Storage
- **Arquivos:** ShippingList.jsx L97, L195, L1287; ShippingForm.jsx L96
- **Descricao:** `try { ... } catch (_) {}` — falhas de upload/delete de fotos sao completamente silenciosas.
- **Recomendacao:** Pelo menos logar o erro.

### 🟠 ERR-05: refetchData nao checa erros de entries/exits
- **Arquivo:** useProducts.js L137-144
- **Descricao:** `Promise.all` com 3 queries. `entRes.error` e `exitRes.error` nunca sao checados. Calculo de estoque pode ficar incorreto.

### 🟠 ERR-06: Edge Functions sem retry para erros transientes
- **Arquivo:** TinyERPPage.jsx L62-74 (callFunction)
- **Descricao:** Se Edge Function retorna 429 (rate limit) ou 503 (temporario), erro e jogado diretamente ao usuario. Sem retry com backoff.
- **Recomendacao:** Implementar retry com backoff exponencial para 429/503.

### 🟠 ERR-07: Realtime subscriptions sem handler de erro
- **Arquivo:** useSupabaseCollection.js L88-103
- **Descricao:** `.subscribe()` sem `.on('error', ...)`. Se conexao WebSocket cai, UI fica com dados stale sem indicacao.
- **Recomendacao:** Adicionar handler de erro e indicador "offline" na UI.

### 🟠 ERR-08: Upsert de categorias default sem check de erro
- **Arquivo:** App.jsx L256-257
- **Descricao:** `supabaseClient.from('categories').upsert(cat)` sem checar retorno. Se falha, app assume categorias existem.

### 🟡 ERR-09: devolucaoEntries queries de duplicata ignoram erros
- **Arquivo:** devolucaoEntries.js L49-54, L63-67
- **Descricao:** `{ data: existing }` sem checar erro. Se query falha, `existing` e undefined, tratado como "nao existe" — cria duplicata.

---

## 4. Performance e Escalabilidade

### 🟠 PERF-01: Queries SELECT * sem limit em tabelas grandes
- **Arquivos:** useShippings.js L134 (`select('*')` sem limit), App.jsx L209, L243
- **Descricao:** Shippings pode crescer para milhares. Products ja usa paginacao (fetchAllRows), mas shippings, entries e exits nao.
- **Recomendacao:** Adicionar `.limit(1000)` ou paginacao.

### 🟠 PERF-02: Indices faltando em colunas filtradas frequentemente
- **Descricao:** Colunas usadas em filtros sem indices visiveis:
  - `products.sku` (8+ locais)
  - `shippings.nf_numero`, `shippings.status`, `shippings.date`
  - `entries.date`, `exits.date`
- **Recomendacao:** Criar indices.

### 🟠 PERF-03: Bundle sem code splitting — 1.7MB JS
- **Arquivo:** vite.config.js
- **Descricao:** Build gera chunk unico de ~1.7MB. Dependencias pesadas (pdfjs-dist ~200KB, xlsx ~400KB, jspdf ~50KB) incluidas no bundle principal.
- **Recomendacao:** Adicionar `manualChunks` no rollupOptions e dynamic imports.

### 🟡 PERF-04: Signed URLs de fotos geradas sequencialmente
- **Arquivo:** ShippingList.jsx L91-99
- **Descricao:** Loop sequencial gerando signed URL por foto. Deveria usar Promise.all.

### 🟡 PERF-05: Debounce timer sem cleanup no useEffect
- **Arquivo:** useSupabaseCollection.js L100
- **Descricao:** `setTimeout` de 500ms pode disparar apos unmount do componente.
- **Recomendacao:** Adicionar clearTimeout no cleanup do useEffect.

### 🔵 PERF-06: Console.log de debug em producao
- **Arquivos:** ShippingXMLImport.jsx (~20 logs), ShippingForm.jsx L113, ShippingManager.jsx L99-105
- **Descricao:** 19 `console.log()` de debug que deveriam ser removidos ou condicionais.

---

## 5. Qualidade do Codigo

### 🟡 QAL-01: Componentes muito grandes
- **Descricao:** ShippingList.jsx (1545 linhas), TinyNFeImport.jsx (1153), TinyERPPage.jsx (943). Dificeis de manter.
- **Recomendacao:** Quebrar em sub-componentes.

### 🟡 QAL-02: Status constants duplicados
- **Arquivos:** ShippingManager.jsx L24-42, statusLabels.js L8-24
- **Descricao:** Mesmos status definidos em dois arquivos com formatos diferentes.
- **Recomendacao:** Centralizar em `constants/shippingStatus.js`.

### 🟡 QAL-03: Logica duplicada entre componentes
- **Descricao:** `resizeImage()` em ShippingList e ShippingForm. Channel setup repetido em useHubs/useLocaisOrigem/useSupabaseCollection.
- **Recomendacao:** Extrair para utils compartilhados.

### 🔵 QAL-04: `substr()` depreciado
- **Arquivo:** helpers.js L10
- **Descricao:** `Math.random().toString(36).substr(2, 9)` — `substr` esta deprecated.
- **Recomendacao:** Usar `substring()`.

---

## 6. Deploy e Infraestrutura

### 🔴 DEP-01: Vulnerabilidade npm — xlsx sem fix disponivel
- **Descricao:** `xlsx 0.18.5` tem Prototype Pollution e ReDoS. **Sem fix disponivel.**
- **Recomendacao:** Avaliar substituicao por `exceljs` ou validar que uso atual nao e afetado.

### 🔴 DEP-02: Vulnerabilidade npm — picomatch (com fix)
- **Descricao:** `picomatch 4.0.0-4.0.3` tem ReDoS. Fix disponivel via `npm audit fix`.
- **Recomendacao:** Rodar `npm audit fix`.

### 🟡 DEP-03: Vercel config OK mas sem headers de seguranca
- **Arquivo:** vercel.json
- **Descricao:** Cache e rewrites configurados. Faltam headers de seguranca (ver SEC-03).

### 🔵 DEP-04: Free tier Supabase — projecao de crescimento
- **Descricao:** DB: 21MB de 500MB (4.2%). Transfer: depende do uso. Connections: 200 max.
  - **Projecao:** No ritmo atual (~500 produtos/mes, ~30 despachos/mes), banco atinge 50% em ~2 anos.
  - **Risco real:** Conexoes simultaneas durante sync pesado podem atingir limite de 200.

---

## 7. Edge Functions

### 🔴 EF-01: tiny-nf-diagnostico deve ser excluida
- **Descricao:** Funcao de debug que expoe detalhes internos da API Tiny. Qualquer usuario autenticado pode probe-ar endpoints.
- **Recomendacao:** Excluir imediatamente.

### 🔴 EF-02: tiny-sync-stock sem idempotencia
- **Descricao:** Se sync roda duas vezes com mesmo dado, cria ajustes duplicados. Sem verificacao de referencia existente.
- **Recomendacao:** Adicionar check de referencia unica antes de criar ajuste.

### 🔴 EF-03: tiny-sync-products sem limite de seguranca na paginacao
- **Descricao:** Loop `while (offset < totalProducts)` sem limite maximo. Se Tiny retorna totalProducts muito alto, funcao tenta baixar tudo ate timeout.
- **Recomendacao:** Adicionar `MAX_PRODUCTS = 50000` como safeguard.

### 🟠 EF-04: tiny-auth nao lida com refresh token expirado
- **Descricao:** Se refresh token expira (30 dias sem uso), `safeRefreshToken()` falha silenciosamente. Usuario precisa re-autorizar manualmente sem aviso.
- **Recomendacao:** Detectar erro de refresh expirado e informar usuario.

### 🟠 EF-05: rastrear-envio sem timeout em chamadas externas
- **Descricao:** Fetch para APIs de rastreio (Correios, MelhorRastreio) pode travar. Sem `Promise.race` com timeout.
- **Recomendacao:** Adicionar timeout de 10s por chamada externa.

### 🟠 EF-06: tiny-sync-nfe importacao duplicada parcial
- **Descricao:** Se importacao de NF com 5 itens falha apos item 2, proxima execucao re-importa itens 1-2 como duplicatas. Sem transacao atomica.

### 🟠 EF-07: tiny-download-nf sem validacao de input
- **Descricao:** Array `nfNumeros` aceito sem validacao de formato. Deveria validar que sao numericos e 1-20 digitos.

### 🟡 EF-08: Funcoes nao referenciadas no codigo
- **Descricao:** `tiny-sync-images` e `shopify-sync-images` existem mas nao sao chamadas do frontend. Podem ser dead code.

---

## Plano de Correcao Recomendado

### Prioridade 1 — 🔴 Criticos (corrigir imediatamente)

| # | Item | Esforco | Risco |
|---|------|---------|-------|
| 1 | DEP-02: `npm audit fix` (picomatch) | Pequeno | Seguro |
| 2 | EF-01: Excluir tiny-nf-diagnostico | Pequeno | Seguro |
| 3 | ERR-03: Checar erros em queries iniciais (App.jsx) | Pequeno | Seguro |
| 4 | DAT-01: Trocar generateId por crypto.randomUUID | Pequeno | Seguro |
| 5 | ERR-01: RPC atomico para shipping+exits | Grande | Requer cuidado |
| 6 | ERR-02: Check constraint de saldo no DB | Medio | Requer cuidado |
| 7 | EF-02: Idempotencia no tiny-sync-stock | Medio | Requer cuidado |
| 8 | EF-03: Limite de seguranca no tiny-sync-products | Pequeno | Seguro |

### Prioridade 2 — 🟠 Altos (corrigir em breve)

| # | Item | Esforco | Risco |
|---|------|---------|-------|
| 9 | SEC-01: Verificar RLS em todas as tabelas | Medio | Seguro |
| 10 | SEC-02: SuperAdmin para campo no banco | Pequeno | Seguro |
| 11 | ERR-06: Retry com backoff em Edge Functions | Medio | Seguro |
| 12 | ERR-07: Handler de erro em realtime subscriptions | Pequeno | Seguro |
| 13 | PERF-01: Adicionar limit/paginacao em queries | Pequeno | Seguro |
| 14 | PERF-02: Criar indices no banco | Pequeno | Seguro |
| 15 | PERF-03: Code splitting no Vite | Medio | Seguro |
| 16 | EF-04: Detectar refresh token expirado | Pequeno | Seguro |
| 17 | EF-05: Timeout em chamadas externas | Pequeno | Seguro |
| 18 | DAT-02: Normalizar HUBs ao salvar | Pequeno | Seguro |

### Prioridade 3 — 🟡 Medios (planejar para proximas sprints)

| # | Item | Esforco | Risco |
|---|------|---------|-------|
| 19 | SEC-03: Headers de seguranca no Vercel | Pequeno | Seguro |
| 20 | SEC-04: Validacao de upload (MIME/tamanho) | Pequeno | Seguro |
| 21 | SEC-05: Origin check no postMessage | Pequeno | Seguro |
| 22 | ERR-04: Logar erros de Storage em vez de silenciar | Pequeno | Seguro |
| 23 | PERF-06: Remover console.log de debug | Pequeno | Seguro |
| 24 | QAL-01: Quebrar componentes grandes | Grande | Seguro |
| 25 | QAL-02: Centralizar constantes de status | Pequeno | Seguro |
| 26 | DEP-01: Avaliar substituicao do xlsx | Medio | Requer pesquisa |
