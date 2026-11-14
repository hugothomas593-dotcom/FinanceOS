# Avenor setup

## Important distinction
Supabase hosts the PostgreSQL database and authentication. It does **not** host the Next.js website. The SQL file in `supabase/` is what you paste into Supabase SQL Editor. The application source is deployed separately (for example, to Vercel, usually from a Git repository).

## Supabase
1. Open the Supabase project and SQL Editor.
2. Create a new query.
3. Paste the full contents of `supabase/FINANCEOS_SETUP_ALL.sql`.
4. Run it once on a fresh project. If it errors, stop and inspect the exact error; do not repeatedly run partial SQL.
5. Verify the tables and policies in Table Editor / Authentication.

## Application environment variables
Set these in the hosting provider's environment-variable settings (and in a local `.env.local` only for local development):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` remains supported) (the Supabase publishable key is accepted here)
- `NEXT_PUBLIC_APP_URL`
- `OPENAI_API_KEY` (server-side only, optional until Copilot is enabled)
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID` (server-side only, only when billing is configured)
- `SUPABASE_SERVICE_ROLE_KEY` (server-side only; never expose it to the browser)

Do not commit `.env.local` or put secret keys in `NEXT_PUBLIC_*` variables.

## Release warning
This repository is an engineering build, not a production-certified product. The dashboard still contains demo assumptions and several workflows are incomplete. Before customer use, complete a full dependency install, `npm run typecheck`, `npm test`, `npm run build`, RLS cross-tenant tests, Stripe test-mode acceptance, browser end-to-end tests, backup/restore testing, and a security/privacy review. Do not import real customer financial data or accept payments before those checks pass.
