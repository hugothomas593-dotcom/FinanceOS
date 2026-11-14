# Avenor engineering status — 14 November 2026

## Work completed in this pass
- Hardened deterministic financial input validation: finite numbers, bounded growth assumptions, integer forecast horizon, bounded headcount and forecast overflow checks.
- Expanded finance regression tests for hiring costs, cash-flow arithmetic, non-finite inputs, invalid horizons and positive-cash-flow runway behavior.
- Improved CSV parsing: strict column counts/quotes, strict ISO calendar dates, European decimal-comma and thousands separator handling, file-size and row limits.
- Added CSV regression tests for locale amounts and malformed input.
- Added authenticated organization listing and changed login/onboarding navigation to avoid creating a new workspace on every sign-in.
- Added dashboard route protection and workspace membership routing in middleware.
- Validated approved Copilot model assumptions before financial calculations.
- Hardened Stripe checkout by removing caller-controlled redirect URLs and deriving return URLs from the configured application origin.
- Hardened Stripe webhook signature verification, timestamp tolerance, payload validation, retry handling, and event receipt idempotency.
- Added migration `004_stripe_webhook_idempotency.sql` and updated the combined setup SQL.

## Validation actually performed
- TypeScript compilation of the standalone financial engine and CSV parser: passed.
- Executed Node regression checks for forecast arithmetic, hiring payroll and one-off costs, European CSV amount parsing, and invalid-input rejection: passed.
- Full project `tsc`/Next.js build and Vitest suite: not completed because dependencies are not installed; `npm install` timed out while reaching the package registry.
- Supabase SQL migration execution, RLS cross-tenant tests, Stripe test-mode webhooks, browser E2E tests and deployment: not performed.

## Release status: NOT PRODUCTION READY
The dashboard still uses illustrative local demo assumptions and a session/local-state decision ledger. Several product capabilities are API scaffolds rather than finished end-to-end workflows. The following remain release blockers:
- Wire dashboard, assumptions, decision ledger, import, fundraising and reporting screens to authenticated persisted data; remove demo identity and demo financial data from real workspaces.
- Add password reset, organization switching, invitation/role management, account settings, account deletion and data export.
- Complete actuals import preview, duplicate handling, currency mapping, import rollback/reconciliation, and connect data to the forecasting model.
- Complete accounting/banking/payroll integrations with provider approvals and tested synchronization.
- Extend financial model for working capital, VAT/tax timing, receivables/payables, debt, FX, capex, deferred revenue and jurisdiction-specific payroll; validate assumptions with qualified professionals.
- Complete AI thread persistence, usage/rate limits, robust prompt-injection boundaries, evidence citations, refusal behavior, and user-facing Copilot workflows.
- Complete Stripe customer portal, plan entitlement enforcement, cancellation/renewal/failure flows, invoice and tax handling, event replay/reconciliation, and test-mode acceptance.
- Add rate limiting, origin/CSRF controls as appropriate, observability, alerting, backup/restore drill, security review and GDPR/legal documentation.
- Run full dependency install, lockfile generation, Next.js production build, Vitest, browser E2E, accessibility, dependency audit and production staging acceptance.

Do not accept customer financial data or payments until all release blockers are resolved and independently validated. No software can be guaranteed to have zero bugs; release readiness requires repeatable tests and monitoring.


## Follow-up audit — 14 November 2026
A detailed source audit is maintained in `docs/AVENOR_AUDIT_2026-11-14.md`. Vercel Production points to Supabase project `qeitvqzujytiiupmkmyb`; the connected Supabase integration cannot inspect that project and instead exposed a different empty EU project (`qeitvqzujytiiupmkmyp`). The six migrations were temporarily applied to the wrong accessible project, then the ten empty tables and helper functions were rolled back; no production Supabase migration was applied. Vercel access is now granted. The duplicate projects `financeos` and `financeoss` have previews disabled, and the canonical `financeosss` project is configured as Next.js/Node 22; all previews are currently paused pending isolated staging credentials. The CI workflow passed on the latest validated hardening commit: 15 unit tests, Next.js production build and TypeScript checks all succeeded. Multi-user RLS and browser end-to-end checks remain open before release.


## Supabase/Vercel verification — 14 November 2026
- User confirmed Supabase project `qeitvqzujytiiupmkmyp` as the Avenor project. The recovery script restored 10 public tables; RLS is enabled on all 10, with 21 authenticated policies. All business tables are empty.
- Vercel Production `financeosss` now has the correct Supabase URL, matching legacy anon key and matching publishable key. All three values were read back and verified.
- `financeosss.vercel.app` remains attached and verified. Automatic previews remain paused across all three Vercel projects until separate staging credentials are available. Existing Production deployment remains on the old `main` commit; no Production redeployment was triggered.
- The security advisor has one informational notice for the intentionally server-only Stripe webhook receipt table without client policies; no warning-level security findings were returned.


## Dashboard integration — 14 November 2026
- Dashboard now discovers the authenticated workspace and loads the latest model version, saved scenarios and imported-actual count from Supabase.
- Company assumptions can be saved as a draft or approved model version.
- Decision Simulator scenarios are persisted through the scenarios API with model-version linkage and deterministic output snapshots; Decision Ledger reloads saved entries.
- Empty workspaces no longer display fabricated starting financial values as if they were company data.
- Imported actuals are counted and labelled as not yet reconciled into the forecast. Copilot remains a rule-based preview, not connected to the authenticated AI endpoint.
- CI passed after the workspace/dashboard integration: 15 Vitest tests, Next.js build and TypeScript check. Browser E2E, multi-tenant RLS and import-to-forecast reconciliation remain unverified.
