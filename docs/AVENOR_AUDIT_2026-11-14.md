# Avenor — technical audit

**Audit date:** 14 November 2026  
**Repository:** `hugothomas593-dotcom/FinanceOS`  
**Scope:** GitHub source tree, application routes, financial engine, Supabase migrations, Vercel projects and deployment metadata.  
**Release verdict:** NOT PRODUCTION READY.

## Executive findings

The repository is a functional prototype foundation, not a commercial MVP. It contains a Next.js App Router application, authenticated API routes, a deterministic TypeScript forecasting engine, CSV parsing, Stripe scaffolding, SQL migrations and unit tests. The dashboard remains predominantly a local demonstration and is not yet a persisted company finance workspace.

## Confirmed application gaps

1. The main dashboard initializes financial assumptions directly in the client. It does not load an approved model or actuals from the authenticated workspace.
2. The Decision Simulator calculates locally. Its Decision Ledger is React component state and is lost on reload; saved scenarios do not use the scenarios API.
3. The visible Copilot preview is rule-based and does not call the server Copilot API.
4. CSV actuals are written through an authenticated API but are not reconciled into dashboard forecasts. The import route now creates stable row references to avoid duplicate records when the same CSV is imported again.
5. The fundraising and investor-reporting views are simplified calculators and must not be presented as validated financial reporting.
6. Password reset was absent from the sign-in flow. The callback previously ignored the result of exchanging the authorization code; both flows have been improved in this branch.
7. Branding was inconsistent across metadata, onboarding and the dashboard.

## Confirmed infrastructure and release gaps

### Supabase

- The Supabase URL configured in the Vercel Production environment is `https://qeitvqzujytiiupmkmyb.supabase.co`, matching the project reference in the original brief.
- The connected Supabase account does **not** have permission to inspect that production project. Its project list exposes a different project, `qeitvqzujytiiupmkmyp`, in the EU region.
- Migrations `001` through `006` were temporarily applied to the accessible but different project while checking whether it was the intended environment. After confirming the mismatch, all ten tables and the helper functions created by this work were dropped. A rollback migration was recorded. The tables were verified to contain zero rows before rollback; no user data was deleted.
- The accessible project now has no public application tables. **No migrations have been applied to the production Supabase project `qeitvqzujytiiupmkmyb`.** Its schema and RLS policies remain unverified until access is granted to that exact project.
- Supabase production credentials were not copied into preview environments. Previews must not share the production database by default.

### Vercel

- Three projects (`financeos`, `financeoss`, and `financeosss`) were linked to the same Git repository, so one commit generated multiple preview deployments.
- The `financeos` project had no framework selected and required a static `public` output directory. This caused the `STATIC_BUILD_NO_OUT_DIR` failures on later commits. Its preview deployments are now disabled; its framework, output and Node settings were also aligned to Next.js.
- The exact failure in preview deployment for commit `09a82dc` was a TypeScript error in middleware while destructuring the nullable Supabase `getClaims()` result. That code was corrected in a later commit and the current GitHub Actions build/typecheck passes.
- `financeoss` was a duplicate Next.js project. Its previews are disabled and its framework/output/Node settings are aligned.
- `financeosss` is the intended project because it owns the configured domain `financeosss.vercel.app`. That domain remains attached and verified. Its framework is Next.js, Node is set to 22.x and the output directory is auto-detected.
- Automatic preview deployments are currently disabled on all three projects while the correct Supabase access and isolated preview environment are unresolved. Existing Production domains and the Production deployment were not changed. No production deployment was triggered during this work.
- The current Production deployment still points to the pre-hardening `main` commit. The code changes in this PR have not been merged or deployed to Production.

### CI and repository

- The original repository had no `package-lock.json`; dependency resolution is not yet fully reproducible.
- A GitHub Actions workflow now runs dependency installation, 15 Vitest tests, a Next.js production build and a TypeScript check. All passed on the latest validated hardening commit before this documentation refresh.
- CI does not replace browser end-to-end tests, two-organization RLS tests, Stripe test-mode acceptance or a production smoke test.

## Reusable components

- Next.js 15 App Router and TypeScript structure.
- Supabase SSR client and cookie-based session middleware.
- Organization membership model and API membership checks.
- SQL migrations for organizations, model versions, actuals, scenarios, audit events and Stripe event receipts.
- Deterministic forecast engine and CSV parser with unit tests.
- Stripe Checkout and signed webhook scaffolding.

## Work completed in the hardening branch

- Added a repository `.gitignore` and safe `.env.example`.
- Upgraded Supabase SSR support to the 0.12 line, added a shared public-key configuration helper, and aligned middleware with Supabase's `getClaims()` guidance and cache headers.
- Hardened the auth callback and added password reset request/update screens.
- Made CSV imports idempotent at the transaction-row level and use the workspace's configured base currency.
- Added unit tests for deterministic import references.
- Aligned visible product naming to Avenor.
- Added a CI workflow for type checking, unit tests and production build validation.
- Audited and corrected Vercel project build settings; paused duplicate and automatic preview deployments to stop repetitive failed-preview emails.
- Rolled back the temporary schema creation on the wrong, accessible Supabase project after identifying that Vercel Production points to a different project. No production Supabase schema changes were made.

## Prioritized remaining work

### P0 — before customer financial data
1. Grant the connected Supabase integration access to the exact production project `qeitvqzujytiiupmkmyb`, then inspect its tables, migrations, RLS policies and advisors.
2. Confirm and apply versioned migrations to the intended database only.
3. Test RLS with at least two users across at least two organizations, including read, insert, update and delete attempts.
4. Verify sign-up, email confirmation, sign-in, password reset, session refresh, sign-out and workspace onboarding end-to-end.
5. Connect the dashboard and assumptions editor to persisted approved model versions; remove illustrative assumptions from real workspaces.
6. Reconcile imported actuals into the model with transaction preview, error reporting, duplicate feedback and currency handling.
7. Persist scenarios and Decision Ledger entries in Supabase, with snapshots of assumptions, model version and calculated outputs.
8. Create an isolated preview/staging Supabase environment, add preview-only credentials, and re-enable a single Vercel preview project.

### P1 — before charging customers
1. Connect the Copilot UI to the authenticated Copilot endpoint and persist conversation threads; constrain AI explanations to deterministic outputs and evidence.
2. Complete Stripe entitlements, billing portal, cancellation, failed payment, invoices, VAT and webhook replay/reconciliation.
3. Add rate limiting, origin/CSRF protections, structured observability, error tracking, backup/restore tests and incident procedures.
4. Complete GDPR notices, terms, DPA, deletion/export workflows, retention rules and subprocessor review.
5. Validate payroll, tax, VAT, working capital, debt, foreign exchange and other model assumptions with qualified specialists.

### P2 — product differentiation
1. Build the signature "What Can I Afford?" constrained optimization workflow.
2. Add downside, base and upside scenario comparison, decision thresholds and critical-cash alerts.
3. Expand European hiring-cost data only with dated, source-backed and reviewable assumptions.
4. Validate willingness to pay with French Pre-Seed and Seed founders before broad integrations.

## Important limitations

This audit is based on source code and provider metadata available during this session. It is not an independent penetration test, a financial-model validation, a legal review or proof of production health. Production Supabase access is still missing; no production database migration or production deployment was performed.
