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

### Cron de rastreio

A atualização automática de rastreios é orquestrada pela Edge Function
`cron-update-tracking` no Supabase. Ela busca shippings pendentes,
delega chamadas à `rastrear-envio` (ME + fallback Correios/melhorrastreio)
e persiste os resultados. Duração típica 50-120s para 200+ pendentes.

**Arquitetura atual (pg_cron → EF direto):**

```
pg_cron (Supabase) ──► trigger_cron_update_tracking_ef() ──► cron-update-tracking EF ──► rastrear-envio EF ──► DB
                            (pg_net + JWT service_role,                (teto 150s, retorna summary estruturado)
                             timeout 160s)
```

**Por que EF direto em vez do wrapper Vercel?** O wrapper Vercel
(`/api/cron/update-tracking`) tem teto de 60s no plano Hobby. A EF tem
teto de 150s. Chamar a EF direto via `pg_net` deu visibilidade completa
do return path (status, duration, body) dentro de `net._http_response`.
O wrapper Vercel é mantido como terceira camada de redundância (ver abaixo).

**Schedules (4x/dia, espaçados no expediente):**

| Job | Cron | BRT |
|---|---|---|
| `cron-ef-08h-brt` | `0 11 * * *` | 08:00 — início |
| `cron-ef-12h-brt` | `0 15 * * *` | 12:00 — pico |
| `cron-ef-16h-brt` | `0 19 * * *` | 16:00 — fim da tarde |
| `cron-ef-20h-brt` | `0 23 * * *` | 20:00 — noite |

**Redundâncias (3 camadas):**

1. **pg_cron (principal)** — 4x/dia chamando EF direto. Secret
   `production_service_role_key` (JWT legacy) no vault.
2. **Vercel Cron (fallback)** — `0 11 * * *` em `vercel.json` chamando
   o wrapper `/api/cron/update-tracking`, que por sua vez chama a EF.
   Sob carga que ultrapasse 60s o wrapper morre mas a EF continua
   (trabalho é persistido; apenas o return path é perdido). Mantido por
   7 dias após corte do pg_cron antigo como safety net.
3. **Disparo manual** — `SELECT public.trigger_cron_update_tracking_ef();`
   (catch-up ou debug).

Migrations:
- `20260422_pg_cron_update_tracking.sql` — setup inicial pg_net/pg_cron.
- `20260423_trigger_cron_ef_direct.sql` — função `trigger_cron_update_tracking_ef`.
- `20260423b_pg_cron_ef_4x_daily.sql` — substitui 2 jobs antigos pelos 4 novos.

**Consultar execuções do pg_cron:**

```sql
-- últimas execuções agendadas
SELECT jobname, status, start_time, end_time, return_message
FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 20;

-- respostas HTTP do pg_net (status 200/erros/duration da EF)
SELECT id, status_code, LEFT(content::text, 300) AS content, error_msg, created
FROM net._http_response
ORDER BY created DESC
LIMIT 20;

-- Jobs atualmente agendados
SELECT jobname, schedule, command, active FROM cron.job ORDER BY schedule;
```

**Disparar manualmente** (útil para catch-up ou debug):

```sql
-- Preferência: EF direto (visibilidade completa, ~60-120s)
SELECT public.trigger_cron_update_tracking_ef();

-- Alternativa: via Vercel wrapper (legado, timeout em 60s se EF demorar)
SELECT public.trigger_vercel_cron_update_tracking();
```

Retorna o `request_id` do pg_net — cruze com `net._http_response` após
a execução para ver o summary JSON da EF (fases, duration_ms, errors).

**Desabilitar Vercel cron (após 7 dias de pg_cron estável):**

```bash
# Remover o bloco `crons:` de vercel.json
# Commit + push em main → próximo deploy desabilita
```

Validar que pg_cron rodou no horário esperado via
`cron.job_run_details` antes de desativar a redundância.

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
