# Avenor — Founder Financial Decision Platform

Avenor is an early SaaS codebase for European Seed-stage startups. It combines a financial dashboard, deterministic cash-flow forecasting, hiring/scenario modeling, a decision ledger, CSV actuals ingestion, authenticated multi-tenant APIs, an optional AI explanation layer, and Stripe subscription scaffolding.

> **Honest release status:** this repository is not certified production-ready and must not be used with paying customers or sensitive live financial data until the deployment checklist below is completed. The dashboard still contains illustrative demo assumptions. External integrations require credentials and account setup.

## Commercial offer
Avenor has one subscription only: **Avenor Founder — €59/month**. Eligible first-time users receive a 30-day trial after entering a payment method; the first €59 monthly charge is due after the trial unless canceled. A returning user cannot claim another trial by creating another workspace. The current Stripe product/price and webhook are configured in test mode only; Production billing is not enabled. A synthetic 30-day test subscription exercised signed subscription-created, updated and deleted webhooks; it was canceled and removed from the staging workspace. This did not exercise the authenticated browser Checkout or Customer Portal.

## Stack
- Next.js 15 App Router, React 19, TypeScript
- Supabase Auth + Postgres + Row Level Security
- Deterministic TypeScript financial engine
- Vercel AI Gateway + AI SDK 7 ToolLoopAgent for the financial Copilot; Vercel deployments authenticate with OIDC, local development uses an optional server-side Gateway key
- Stripe Checkout + signed webhook scaffold

## Local setup
1. Use Node.js 22 or later (the current AI SDK tool-loop runtime is validated with Node 22).
2. Create a Supabase project.
3. Copy `.env.example` to `.env.local` and configure Supabase URL and anon key.
4. On a fresh Supabase project, run `supabase/FINANCEOS_SETUP_ALL.sql` once (baseline through migration 011), then apply migrations `012_api_rate_limits.sql` through `017_restrict_public_role_privileges.sql` in numerical order. The current release branch includes financial operations (`016`) and least-privilege hardening (`017`). For an existing project already migrated through 011, apply only migrations 012–015. Do not rerun the setup-all script on an existing database.
5. Run `npm install`, then `npm run dev`.
6. Open `/login`, create an account, confirm the email, and create a company at `/onboarding`.

## Implemented in this codebase
- Dashboard and persisted company financial assumptions.
- 18-month deterministic financial forecast and multi-decision scenario calculations (hiring, pricing, general recurring and one-off decisions, break-even, affordable investment, fundraising/dilution and working capital).
- Scenario comparison and local demo Decision Ledger.
- Supabase server/browser client helpers and auth refresh middleware.
- Login/sign-up page and auth callback.
- Organization onboarding RPC with owner membership.
- Authenticated APIs for organization creation, model versions, scenarios, CSV actuals import, and Copilot.
- Avenor Intelligence uses a side-panel chat with persistent, creator-private conversation history. It reads the latest approved model (or latest draft with an explicit warning) and imported actuals, uses deterministic financial tools for scenarios and metrics, and uses the LLM to interpret and explain the outputs. The LLM does not calculate authoritative numbers.
- Stripe Checkout API with server-controlled return URLs and webhook signature verification/idempotency scaffold.
- Health/configuration endpoint.
- Deterministic Weekly CFO Brief generated on demand from the latest approved/draft model, compatible-currency transaction history and latest monthly business metrics. It flags cash/runway risks, material inflow/outflow trends, limited data and currency mismatches, and suggests next actions without relying on the LLM.

## API outline
- `POST /api/organizations` — create organization + owner membership.
- `GET|POST /api/models` — list and save model versions; approval archives the previous approved version atomically, with one approved model per workspace enforced by Postgres.
- `GET|POST /api/scenarios` — list and save scenarios.
- `GET /api/actuals` — list actuals for a member organization.
- `POST /api/actuals/import` — import CSV with Date and Amount columns; requires owner/admin/finance role.
- `POST /api/copilot/chat` — requires auth and workspace membership; uses the latest approved model (or latest draft with an explicit warning), deterministic financial tools, and Vercel AI Gateway for explanations, with a bounded local fallback when inference is unavailable.
- `POST /api/billing/checkout` — verifies an active EUR 59 monthly Stripe Price, blocks duplicate active subscriptions and creates a subscription Checkout session with retry idempotency.
- `POST /api/billing/webhook` — verifies Stripe signature and configured server credentials, synchronizes subscription state and records event receipts.
- `GET /api/health` — reports whether key services are configured; not a security audit.
- `GET /api/brief?organizationId=...` — authenticated, deterministic Weekly CFO Brief for the selected workspace; on-demand, not a scheduled email or push alert.
- `GET|POST /api/kpis` — reads and saves KPI records by full calendar month, including month-end dates.\n- `GET /api/privacy/export?organizationId=...` — owner/admin-only JSON archive of workspace members, financial actuals, models, scenarios, company context, Copilot history, audit events and non-sensitive subscription status. The response flags any row limit reached.\n- `POST /api/privacy/delete-workspace` — owner-only destructive action. Requires the exact workspace name and `DELETE WORKSPACE`, blocks pending Checkout, cancels any linked Stripe subscription, then deletes workspace records from the active database. Provider backups and statutory billing records follow separate retention periods.
- `GET /demo` — public interactive decision demo using fictional, synthetic financial data; no account or database write required.

## CSV format
Supports comma-, semicolon- and tab-delimited files. Use either `Date,Amount` / `Date,Montant` or `Date,Debit,Credit`; optional columns include `Description`, `Category` and `Currency` / `Devise`. Positive amounts are inflows and negative amounts are outflows; debit/credit columns are normalized automatically. Dates may use ISO `YYYY-MM-DD` or European day-first `DD/MM/YYYY` (also `DD-MM-YYYY` / `DD.MM.YYYY`). Dot-decimal, decimal-comma and common thousands separators are supported. When a currency column is present, each transaction's three-letter currency is preserved; otherwise the workspace currency is used. Foreign-currency records are not converted and are excluded from workspace-currency historical totals. Maximum 10,000 rows / 2 MB per import. Imported actuals remain separate from forecast assumptions.

## Required environment variables
See `.env.example`. `SUPABASE_SERVICE_ROLE_KEY`, `AI_GATEWAY_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `STRIPE_PRICE_ID` are server-only. Vercel deployments use the platform-provided OIDC token for AI Gateway; a private `AI_GATEWAY_API_KEY` is only needed for local development outside a linked Vercel environment. `AI_GATEWAY_MODEL` defaults to `anthropic/claude-sonnet-4.6`.

## Current security safeguards on the correction branch\n- Cookie-authenticated mutating API requests reject cross-origin browser requests; Stripe webhooks instead verify signed raw payloads.\n- Postgres-backed, per-user rate limits apply to Copilot, CSV import, Checkout, Billing Portal and CFO Brief generation. Rate-limit state is service-role-only.\n- Workspace owners/admins can export a workspace archive from the application sidebar; this export is workspace-wide and should be handled as confidential financial data.\n\n## Before a commercial launch — mandatory
- Configure production Supabase, email confirmation, allowed redirect URLs, backups, and database access policies.
- Test RLS with at least two separate users and two organizations. Verify no cross-tenant read/write is possible.
- Complete company onboarding, organization switching, account settings, password reset, invitation flows, and role management UI.
- Replace demo dashboard state with persisted approved model data and actuals. Connect all screens to authenticated APIs.
- Implement CSV preview, duplicate detection, idempotency, currency handling, mapping, rollback, and reconciliation. Current import is a minimal ingestion route, not a complete accounting connector.
- Verify all financial model assumptions with a qualified accountant/payroll specialist for each jurisdiction. Current forecast excludes VAT timing, taxes, debt, working capital, deferred revenue, capex, FX, payroll timing, and many industry-specific effects.
- Build and test accounting/banking integrations under the relevant provider agreements; do not store bank credentials.
- Complete and verify Stripe Checkout, Customer Portal, plan/entitlement enforcement, failed-payment handling, cancellations, refunds, tax/VAT handling, webhook replay/idempotency and the 30-day trial → €59/month flow.
- Add rate limiting, CSRF/origin protections where applicable, abuse monitoring, structured logs, error tracking, security headers, secrets rotation, incident response, and a privacy/data-retention process.
- Complete GDPR review: privacy notice, terms, DPA, subprocessors, retention/deletion, data export, lawful basis, and processor contracts.
- Run automated unit/integration/e2e tests, load tests, dependency/security scans, accessibility checks, and manual acceptance testing on staging.
- Configure production domain, TLS, monitoring, backups restore test, support email, and rollback procedure.
- Have an independent security review and financial-model validation before accepting customer financial data.

## Important model limitations
The current deterministic forecast is a simplified operating cash model. Runway based on a monthly burn is an approximation, not a full liquidity forecast. Hiring cost rate is a user-provided assumption and not tax/payroll advice. The product must label all data sources, assumptions, missing inputs, and forecast limitations.


## Deployment distinction
Supabase is for database/authentication; it does not host the Next.js website. Apply the SQL in `supabase/FINANCEOS_SETUP_ALL.sql` to Supabase, then deploy the application separately (for example with Vercel). See `SUPABASE_SETUP.md`. This build is not production-certified; see `BUILD_STATUS.md` before using customer data or payments.


## Avenor Intelligence — Copilot scope and limitations
- The persistent side panel is available across the authenticated dashboard. Conversations are private to the user who created them within their workspace.
- The agent can inspect the saved financial model, up to 5,000 imported transaction records and the latest monthly business metrics. It separates transaction cash inflows from operating revenue and analyzes inflows/outflows, recent trends and expense categories.
- Deterministic tools cover a general 18-month operating-cash scenario, hiring cost, break-even revenue, affordable one-off investment under a target-runway constraint, pricing/volume sensitivity, simple fundraising dilution, working-capital payment-day sensitivity, and SaaS unit economics (MRR, ARR, ARPA, blended CAC, monthly logo churn, CAC payback, simplified gross-profit LTV and LTV/CAC).
- Tool results and model evidence are saved with assistant messages; a modeled scenario can be saved to the Decision Ledger.
- AI explanations are routed through Vercel AI Gateway. The default model is Claude Sonnet 4.6; inference requests are pinned to the EU. Vercel-hosted Preview/Production uses OIDC. Local development outside Vercel needs a private `AI_GATEWAY_API_KEY`.
- The agent cannot execute payments, alter accounting records, approve spending, run payroll, or replace the accountable founder, accountant, lawyer or payroll specialist.
- The unit-economics estimates require manually entered monthly MRR, active/new/churned customer counts, marketing/sales spend and gross margin. They are blended, period-based estimates, not cohort-attributed CAC/LTV. The engine still excludes verified tax/VAT schedules, full AR/AP ageing, debt schedules, FX, capex timing/depreciation, deferred revenue and cohort-based retention. Missing data is disclosed rather than inferred.


## Interface design
- The workspace uses a restrained finance-software visual system: neutral canvas, white work surfaces, deep blue-grey typography and a muted green accent.
- Navigation, forecast tables, forms, status indicators and authentication screens share the same visual language.
- The Copilot is the primary Overview experience, with the financial workspace sections available as supporting views. It is not presented as a secondary floating chat panel.
- Product copy focuses on the financial tasks and decisions rather than describing AI as the product.

- Vercel Functions are pinned to `dub1` (Dublin, EU West) in `vercel.json` to run close to the Supabase EU West project. This configuration requires a fresh deployment to verify the effective function region; the last inspected Preview predates the setting.

## Weekly CFO Brief — current scope
The Brief is generated on demand when the workspace loads and can be manually refreshed. It computes the current 18-month model outlook, summarizes imported transaction history and latest monthly unit-economics inputs, then highlights negative-cash/runway thresholds, significant historical cash-flow trends, missing data and foreign-currency records. Foreign-currency rows are excluded from local-currency totals; no FX rates are inferred. It does not reconcile historical actuals into the forecast, run automatically each Monday, or send emails/push notifications. The Copilot discussion button requires a working Vercel AI Gateway configuration; the Brief's underlying calculations do not.


## Public product demo
The marketing page links to `/demo`. The demo is deliberately not a fake AI conversation: it uses a fictional SaaS company and the same deterministic scenario engine to compare hiring, revenue downside, pricing and fundraising decisions. It is read-only and never writes demo values into a customer's workspace.

## Stripe checkout safeguards
The Checkout API validates that `STRIPE_PRICE_ID` points to an active EUR 59 monthly recurring Price before creating a session. It blocks another Checkout session when an active subscription is already linked, reuses an existing Stripe customer after cancellation, uses a short-window idempotency key, and returns the user to `/app`. The customer portal also returns to `/app`. The signed webhook requires the webhook secret, Stripe API secret, Supabase service-role key and Supabase URL. These code paths still need successful Stripe test-mode end-to-end acceptance before live keys are used.

## Release and commercial beta
See [docs/COMMERCIAL_LAUNCH_RUNBOOK.md](docs/COMMERCIAL_LAUNCH_RUNBOOK.md) for the ordered Stripe/AI Gateway/Supabase setup, the browser acceptance checklist, production release gates and the first 15 founder interviews / five design partners / three paying customers plan. See [docs/FIRST_CUSTOMERS_SALES_KIT.md](docs/FIRST_CUSTOMERS_SALES_KIT.md) for warm-intro and LinkedIn messages, the 20-minute founder interview script, objection handling and prospect-tracking fields.
