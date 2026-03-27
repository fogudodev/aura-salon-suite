# DEPLOY_PLAYBOOK.md

This document defines the mandatory operational procedures for deploying changes to the Aura Salon Suite production environment (VPS + Self-hosted Supabase).

## ⚠️ MANDATORY DEVELOPMENT RULE
Whenever a new edge function is created, or any backend change requires a database change (new table, column, constraint, index, trigger, policy, SQL function, RPC, etc.), you **MUST** create a corresponding migration file in the repository (`supabase/migrations/`).
- **Never** rely on manual database-only changes in production.
- All database structure changes must be versioned and committed together with the related code.
- If a feature depends on a new DB structure, the migration must be created **before or together** with the implementation.
- This rule is binding for all future tasks.

---

## 1. Deployment Order (The Safety sequence)
When a change involves multiple layers, always follow this order to prevent downtime or runtime errors:

1.  **Database Migrations**: Apply structural changes first so the backend code has a schema to interact with.
2.  **Edge Functions**: Deploy the backend logic that consumes the new schema.
3.  **Frontend**: Deploy the UI changes last once the data layer and APIs are stable.

---

## 2. Layer-Specific Deployment

### A. Database Migrations
- **Tool**: Supabase CLI.
- **Commands (Local/Source)**:
  - Create new migration: `supabase migration new [description]`
  - Push to production VPS: `supabase db push` (Requires DB connection string configured).
- **Manual Verification**: Check the VPS database schema to confirm the new tables/columns are present.

### B. Edge Functions
- **Tool**: Supabase CLI.
- **Commands**:
  - Deploy single function: `supabase functions deploy [function-name]`
  - Set secrets (if env vars changed): `supabase secrets set [VAR_NAME]=[VALUE]`
- **Note**: Ensure the VPS is reachable over the network during deployment.

### C. Frontend
- **Tool**: npm / Web Server Sync.
- **Commands**:
  - Build: `npm run build`
  - Upload: Synchronize the `dist/` folder to the VPS web server (Nginx/Apache).
- **Environment Variables**: Verify that `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the build process match the production VPS.

---

## 3. Rollback Strategy

### Database
- **Action**: SQL Reversion scripts.
- **Procedure**: If a migration fails or causes issues, create a compensating migration to drop/alter the changes or restore from a VPS database backup.

### Edge Functions
- **Action**: Redeploy previous commit.
- **Procedure**: Checkout the last stable commit and run `supabase functions deploy [function-name]`.

### Frontend
- **Action**: Restore previous `dist/` build.
- **Procedure**: Keep the last 2-3 builds archived on the VPS to allow instant Nginx config pointing to the previous version.

---

## 4. VPS Commands (Cheat Sheet)
- **Check DB Status**: `docker ps | grep supabase_db`
- **Check CPU/RAM**: `top` or `htop`
- **View Edge Function Logs**: `supabase functions serve [function-name]` (on local) or check VPS file logs if redirected.
- **Test Internal Networking**: `curl -v [SUPABASE_URL]/functions/v1/[function-name]`
