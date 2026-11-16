# Avenor setup

## Important distinction
Supabase hosts the PostgreSQL database and authentication. It does **not** host the Next.js website. The SQL file in `supabase/` is what you paste into Supabase SQL Editor. The application source is deployed separately (for example, to Vercel, usually from a Git repository).

## Supabase
1. Open the Supabase project and SQL Editor.
2. Create a new query.
3. Paste the full contents of `supabase/FINANCEOS_SETUP_ALL.sql`.
4. Run it once on a fresh project. It provides the baseline through migration 011. If it errors, stop and inspect the exact error; do not repeatedly run partial SQL.
5. Then apply `supabase/migrations/012_api_rate_limits.sql` and `supabase/migrations/013_preserve_trial_claim_after_workspace_deletion.sql` in order. On an existing project already through migration 011, apply only those two new migrations.
6. Verify the tables, RLS policies and service-role-only permissions in Table Editor / Authentication.

## Application environment variables
Set these in the hosting provider's environment-variable settings (and in a local `.env.local` only for local development):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (preferred; legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` remains supported)
- `NEXT_PUBLIC_APP_URL`
- `AI_GATEWAY_API_KEY` (server-side only; optional for local development outside Vercel. Vercel deployments use platform OIDC for AI Gateway)\n- `AI_GATEWAY_MODEL` (optional; defaults to `anthropic/claude-sonnet-4.6`)
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID` (server-side only, only when billing is configured)
- `SUPABASE_SERVICE_ROLE_KEY` (server-side only; never expose it to the browser)

Do not commit `.env.local` or put secret keys in `NEXT_PUBLIC_*` variables.

## Release warning
This repository is an engineering build, not a production-certified product. The dashboard still contains demo assumptions and several workflows are incomplete. Before customer use, complete a full dependency install, `npm run typecheck`, `npm test`, `npm run build`, RLS cross-tenant tests, Stripe test-mode acceptance, browser end-to-end tests, backup/restore testing, and a security/privacy review. Do not import real customer financial data or accept payments before those checks pass.
