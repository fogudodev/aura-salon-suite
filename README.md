# Aura Salon Suite / Gende

SaaS multi-tenant para salões de beleza e profissionais autônomos.

## Stack real

- Frontend: React 18 + TypeScript + Vite
- UI: Tailwind + shadcn/ui + Radix
- Estado remoto: TanStack Query
- Backend: Supabase self-hosted em VPS
- Edge Functions: Deno
- Integrações principais: Stripe, Evolution API, Google Calendar, Gemini

## Premissas importantes

- Este projeto não usa Supabase Cloud.
- Parte da operação de produção pode depender de configuração manual na VPS.
- O banco e as migrations são a fonte de verdade para comportamento crítico.
- Mudanças estruturais de banco devem passar por `supabase/migrations/`.

## Fluxos centrais

- Booking público em `/:slug` via `src/pages/PublicBooking.tsx`
- Configuração da página pública em `/public-page` via `src/pages/PublicPage.tsx`
- Booking público atual usa RPCs:
  - `get_available_slots_v2`
  - `create_public_booking_v2`
  - `get_public_payment_config`
  - `get_public_client_by_phone`
  - `get_public_review_context`

## Desenvolvimento local

Pré-requisitos:

- Node.js 18+
- npm

Instalação:

```sh
npm install
```

Rodar frontend:

```sh
npm run dev
```

Build de produção:

```sh
npm run build
```

Testes:

```sh
npm test
```

Lint:

```sh
npm run lint
```

## Estrutura útil

- `src/App.tsx`: registro principal de rotas
- `src/pages/`: páginas e containers
- `src/components/`: componentes reutilizáveis
- `src/hooks/`: acesso a dados e lógica de tela
- `src/lib/`: utilitários e clientes
- `supabase/migrations/`: schema, RPCs e triggers
- `supabase/functions/`: Edge Functions

## Documentação interna

- `ARCHITECTURE_BRIEFING.md`
- `DOMAIN_OPERATIONS_MAP.md`
- `PROJECT_STANDARDS.md`
- `PROJECT_MAP.md`
- `AI_GUIDELINES.md`

## Git

Fluxo básico:

```sh
git status
git add <arquivos>
git commit -m "feat: descrição"
git push origin <branch>
```

Como o worktree pode conter mudanças locais não relacionadas, prefira `git add` por arquivo em vez de `git add .`.
