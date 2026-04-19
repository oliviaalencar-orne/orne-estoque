# Orne Estoque

Sistema web de gestão logística da ORNE™ (iluminação e decoração).

- **Stack**: React 18 + Vite, Supabase (Postgres + Auth + Edge Functions Deno), Vercel
- **Produção**: https://orne-estoque.vercel.app
- **Staging**: https://orne-estoque-staging.vercel.app

## Scripts

```bash
npm run dev      # servidor de desenvolvimento (porta 3000)
npm run build    # build para produção em ./dist
npm run preview  # preview do build
```

## Variáveis de ambiente

Ver `.env.example`. Em produção/staging, as variáveis de build (Sentry,
commit SHA) são injetadas pela Vercel.

## Observabilidade

O frontend está instrumentado com Sentry para captura automática de
erros (Fase A — frontend only; Edge Functions virão na Fase B).

**Dashboard:** https://sentry.io/organizations/<org>/projects/orne-estoque-frontend/

**Ambientes**
- `production` — erros de `orne-estoque.vercel.app` e `estoque.ornedecor.com`
- `staging` — erros de `orne-estoque-staging.vercel.app`
- `development` — localhost (não enviado, para não poluir)

**Privacidade (LGPD).** Antes de enviar qualquer evento, o cliente faz
um scrub recursivo dos campos sensíveis: `supplier`, `client`,
`cliente`, `fornecedor`, `recebedor_nome`, `email`, `telefone`, `cpf`,
`cnpj`, `chave_acesso`, `motivo_devolucao`, `observacoes`, `destino`,
`endereco`. O user context enviado contém apenas `id` (UUID) e `role`
— nunca email/nome/telefone.

**Session Replay.** Gravamos apenas os 30s antes de erros (nenhuma
sessão aleatória), com `maskAllText`, `maskAllInputs` e
`blockAllMedia` ativos — todo texto visível fica mascarado e mídias
bloqueadas no replay.

**Release tracking.** Cada deploy na Vercel gera um release com o SHA
do commit (`VERCEL_GIT_COMMIT_SHA`). Source maps são enviados para o
Sentry e **removidos do bundle final** (não ficam públicos em `dist/`).

**Filtros de ruído.** `ResizeObserver loop limit`, `AbortError`, erros
de extensões (`chrome-extension://`, `moz-extension://`) e
`Non-Error promise rejection captured` são descartados.

**Reportar incidente.** Quando um usuário relatar um erro, peça o
"ID do erro" que aparece na tela de fallback. Busque por esse ID no
dashboard Sentry.

## Estrutura relevante

```
src/
├── lib/
│   ├── sentry.js          # initSentry + beforeSend + scrub
│   └── sentry-user.js     # setSentryUser / clearSentryUser
├── components/
│   └── ErrorBoundary.jsx  # Sentry.ErrorBoundary + fallback UI
├── hooks/
│   └── useAuth.js         # seta Sentry user context ao logar
└── main.jsx               # initSentry() + <ErrorBoundary>
supabase/functions/        # Edge Functions Deno (sem Sentry ainda — Fase B)
```

## Deploy

Branch `main` → Vercel production.
Branch `staging` → Vercel preview (staging).
Nunca fazer merge direto em `main` sem validação em staging.
