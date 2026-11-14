# Avenor — Founder Financial Decision Platform

Avenor is an early SaaS codebase for European Seed-stage startups. It combines a financial dashboard, deterministic cash-flow forecasting, hiring/scenario modeling, a decision ledger, CSV actuals ingestion, authenticated multi-tenant APIs, an optional AI explanation layer, and Stripe subscription scaffolding.

> **Honest release status:** this repository is not certified production-ready and must not be used with paying customers or sensitive live financial data until the deployment checklist below is completed. The dashboard still contains illustrative demo assumptions. External integrations require credentials and account setup.

## Stack
- Next.js 15 App Router, React 19, TypeScript
- Supabase Auth + Postgres + Row Level Security
- Deterministic TypeScript financial engine
- Vercel AI Gateway + AI SDK 7 ToolLoopAgent for the financial Copilot; Vercel deployments authenticate with OIDC, local development uses an optional server-side Gateway key
- Stripe Checkout + signed webhook scaffold

## Local setup
1. Use Node.js 20 or later.
2. Create a Supabase project.
3. Copy `.env.example` to `.env.local` and configure Supabase URL and anon key.
4. Apply migrations in order: `001_initial_schema.sql`, `002_product_completion.sql`, `003_rls_policy_hardening.sql`, `004_stripe_webhook_idempotency.sql`. Alternatively, use `supabase/FINANCEOS_SETUP_ALL.sql` once on a fresh project; do not run both paths.
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

## API outline
- `POST /api/organizations` — create organization + owner membership.
- `GET|POST /api/models` — list and save model versions; approval archives previous approved version.
- `GET|POST /api/scenarios` — list and save scenarios.
- `GET /api/actuals` — list actuals for a member organization.
- `POST /api/actuals/import` — import CSV with Date and Amount columns; requires owner/admin/finance role.
- `POST /api/copilot` — requires auth, organization membership, and an approved model. Optionally calls OpenAI to explain deterministic outputs.
- `POST /api/billing/checkout` — creates a Stripe subscription checkout session.
- `POST /api/billing/webhook` — verifies Stripe signature and records subscription state.
- `GET /api/health` — reports whether key services are configured; not a security audit.

## CSV format
Minimum columns: `Date,Amount`. Optional columns: `Description,Category`. Positive amounts are treated as inflows; negative amounts as outflows. Use ISO dates (`YYYY-MM-DD`). Dot-decimal and common European decimal-comma amounts are supported. Maximum 10,000 rows / 2 MB per import.

## Required environment variables
See `.env.example`. `SUPABASE_SERVICE_ROLE_KEY`, `AI_GATEWAY_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `STRIPE_PRICE_ID` are server-only. Vercel deployments use the platform-provided OIDC token for AI Gateway; a private `AI_GATEWAY_API_KEY` is only needed for local development outside a linked Vercel environment. `AI_GATEWAY_MODEL` defaults to `anthropic/claude-sonnet-4.6`.

## Before a commercial launch — mandatory
- Configure production Supabase, email confirmation, allowed redirect URLs, backups, and database access policies.
- Test RLS with at least two separate users and two organizations. Verify no cross-tenant read/write is possible.
- Complete company onboarding, organization switching, account settings, password reset, invitation flows, and role management UI.
- Replace demo dashboard state with persisted approved model data and actuals. Connect all screens to authenticated APIs.
- Implement CSV preview, duplicate detection, idempotency, currency handling, mapping, rollback, and reconciliation. Current import is a minimal ingestion route, not a complete accounting connector.
- Verify all financial model assumptions with a qualified accountant/payroll specialist for each jurisdiction. Current forecast excludes VAT timing, taxes, debt, working capital, deferred revenue, capex, FX, payroll timing, and many industry-specific effects.
- Build and test accounting/banking integrations under the relevant provider agreements; do not store bank credentials.
- Complete Stripe customer portal, plan/entitlement enforcement, failed-payment handling, cancellations, refunds, tax/VAT handling, and webhook replay/idempotency.
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
- The agent can inspect the saved financial model and up to 5,000 imported actual records; it can analyze historical inflows/outflows, recent trends and expense categories.
- Deterministic tools cover a general 18-month operating-cash scenario, hiring cost, break-even revenue, affordable one-off investment under a target-runway constraint, pricing/volume sensitivity, simple fundraising dilution, and working-capital payment-day sensitivity.
- Tool results and model evidence are saved with assistant messages; a modeled scenario can be saved to the Decision Ledger.
- AI explanations are routed through Vercel AI Gateway. The default model is Claude Sonnet 4.6; inference requests are pinned to the EU. Vercel-hosted Preview/Production uses OIDC. Local development outside Vercel needs a private `AI_GATEWAY_API_KEY`.
- The agent cannot execute payments, alter accounting records, approve spending, run payroll, or replace the accountable founder, accountant, lawyer or payroll specialist.
- Current engine exclusions include tax/VAT schedules, working-capital detail beyond a user-supplied DSO/DPO/DIO sensitivity, debt schedules, FX, capex timing/depreciation, deferred revenue, and customer-level CAC/LTV/churn/cohort metrics. Missing data is disclosed rather than inferred.
