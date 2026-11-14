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

## Staging and Preview — 14 November 2026
- Created Supabase project `avenor-staging` (`fozwtnfzzancgdwjxopy`) in the same EU organization. Project creation cost quote: $0/month.
- Initialized 10 public application tables; all 10 have RLS, with 21 authenticated policies. All staging tables are empty.
- Added and read back Preview-only Vercel URL and publishable key; both match staging. Production variables remain mapped to the production Supabase project.
- Enabled automatic Preview deployments only on `financeosss`; duplicate projects `financeos` and `financeoss` remain paused.
- Vercel Preview deployment `dpl_EsRCMudbosD3vE1GSphkXMzgB9MV` for commit `b826a2b1b2c6cb88679dee0dc0c9eecaccd89454` reached `READY`. The first 30-minute runtime error-log window returned no entries; browser/authenticated smoke testing remains necessary.
- Production domain and active Production deployment were not changed.


## Avenor Intelligence — 14 November 2026
- Added a persistent Gmail-style side-panel companion accessible across the authenticated dashboard; includes new chats, creator-private history, thread loading, busy/error states, calculation evidence, missing-data warnings and save-to-Decision-Ledger actions.
- Added server-side ToolLoopAgent on Vercel AI Gateway with deterministic tools for company snapshot, historical transaction analysis, generalized operating-cash scenarios, hiring, break-even, affordable investment, pricing, fundraising/dilution and working-capital sensitivities.
- Model default: `anthropic/claude-sonnet-4.6`, configurable through `AI_GATEWAY_MODEL`; inference is pinned to the EU. Vercel-hosted runtime is expected to use OIDC; a live authenticated AI Gateway request has not yet been validated.
- Added a monthly Business Metrics screen and authenticated API. MRR, active/new/churned customers, marketing/sales spend and gross margin are saved by month with workspace access controls.
- Copilot can now calculate ARPA, blended CAC, monthly logo churn, CAC payback, simplified gross-profit LTV and LTV/CAC. Missing inputs yield null metrics and explicit data requirements; imported cash inflows are not mislabeled as operating revenue.
- Added unit tests for new financial intelligence. Latest GitHub CI on `ff383ec6462988e785cdd948fb8708e8be6498fc` passed 25/25 unit tests, Next.js production build and TypeScript.
- Preview deployment of the current Copilot commit could not be created: Vercel returned HTTP 402 `api-deployments-free-per-day` (100 deployments/day; retryAfter 24h). Existing Preview belongs to an older commit, and Production remains unchanged.
- Staging Supabase remains isolated with 10 RLS-enabled tables; migration 007 scopes Copilot message history to its creator. Security advisor also warns that Supabase leaked-password protection is disabled; enable it before opening registration to public users.

## Final verification caveats — 14 November 2026
- Latest branch commit `343fecba6823af3d61e2ea3aa6d6a6008d90a896` passed GitHub Actions (25 unit tests, Next.js production build, TypeScript).
- Vercel API declined a new Preview deployment with HTTP 402 `api-deployments-free-per-day` (100 deployments/day, 24-hour retry window). Existing Preview is for an earlier commit and does not include the new Copilot.
- Local Vercel CLI fallback was unavailable in the connected runtime (no Vercel CLI token).
- No live authenticated Copilot/AI Gateway request has been verified yet; UI/API/tool implementation is code/build validated only.
- Supabase Auth advisor warns leaked-password protection is disabled; enable this before public registrations. Stripe webhook no-client-policy notice is intentional.
