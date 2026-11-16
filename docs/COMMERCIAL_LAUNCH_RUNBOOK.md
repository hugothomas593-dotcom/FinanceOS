# Avenor commercial launch runbook

Last reviewed: 16 November 2026

This is the operational checklist for moving Avenor from private Preview to a small paid beta. A green build is not the same as production readiness. Do not collect customer financial records or charge a customer until the release gates below are complete.

## 1. Product offer and customer

**Initial customer:** founder / CEO of a European B2B SaaS company, Pre-seed to Series A, roughly 5–50 employees, without a full-time CFO.

**Core promise:** "Know what your startup can afford before making your next big decision."

**Initial plan:** Avenor Founder — €59/month, one plan, no feature tiers.

Do not add a free trial, annual discount or tiered pricing until customer interviews validate the €59 willingness to pay and the cost of AI usage per active workspace. The public demo is free and uses synthetic data; it is not a free customer workspace.

## 2. Current implementation in this repository

- Public marketing site with a no-signup interactive demo at `/demo`.
- The demo models four decisions with the deterministic financial engine: two hires, -20% revenue, +10% price (volume unchanged) and a €1m raise at €6m pre-money.
- The demo is explicitly synthetic; it is not a real Copilot conversation and does not write to Supabase.
- Authenticated workspaces, saved company assumptions, deterministic 18-month forecast, Decision Ledger, imported actuals, monthly SaaS metrics, Copilot API and on-demand CFO Brief.
- Copilot uses the Vercel AI Gateway for open-ended explanation, with bounded deterministic fallback calculations if inference is unavailable.
- Stripe Checkout, Customer Portal and signed webhook scaffolding exist. Checkout now verifies that the configured Price is active, EUR 59 and recurring monthly; it blocks a second subscription while one is already linked and uses Stripe idempotency for short retry windows.
- KPI reads cover the full calendar month, including transactions stored on month-end dates.
- None of the above proves a live AI request or Stripe payment has succeeded.

## 3. External account setup

### Vercel / AI Gateway

1. Complete the Vercel AI Gateway customer verification/payment-method step for the team.
2. Confirm the Vercel deployment receives its OIDC token and that the selected model `anthropic/claude-sonnet-4.6` can serve tool use in the EU region.
3. Run a live Copilot request on Preview using the synthetic Northstar Demo workspace.
4. Verify a successful request in AI Gateway Logs and check model, provider, input/output tokens, cost, duration and EU routing.
5. Test the failure path as well: invalid credentials, provider unavailable, timeout and rate limit. The deterministic fallback must clearly identify itself as local analysis; do not imply the LLM was available.
6. Set a team/project spend budget and alert before inviting beta users. Confirm that average cost per active workspace leaves enough gross margin at €59/month.

### Stripe — test mode first

Create/confirm one product and one Price:
- Product: Avenor Founder
- Currency: EUR
- Unit amount: 5900 (integer cents)
- Billing: recurring, monthly, interval count 1
- Active: yes

Configure Preview-only Vercel environment variables using Stripe test-mode credentials:
- `STRIPE_SECRET_KEY` — test secret key
- `STRIPE_PRICE_ID` — test Price ID for EUR 59/month
- `STRIPE_WEBHOOK_SECRET` — test webhook endpoint signing secret
- `SUPABASE_SERVICE_ROLE_KEY` — staging-only service role key, server-side only
- `NEXT_PUBLIC_APP_URL` — canonical Preview URL (https)
- `NEXT_PUBLIC_SUPABASE_URL` and publishable key — staging Supabase project

Create a Stripe webhook endpoint for `/api/billing/webhook` and subscribe to:
- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Test all of these cases before live mode:
1. New customer successfully completes checkout.
2. Checkout canceled by the user.
3. Duplicate clicks/retries do not create duplicate Checkout sessions.
4. A second subscription cannot be created while one is active.
5. A canceled subscription can be restarted using the same Stripe customer.
6. Subscription update, cancellation and failed-payment status are synchronized.
7. Webhook signature rejection, duplicate delivery and retry after a transient database failure.
8. Customer Portal opens and returns to `/app`.
9. A wrong Price (wrong amount, currency or interval) is rejected.
10. Confirm Stripe test mode does not create live charges.

Do not add live keys until the test flow is green and a human has reviewed the live product/Price, tax settings and customer-facing disclosure. Configure Stripe Tax, billing-address collection and EU VAT/tax treatment with appropriate professional advice before charging customers. The application does not currently claim to calculate or determine tax obligations.

### Supabase

- Keep staging and production projects strictly separate.
- Enable leaked-password protection in Supabase Auth before public registration.
- Test signup, email confirmation, login, password reset, callback redirects and session refresh.
- Create two unrelated test users with two workspaces each. Attempt cross-workspace SELECT, INSERT, UPDATE and DELETE on models, actuals, scenarios, Copilot threads/messages, context, subscriptions and audit records. Every unauthorized attempt must fail.
- Keep `stripe_webhook_events` server-only, protected by RLS with no client policy; only the server service-role webhook can access it.
- Verify backup retention and perform a restore drill on staging.
- Confirm export and deletion workflows before accepting customer data.

## 4. Application acceptance tests

A release candidate must pass each step using a browser with a real authenticated staging user:

1. Sign up, confirm email and create a workspace.
2. Complete onboarding; optional fields can be skipped, required model inputs cannot be silently invented.
3. Save and approve a financial model; reload and confirm the same assumptions persist.
4. Import a representative CSV. Preview, row count, category, sign conventions and currency must be clear.
5. Test a comma CSV and a French semicolon CSV with `Date opération;Débit;Crédit;Libellé;Catégorie;Devise`, day-first dates and decimal commas. Confirm each row's currency is preserved and preview totals are grouped by currency. Re-import the same file and confirm duplicate rows are skipped. Import two genuinely identical transactions in one file and confirm both are preserved.
6. Add a KPI period at the first and last day of a month and confirm the Growth Metrics screen and Copilot read the same period.
7. Generate the CFO Brief and compare every displayed result with a known test case.
8. Ask Copilot about runway, hiring, pricing, revenue downside, fundraising, break-even, affordable investment and unit economics. Check calculations against the deterministic engine.
9. Save a Copilot scenario and verify it appears in the Decision Ledger after reload.
10. Open a second workspace and confirm its data and conversation history are isolated.
11. Return to the app on a second browser session and confirm persistence, logout and session expiry behavior.
12. Complete a Stripe test subscription, manage it in the Customer Portal, cancel it and verify entitlement behavior.

Known model limitations to display clearly: current forecast is a simplified operating cash model, and does not fully model VAT/tax timing, debt schedules, receivables/payables, working capital, deferred revenue, capex depreciation, FX or jurisdiction-specific payroll. CSV actuals are historical cash movements and are not automatically reconciled into forecast assumptions.

## 5. Commercial beta and revenue validation

### First 15 interviews

Target:
- 5 French B2B SaaS founders
- 5 ESCP / alumni / founder-network contacts
- 5 European pre-seed/seed founders reached through warm introductions or founder communities

Ask about the decisions they make every month, the spreadsheet they use now, the moment they last worried about runway, how they model hiring, what data they would connect, and what level of confidence they need before trusting an AI-assisted finance tool. Do not pitch first; discover first.

### First five design partners

Offer a 30-minute assisted setup and ask them to use the demo and then their own data in an isolated workspace. Ask each partner to complete three jobs:
- answer "Can I afford this hire/investment?"
- explain the next 6–18 months of runway
- identify one metric or cash-flow trend they would act on

Record where they hesitate, which numbers they challenge, what they would pay to keep, and whether they return to the product without a reminder.

### First three paying customers

Ask for payment only after the full value loop works. Do not count verbal interest or free testers as revenue. Track MRR only after a successful subscription and webhook reconciliation.

Suggested weekly funnel:
- landing page visitors
- demo starts and scenario interactions
- signup starts and completed signups
- workspaces with an approved model
- first Copilot question
- second session within seven days
- checkout start
- paid subscriptions
- cancellations / failed renewals
- AI cost per active paid workspace

First milestone: 3 paid customers = €177 MRR at €59/month. Next milestone: 10 paid customers = €590 MRR. These are gross subscription amounts before VAT/tax, Stripe fees, refunds and operating costs.

## 6. Production release gates

Production must remain unchanged until all are true:
- Latest candidate commit passes unit tests, TypeScript and Next.js production build.
- Fresh Vercel Preview is READY and tested in a real browser session.
- A live AI Gateway request succeeds and its billing/routing behavior is understood.
- Stripe test-mode checkout, portal, webhook, cancellation and failure paths pass.
- Supabase Auth hardening and two-user/two-workspace RLS tests pass.
- GDPR documentation is reviewed: privacy notice, terms, DPA/processor list, data-retention, export and deletion.
- Domain, support contact, incident owner, monitoring, backup/restore and rollback procedure are ready.
- Financial-model limitations and professional-advice boundaries are shown in product copy.
- The founder explicitly approves promotion to Production and live Stripe keys.

## 7. Still not automated / not yet proven

- Live AI Gateway verification and successful inference.
- Stripe product/price creation and test-mode end-to-end payment.
- Authenticated browser acceptance tests.
- Subscription entitlement/paywall policy. Decide whether new workspaces get a trial, demo-only access or immediate paid checkout; do not silently enforce a paywall before the commercial policy is chosen.
- GDPR/legal review, VAT/tax setup and independent security review.
- Production promotion and customer onboarding operations.
