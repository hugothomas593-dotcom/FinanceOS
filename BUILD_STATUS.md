# Avenor engineering status — 16 November 2026

## Current verified snapshot — 16 November 2026, 22:10 UTC

This section supersedes older point-in-time release notes below. The repository is still an engineering/beta candidate, not a production-certified service.

### Source and deployment
- Correction branch: `fix/avenor-commercial-readiness`.
- Latest branch HEAD: `2c1952a1ef2392fc403f255ce9cab69520822692`; PR #2 is OPEN and DRAFT.
- GitHub Actions run #43963968845 completed successfully on this HEAD: Vitest, Next.js production build and TypeScript check all passed.
- Latest READY Vercel application deployment is `dpl_D9PBbwYx5eU8Xb5x16bcv1YEYBFy`, source commit `765cb7b00412ec97b0176ff12931b20e69b6b6b7`, region `dub1`. Subsequent commits to the branch change tests/documentation only; the deployed application code is the same.
- Preview is protected by Vercel Authentication/SSO. It is not an anonymous customer-facing production URL.
- The only attached Production domain is `financeosss.vercel.app`; no customer-owned Avenor domain or customer support address is configured.

### Changes on the correction branch
- Same-origin / Fetch Metadata protection for cookie-authenticated mutating API requests; Stripe webhook remains signature-authenticated.
- Shared Postgres-backed per-user rate limits on Copilot, CSV import, Checkout, Billing Portal, CFO Brief, export and workspace deletion.
- Owner/admin JSON workspace export and owner-only active-workspace erasure with explicit confirmation, pending-Checkout guard and Stripe cancellation first.
- One-time trial claim survives workspace deletion (migration 013).
- Sign-up and password-reset UI use the same 12+ character mixed-case, digit and symbol rule.
- Stripe flexible-billing webhook period-end parsing and late canceled-webhook behavior hardened.
- Model approval now uses a transactional RPC (migration 014); Postgres partial unique index enforces at most one approved model per workspace (migration 015).
- Internal draft Privacy Notice, Terms, DPA and Subprocessor Register added; these are not approved for signature or publication.

### Verified on staging / Preview / Stripe test mode
- Staging project `avenor-staging` (`fozwtnfzzancgdwjxopy`) is ACTIVE_HEALTHY and has migrations through 015.
- The staging rate-limit table and RPC are inaccessible to `anon` and `authenticated`; a rolled-back SQL check confirmed a limit of two requests blocks the third.
- A rolled-back model-approval simulation confirmed that approving a second version archives the prior approved version. The database partial unique index is present.
- A synthetic non-member access simulation returned zero rows for another workspace's financial actuals, models, scenarios, Copilot threads and messages; a cross-tenant insert attempt was blocked by RLS. This is a targeted isolation check, not a full two-customer CRUD acceptance suite.
- Stripe test mode: a synthetic EUR 59/month 30-day trial subscription delivered signed create/update/delete webhooks. Staging persisted the trial, granted entitlement, then revoked it after cancellation. The temporary subscription row was removed. No live charge was made.
- Direct HTTP checks on the protected Preview: `/`, `/demo`, `/login` returned 200; `/app` and `/subscribe` redirected without a session; cross-origin organization creation returned 403; same-origin unauthenticated creation returned 401.
- A browser loaded the landing page, demo and login with no browser page errors or console errors. Authenticated browser E2E for signup, reset completion, onboarding, Copilot and billing is still outstanding.
- Stripe Checkout and Customer Portal have not been verified end-to-end in an authenticated browser session. The test-mode webhook lifecycle has been verified separately.
- Vercel AI Gateway's seven-day usage query returned no requests; successful live Copilot inference, provider routing, retention, contractual data handling and unit economics are not yet evidenced.

### Staging and Production are deliberately separate
- Preview-only Stripe test secrets and the staging service-role key are scoped to `fix/avenor-commercial-readiness`. No Stripe Live or service-role secret is configured for Vercel Production.
- Production Supabase project `qeitvqzujytiiupmkmyp` is in `eu-west-1`, has zero business rows, RLS enabled on its 10 existing tables, and migration history only through the recovered baseline (migration 006). It has not received migrations 007–015.
- No Production app deployment, Production database migration or Live Stripe charge was made. Do not merge/deploy this branch to Production until the missing migration plan, env vars, billing and legal settings are reviewed and tested.

### Remaining blockers before accepting real customer data or payment
- Supabase organization is on Free. Leaked-password protection and automatic backups are unavailable on this plan. Pro upgrade is a paid account decision and was not made; after upgrade, enable leaked-password protection and verify the advisor.
- Complete two-independent-customer RLS/API CRUD tests, authenticated browser tests, backup/restore drill, privileged-account MFA/access review and incident-response rehearsal.
- Complete successful AI Gateway inference, downstream model/provider data handling and spend controls.
- Complete full Stripe Checkout/Portal journey, renewal/failure/cancellation and reconciliation acceptance in test mode.
- Confirm legal operator identity/address, support/privacy contacts, governing law, customer geography, B2B/B2C scope and VAT/tax status; then finalize GDPR privacy notice, Terms, customer DPA, subprocessor register, retention/deletion schedule and Stripe Tax settings with qualified review.
- Obtain a customer-owned domain and configure public Production auth redirects, live billing keys and webhook only after release gates pass.
- Commission an independent application security assessment before making security certification or assurance claims.

No software can be guaranteed free of bugs or described as perfectly secure. Do not claim SOC 2/ISO certification, independent penetration testing, completed GDPR readiness, AI inference readiness or a public paid launch.

---

## Historical engineering notes

Older entries below are retained as a dated engineering history. Their statements about missing paywall, workspace export/deletion, trial webhook tests and the migration head are point-in-time observations and are superseded by the current verified snapshot above.

- Latest validated code snapshot before this entry: `8942904261f719a65097a556d30d12964e9f467a` on `chore/avenor-repository-hygiene`. GitHub Actions run #192 passed 86/86 tests across 10 files, Next.js production build and TypeScript. A follow-up regression test for per-row currency identity is being added and must be revalidated separately.
- Added a real sign-out action to the authenticated workspace using Supabase Auth; it clears the remembered workspace and returns to login.
- Fixed mixed-currency analysis in Copilot: imported transactions and KPI rows that do not match the workspace currency are excluded from calculation; the Copilot prompt and visible data-limitations evidence disclose excluded currencies and the absence of FX conversion.
- Expanded CSV ingestion for comma-, semicolon- and tab-separated files; ISO and European day-first dates; accented French column labels; Amount/Montant or Debit/Credit fields; BOM headers; decimal comma/thousands separators; and per-row three-letter currencies. Per-row currency contributes to idempotency keys, is persisted with the transaction and is shown in a currency-grouped import preview.
- Added regression tests for mixed currencies, French debit/credit statements, day-first dates, BOM, invalid currency codes and duplicate import identity by currency. The CSV acceptance workflow is documented in README and the commercial runbook.
- Important limits remain: imports are historical cash movements, not reconciled accounting; no FX conversion occurs; CSV preview is local parsing only; there is no undo/rollback or duplicate reconciliation screen; and rows with no currency column are assumed to use the workspace base currency.
- Still not production-ready: no subscription entitlement/paywall enforcement; no Privacy or Terms routes (`/privacy` and `/terms` return 404); Supabase leaked-password protection is disabled; no successful AI Gateway inference or Stripe test payment; no authenticated browser E2E or two-user/two-workspace RLS test; no completed GDPR/VAT/legal review or account-data export/deletion workflow.
- The current preview is a protected test deployment, not a public customer production service. No production deployment, production database mutation, live charge or marketing email was made.

## Current release snapshot — 16 November 2026
- Latest branch head: `adf944e8215c60c9d3099d3c6be1b959c79a0dd3` on `chore/avenor-repository-hygiene`; PR #1 remains OPEN and DRAFT.
- GitHub Actions run #173 passed: 79/79 tests across 10 test files, Next.js production build, and TypeScript.
- Vercel Preview deployment `dpl_8hchaXAzJqjk51HshaLXE1r2mQas` is READY in `dub1` and the stable alias `avenor-founder-preview-2026.vercel.app` points to this commit. Public routes `/`, `/demo`, `/login?mode=signup` and `/api/health` were fetched successfully (HTTP 200).
- Added public `/demo` interactive scenario explorer using fictional Northstar data and the deterministic finance engine. Four scenarios are supported; this is intentionally not represented as a live AI chat or real company data.
- Added KPI date-range handling across the entire calendar month, including records stored on month-end dates.
- Hardened Stripe scaffold: Checkout verifies an active EUR 59 monthly Price, rejects duplicate active subscriptions, reuses an existing customer when restarting after cancellation, applies a short-window idempotency key, and returns to `/app`; Customer Portal also returns to `/app`. Webhook startup now requires both Stripe secrets and the server-side Supabase credential.
- Added regression tests for calendar month boundaries, subscription duplicate/restart policy, Stripe return URLs and exact EUR 59 monthly Price validation.
- Added `docs/COMMERCIAL_LAUNCH_RUNBOOK.md` with Stripe test-mode cases, AI Gateway verification, Supabase Auth/RLS checks, browser acceptance, production gates, target customer, first 15 interviews, five design partners and three paying-customer milestones.
- Preview environment currently contains only Supabase URL/publishable key. `/api/health` reports Supabase configured, Vercel AI Gateway runtime identity available, Stripe Checkout not configured and Stripe webhook not configured. Gateway identity is not proof of a successful model inference; usage reporting has shown no requests in the last 7 days.
- Supabase staging remains `ACTIVE_HEALTHY`. Security advisor still reports leaked-password protection disabled (WARN); enable it before public registration. The no-policy `stripe_webhook_events` table is intentional server-only (INFO).
- No Stripe test payment, live AI inference, authenticated browser E2E or two-user/two-workspace RLS isolation test has been verified in this pass. Stripe tax/VAT configuration, GDPR/legal review, subscription entitlement policy, support/monitoring and recovery procedures remain open.
- Production was not redeployed, no production database was modified and no live payments were activated. Do not treat the current build as production-certified.


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

## Professional interface refinement — 15 November 2026
- Reworked the dashboard, navigation, metric cards, data tables, input forms, login and onboarding screens with a consistent neutral finance-software design.
- Replaced the dark decorative sidebar and heavy AI-style treatments with a white workspace navigation, restrained navy/green palette, Inter typography, fine borders and lighter hierarchy.
- Simplified the Avenor chat language and made it a non-blocking desktop side panel; mobile uses a full-screen layout.
- The app title and description now present Avenor as a financial workspace, not an AI demonstration.
- No Production deployment. Final CI on commit `4c7e6db6668c282ee7e4cf4fdce9c30745b9ab54` passed 25 unit tests, Next.js production build and TypeScript.

## EU compute region — 15 November 2026
- Added `vercel.json` with `regions: ["dub1"]` so Vercel server functions run in Dublin (AWS `eu-west-1`), aligned to the Supabase project region.
- The previously inspected READY Preview on commit `f86407ea15bd0aa7cef56bc5f7d8aaed366b361c` still ran in `iad1`; it predates this config and is not proof that the EU setting is active.
- The new region setting needs to be verified from a fresh Vercel deployment before any data-residency claim is made.
 
## Weekly CFO Brief implementation — 15 November 2026
- Added a deterministic Brief engine using the latest approved model (or the latest draft when none is approved), up to 5,000 imported transaction records and the latest monthly business metrics.
- Added authenticated `GET /api/brief?organizationId=...`; workspace membership is verified server-side.
- Added on-demand 18-month outlook metrics, cash-negative and below-six-month-runway flags, significant historical inflow/outflow trends, limited-data warnings and foreign-currency exclusion. No FX conversion is inferred and imported actuals are not reconciled into the forecast.
- Added the Weekly CFO Brief panel to the Copilot-first authenticated Overview, with manual refresh and a path to discuss the brief with Copilot.
- Added regression tests for cash/runway alerts, missing model handling, historical trends and currency mismatches.
- GitHub Actions CI run #104 on commit `55cf17b5db432dbbd353f765ecb80a9508b6e8bb` passed. A follow-up wording fix and README documentation were committed afterward; the CI run for the final head must be checked separately.
- Vercel Preview creation remains blocked by the Hobby daily deployment limit. No deployment or Production change was made.
- Staging security advisor: leaked-password protection is disabled and must be enabled before public registration. `stripe_webhook_events` has RLS enabled and no client-facing policy (fail-closed/server-only); six unused-index notices are informational on the near-empty staging project.
- Live AI Gateway inference still has a 403 account-verification/billing blocker. Stripe credentials and recurring EUR 59 price/webhook configuration are still absent; no payments are enabled.
