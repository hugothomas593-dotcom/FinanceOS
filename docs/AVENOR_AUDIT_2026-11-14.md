# Avenor — technical audit

**Audit date:** 14 November 2026  
**Repository:** `hugothomas593-dotcom/FinanceOS`  
**Scope:** GitHub source tree, application routes, financial engine, Supabase migration files, project metadata and available deployment status.  
**Release verdict:** NOT PRODUCTION READY.

## Executive findings

The repository is a functional prototype foundation, not a commercial MVP. It contains a Next.js App Router application, authenticated API routes, a deterministic TypeScript forecasting engine, CSV parsing, Stripe scaffolding, SQL migrations and unit tests. The dashboard remains predominantly a local demonstration and is not yet a persisted company finance workspace.

## Confirmed application gaps

1. The main dashboard initializes financial assumptions directly in the client. It does not load an approved model or actuals from the authenticated workspace.
2. The Decision Simulator calculates locally. Its Decision Ledger is React component state and is lost on reload; saved scenarios do not use the scenarios API.
3. The visible Copilot preview is rule-based and does not call the server Copilot API.
4. CSV actuals are written through an authenticated API but are not reconciled into dashboard forecasts. Repeated imports previously generated a new timestamp-based source reference, so duplicates were not reliably idempotent.
5. The fundraising and investor-reporting views are simplified calculators and must not be presented as validated financial reporting.
6. Password reset was absent from the sign-in flow. The callback previously ignored the result of exchanging the authorization code.
7. Branding was inconsistent across metadata, onboarding and the dashboard.

## Confirmed infrastructure and release gaps

- The repository contains migrations `001` through `004`, but the connected Supabase project inspected during this audit returned no public tables and no migration history.
- The Supabase project visible to the connected account did not exactly match the project reference recorded in the original project brief. No database changes were applied.
- GitHub reported no Actions workflow runs for the inspected latest commit. No workflow files were present in the original repository tree.
- GitHub status checks showed multiple Vercel contexts for similarly named projects: one failed deployment context and separate successful contexts. These are not sufficient to conclude that the user-facing domain is healthy.
- The Vercel team required a one-time access approval before project configuration and build logs could be inspected.
- The original repository had no `package-lock.json`; dependency resolution was therefore not fully reproducible.
- The existing build-status notes state that a complete Next.js build, full TypeScript project check, Vitest suite, Supabase migration execution, cross-tenant RLS tests, Stripe test-mode acceptance and end-to-end tests had not been completed.

## Reusable components

- Next.js 15 App Router and TypeScript structure.
- Supabase SSR client and cookie-based session middleware.
- Organization membership model and API membership checks.
- SQL migrations for organizations, model versions, actuals, scenarios, audit events and Stripe event receipts.
- Deterministic forecast engine and CSV parser with unit tests.
- Stripe Checkout and signed webhook scaffolding.

## Work started in this branch

- Added a repository `.gitignore` and safe `.env.example`.
- Upgraded Supabase SSR support to the 0.12 line, added a shared public-key configuration helper, and aligned middleware with Supabase's current `getClaims()` guidance and session cache headers.
- Hardened the auth callback and added password reset request/update screens.
- Made CSV imports idempotent at the transaction-row level and use the workspace's configured base currency.
- Added unit tests for deterministic import references.
- Aligned visible product naming to Avenor.
- Added a CI workflow for type checking, unit tests and production build validation.

## Prioritized remaining work

### P0 — before customer financial data
1. Confirm the correct Supabase project and apply versioned migrations in a controlled manner.
2. Test RLS with at least two users across at least two organizations, including read, insert, update and delete attempts.
3. Verify sign-up, email confirmation, sign-in, password reset, session refresh, sign-out and workspace onboarding end-to-end.
4. Connect the dashboard and assumptions editor to persisted approved model versions; remove illustrative assumptions from real workspaces.
5. Reconcile imported actuals into the model with transaction preview, error reporting, duplicate feedback and currency handling.
6. Persist scenarios and Decision Ledger entries in Supabase, with snapshots of assumptions, model version and calculated outputs.
7. Verify build and runtime logs for the exact Vercel project and production domain.

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

This audit is based on the source tree and the connected provider metadata available during this session. It is not an independent penetration test, a financial-model validation, a legal review or proof of production health. No production deployment or database migration was performed during this audit.
