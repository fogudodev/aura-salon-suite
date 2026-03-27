# AI_GUIDELINES.md

Follow these strict rules when working on this repository:

1.  **Architecture First**: Never assume cloud Supabase behavior. The system uses self-hosted Supabase on a VPS.
2.  **Infrastructure Context**: Backend and production infra are on a VPS. Production logic might exist directly on the VPS and not be fully represented in this repo.
3.  **Trace Before Change**: Always map dependencies before refactoring. Trace the full path for authentication, webhooks, realtime, or automation flows before editing.
4.  **Preserve Business Rules**: Always respect existing business logic (booking steps, scheduling boundaries, RFM scoring).
5.  **Impact Analysis**: Before implementing, identify if code affects frontend, edge functions, database, VPS, or external APIs.
6.  **Consistency Over Best Practices**: Prefer architectural consistency with existing code patterns over generic "best practices" that might break specific VPS/Self-hosted optimizations.
7.  **Derivation**: When uncertain, derive behavior from existing code patterns in the repository.
8.  **Production Awareness**: Propose changes considering impact on self-hosted Supabase services, webhooks, auth, and environment variables.
9.  **Database Versioning**: Never bypass migrations. Every DB structural change must be tracked specifically in `supabase/migrations/` and committed with the code.

### Backend Completion Checklist:
- Verify if a migration was needed and created.
- Ensure the deployment order is clearly documented.
- Validate that VPS and Self-Hosted Supabase production risks were addressed.
