# PROJECT_MAP.md

## High-Level Architecture

### Frontend (Vite + React)
- **Core Routes**: `src/App.tsx`
- **Dashboards**: `src/pages/Dashboard.tsx`, `src/pages/Admin.tsx`
- **Public Pages**: `src/pages/PublicBooking.tsx`, `src/pages/PublicPage.tsx`
- **Hooks**: `src/hooks/` (Database abstraction/state)
- **Library**: `src/lib/api-client.ts`

### Backend (Supabase + VPS)
- **Database**: PostgreSQL (managed via migrations in `supabase/migrations/`)
- **Functions**: Deno-based Supabase Edge Functions in `supabase/functions/`
- **Auth**: Supabase Auth with custom `handle_new_user` trigger.
- **Messaging**: Integration with Evolution API for WhatsApp automation.
- **Storage**: `professionals` bucket for assets (logo, cover).

### Key Workflows
- **Signup**: Frontend -> Supabase Auth -> `handle_new_user` trigger -> `professionals` table -> Automatic Slug Generation trigger.
- **Admin Creation**: Admin UI -> `admin-create-professional` Edge Function -> Supabase Auth Admin -> `handle_new_user` trigger.
- **Public Booking**: URL with `/:slug` -> `PublicBooking.tsx` -> Fetch profile by slug -> Render booking UI.
