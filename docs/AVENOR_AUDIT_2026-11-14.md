# Avenor — technical audit

**Audit date:** 14 November 2026  
**Repository:** `hugothomas593-dotcom/FinanceOS`  
**Scope:** GitHub source, application routes, finance engine, Supabase schema and Vercel deployment configuration.  
**Release verdict:** NOT PRODUCTION READY.

## Executive findings

The repository is a prototype foundation, not yet a commercial MVP. It contains a Next.js App Router application, authenticated API routes, a deterministic TypeScript forecasting engine, CSV parsing, Stripe scaffolding, SQL migrations and unit tests. The dashboard now loads a workspace's latest saved model and persisted scenarios; end-to-end acceptance, reconciliation and several product workflows remain incomplete.

## Application gaps confirmed

1. The main dashboard now loads a workspace's latest model version from the authenticated models API and supports saving draft/approved model versions. The simulator still calculates locally and requires a saved base model.
2. Saved Decision Ledger scenarios now load from and persist to Supabase, including a model-version reference and deterministic output snapshot. This workflow has passed build/typecheck but still needs browser end-to-end and tenant-isolation testing.
3. The visible Copilot preview is rule-based and does not call the server Copilot API.
4. CSV actuals can be written through an authenticated API. The import path uses stable row references and workspace currency; the dashboard displays imported row counts but imported actuals are not yet reconciled into forecast assumptions.
5. Fundraising and investor-reporting views are simplified calculators, not validated financial reporting.
6. Password reset screens and a hardened auth callback have been added in the hardening branch; these flows still require end-to-end verification.
7. Branding has been aligned to Avenor in the screens touched by this branch.

## Supabase — confirmed production project and schema

- The user confirmed that Supabase project `qeitvqzujytiiupmkmyp` (workspace label `cleardesk.pro@gmail.com's Project`, region `eu-west-1`) is the intended Avenor project.
- The project's original application schema was empty after a prior cleanup. A controlled recovery script was added at `supabase/recovery/2026-11-14_restore_avenor_after_manual_rollback.sql` and applied to the confirmed project.
- The restored schema contains 10 public application tables: organizations, organization_members, financial_actuals, model_versions, scenarios, copilot_threads, copilot_messages, audit_events, subscriptions and stripe_webhook_events.
- RLS is enabled on all 10 tables. A database check confirmed 21 policies assigned to authenticated users; the public onboarding wrapper is SECURITY INVOKER, anonymous users cannot execute it, and authenticated users can.
- All ten tables currently contain zero business rows. No customer financial data was present or deleted.
- The Supabase security advisor reports one informational finding: `stripe_webhook_events` has RLS enabled with no client-facing policies. This table is deliberately server-only; privileges are revoked from public/anon/authenticated and granted to service_role. No warning-level security finding was returned.
- Performance advisor "unused index" notices are expected at this stage because this is a newly initialized database with no application activity.

## Vercel — project and environment state

- Three Vercel projects had been linked to the same Git repository: `financeos`, `financeoss` and `financeosss`.
- The user-facing domain `financeosss.vercel.app` belongs to `financeosss` and remains verified and attached.
- The duplicate projects `financeos` and `financeoss` had previews disabled. The canonical project's automatic previews are also paused to prevent them from using Production credentials before an isolated staging environment exists.
- All three projects were aligned to Next.js, automatic output-directory detection and Node 22.x. The former `financeos` project had been forcing a static `public` output directory, causing `STATIC_BUILD_NO_OUT_DIR` notifications.
- The failed preview build for commit `09a82dc` was caused by a nullable Supabase `getClaims()` type access in middleware. This was corrected in the hardening branch; subsequent GitHub CI builds pass.
- Vercel Production environment variables were verified against the user-confirmed Supabase project:
  - `NEXT_PUBLIC_SUPABASE_URL` matches `https://qeitvqzujytiiupmkmyp.supabase.co`.
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` matches that project's legacy anon key.
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is set to that project's publishable key.
- Environment variable changes apply to the next deployment/build. The currently active Production deployment remains on the old `main` commit; no Production redeployment has been triggered.
- Preview deployments remain paused until a separate staging Supabase project/credentials can be provided. Do not point preview builds to Production data.

## CI and repository

- Added `.gitignore`, `.env.example`, shared Supabase public-key config, auth callback hardening, forgot/reset password pages, stable CSV import references, regression tests, technical audit and GitHub Actions CI.
- The latest CI run before the most recent documentation/recovery-script commits passed 15/15 Vitest tests, Next.js production build and TypeScript. A new run is triggered by the latest commit.
- The original repository had no `package-lock.json`; dependency resolution should be made reproducible before release.
- CI does not replace browser end-to-end testing, multi-tenant RLS tests, a Stripe test-mode acceptance test or Production smoke testing.

## Work completed in this hardening pass

- Added repository hygiene files and environment-variable guidance.
- Connected the dashboard to authenticated workspace/model APIs and persisted Decision Ledger scenarios with model-version snapshots.
- Upgraded `@supabase/ssr` to 0.12.7, centralized the public Supabase key, and updated middleware to use `getClaims()` and preserve refreshed cookies/cache headers.
- Hardened the auth callback and added password reset request/update screens.
- Made CSV imports idempotent at the transaction-row level and use workspace currency.
- Added deterministic import-reference tests.
- Aligned visible app branding and metadata to Avenor.
- Added CI for unit tests, production build and type checking.
- Restored the confirmed Supabase schema and verified RLS/privileges.
- Corrected Vercel Production Supabase URL and keys, and disabled duplicate/automatic previews while staging remains unavailable.

## Prioritized remaining work

### P0 — before customer financial data
1. Add a separate staging Supabase project and preview-only credentials; re-enable one Vercel preview project only after isolation is verified.
2. Test RLS with at least two users across at least two organizations, including read/insert/update/delete attempts.
3. Verify sign-up, email confirmation, sign-in, password reset, session refresh, sign-out and workspace onboarding end-to-end.
4. Finish the model workflow: model editing/version selection, review controls, and clear draft-versus-approved semantics across all screens.
5. Complete CSV import preview, validation, error reporting, duplicate feedback and actuals-to-forecast reconciliation.
6. Connect the Copilot UI to the authenticated Copilot API and persist threads.
7. Only then merge and redeploy to Production; run authenticated smoke tests on the canonical domain.

### P1 — before charging customers
1. Connect the Copilot UI to the authenticated Copilot API and persist threads; constrain AI to explain deterministic outputs and evidence.
2. Complete Stripe entitlements, customer portal, cancellation, failed payments, invoices, tax and webhook reconciliation.
3. Add rate limiting, origin/CSRF protections, observability, error tracking, backup/restore tests and incident procedures.
4. Complete GDPR notices, terms, DPA, data deletion/export, retention and subprocessor review.
5. Validate payroll, tax, VAT, working capital, debt, FX and other modelling assumptions with qualified specialists.

### P2 — product differentiation
1. Build "What Can I Afford?" as a constrained decision engine.
2. Add downside/base/upside comparisons, decision thresholds and cash alerts.
3. Expand European hiring assumptions only with dated, source-backed and reviewable data.
4. Validate willingness to pay with French Pre-Seed and Seed founders.

## Limitations

This is a source/configuration audit, not an independent penetration test, financial-model validation, legal review or proof that the application is ready for public launch. The production database schema is now initialized, but the current app deployment has not been updated and end-to-end acceptance remains incomplete.
