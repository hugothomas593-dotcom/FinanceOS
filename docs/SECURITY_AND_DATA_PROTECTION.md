# Avenor security and data protection — internal working note

**Status date:** 16 November 2026  
**Classification:** Internal engineering and launch-readiness document. Do not publish as a certification, audit report or customer assurance statement.

## Executive summary

Avenor has meaningful access controls in its application and staging database. In particular, customer workspaces are scoped by organization membership, sensitive financial tables use PostgreSQL Row Level Security (RLS), and paid product data is now additionally gated on a live, unexpired Stripe trial or subscription.

This is not a guarantee of perfect security. No independent penetration test, full two-customer CRUD isolation test, production backup-restore exercise or complete incident-response exercise has been completed. Supabase's certifications apply to Supabase's service boundary, not automatically to Avenor.

Do not tell customers that Avenor is SOC 2 certified, ISO 27001 certified, penetration-tested or “100% secure”. The accurate description today is that Avenor uses Supabase Auth and PostgreSQL RLS, enforces organization-level data access and has passed a limited staging paywall test.

## Current architecture and data flow

1. A founder signs in through Supabase Auth. The browser receives a Supabase session and uses only the public publishable key.
2. The Next.js application and server routes run on Vercel. The known Preview deployment used the Dublin `dub1` function region.
3. Workspace records are held in Supabase Postgres. The staging project is in `eu-west-1`. The production project's region must be independently confirmed before making a data-residency statement.
4. Stripe Checkout and Billing Portal are intended to handle subscription payment details. Avenor stores the Stripe customer/subscription identifiers and subscription state, not raw card details.
5. Avenor Copilot is designed to use Vercel AI Gateway. The intended model in the code is Anthropic Claude Sonnet 4.6. Successful model inference and provider-side retention/data processing terms have not been verified in this launch pass. Do not upload real customer financial records to the live Copilot until its data path and processor terms are confirmed.

## Controls present in the code and staging database

### Authentication and workspace authorization

- Server routes resolve the signed-in user through Supabase Auth; they do not trust a workspace ID by itself.
- A user must be a member of the requested organization before workspace data can be read or changed.
- Write permissions for models, scenarios, imported actuals and company context are restricted to workspace owners, admins or finance roles.
- Copilot threads and messages are scoped to the user who created the thread as well as the workspace.
- The service-role key is intended for server-only webhook and billing operations. It must never be placed in a `NEXT_PUBLIC_*` environment variable or sent to a browser.
- A user-facing sign-out action is present.

### PostgreSQL Row Level Security

RLS is enabled on the application tables in staging. Policies are applied per operation rather than assuming that authentication alone is sufficient.

The staging database now contains an entitlement function that returns only a boolean to authenticated users. It checks that the current user belongs to the organization and that the linked Stripe subscription is either `trialing` or `active`, with a non-expired current period. The trial-claim table and Stripe webhook receipt table have RLS enabled, no client-facing policies and no table privileges for `anon` or `authenticated`; they are intended for server-side service-role access only.

### Stripe subscription and access controls

- Checkout is hosted by Stripe and requires a payment method at trial start.
- The intended first-time offer is 30 days free, then €59 per month.
- Trial eligibility is reserved per authenticated user and retained after the trial is used, so a returning user cannot claim another free trial by creating a second workspace.
- Stripe webhooks verify the signature and record event IDs for idempotency.
- Workspace access is granted only while the Stripe subscription is `trialing` or `active` and its current period has not ended.
- Failed-payment, cancellation and expiry states are synchronized from Stripe webhooks. The live Checkout/webhook integration has not yet been exercised with a real Stripe test-mode flow.

### Data import

- CSV uploads are limited to 2 MB and 10,000 rows.
- Supported import formats include comma, semicolon and tab delimiters, European date and decimal formats, and optional per-row currency.
- Currency mismatches are excluded from workspace-currency totals; Avenor does not invent FX rates.
- Imported transactions are not automatically reconciled to accounting records or forecast assumptions.

## Staging verification performed

The following checks were run against the isolated Avenor staging project, not Production:

- The staging security advisor reported RLS enabled on the application tables.
- An authenticated QA owner who belonged to a workspace with no subscription called `public.has_organization_access`; it returned `false`.
- The same user could still read their organization and membership rows, which are needed to reach billing and subscribe.
- The same user could see **zero** financial actuals, model versions or scenarios through authenticated SQL, despite the staging organization containing financial data.
- The same user's attempt to insert a financial actual was rejected by Postgres with SQLSTATE `42501` because it violated the RLS policy.
- The authenticated role had no SELECT privilege on `public.billing_trial_claims`.
- The public entitlement RPC cannot be executed by the `anon` role; it is granted to `authenticated` only.

Additional staging-only entitlement simulations were run with all writes rolled back: an unentitled user saw zero actuals/models/scenarios/context; a trialing/active subscription exposed only its own workspace data; a `past_due` subscription and a non-member user saw zero rows. These are read-path simulations, not a full CRUD or two-customer acceptance suite.\n\nThe Preview correction branch also adds an origin/Fetch Metadata check to mutating API routes (Stripe webhooks are exempt and instead verify Stripe signatures) and Postgres-backed per-user rate limits for Copilot, CSV import, Checkout, Billing Portal and CFO Brief. Migration 012 was applied to staging. The rate-limit table has RLS enabled and no privileges for `anon` or `authenticated`; a permission check confirmed the authenticated role cannot read the table or execute its RPC. The database rate-limit function was exercised in a rolled-back test: the first two calls were allowed, the third was blocked, and authenticated users were denied table read and function execution. The HTTP middleware and route-level limiter have CI coverage/build validation, but still need authenticated browser and concurrent-load acceptance.\n\nA full Stripe test-mode subscription lifecycle was exercised against the isolated QA workspace. A synthetic customer and EUR 59/month, 30-day trial subscription were created in Stripe test mode. Stripe delivered a signed `customer.subscription.created` event to the Preview webhook; the event receipt and subscription were persisted in staging. This exposed an integration gap: Stripe flexible billing can provide `current_period_end` on the subscription item rather than the top-level object. The webhook now reads the top-level value or falls back to the latest item-level period end. A subsequent signed `customer.subscription.updated` event populated the expected period end; authenticated staging access then became true and the expected 66 financial actuals were visible. The test subscription was canceled in Stripe test mode; the signed deletion event changed staging status to `canceled`, `has_organization_access` became false, and financial actuals became invisible. The temporary subscription row was then removed from the synthetic demo workspace. No live charge was made. The test customer in Stripe test mode remains a non-chargeable synthetic QA record.\n\nThese checks prove only the described paths in staging. They do not prove every API, write operation, role combination, every two-customer isolation scenario or the Production configuration.

## Known gaps — do not claim these are complete

1. **Leaked-password protection:** Supabase Security Advisor reports this control disabled. The connected Supabase organization is on the Free plan; Supabase lists leaked-password protection as Pro and above. It cannot be enabled on the current plan. Upgrade is a paid account decision; after upgrade, enable it in Auth → Sign In / Providers → Email and verify the advisor is clear. Until then, keep registration limited to invited test users and enforce a strong minimum password policy as a partial mitigation.
2. **Independent security assessment:** No independent penetration test or vulnerability assessment of the Avenor application has been commissioned or completed.
3. **Cross-customer isolation:** A complete test with two separate authenticated users in two separate organizations, including attempted cross-tenant reads and writes across every table and API, remains to be completed.
4. **Backups and recovery:** The actual plan-level backup settings for each Avenor project, retention period, point-in-time recovery eligibility and a restore test have not been verified. Do not promise a recovery time or recovery point until measured.
5. **Production configuration:** The Production database, deployment region, environment variables, firewall/rate limits and webhook settings must be audited separately. Staging results do not transfer automatically.
6. **AI provider:** Successful AI Gateway inference was not evidenced in the previous seven-day usage query. Confirm provider routing, data retention, data-use terms, region and subprocessors before sending real customer data.
7. **Legal documents:** `/privacy` and `/terms` are not live. There is no customer-ready Avenor DPA, subprocessor register or published retention/deletion policy yet.
8. **Data lifecycle:** Customer self-service export and deletion, support-assisted erasure, retention limits for Copilot conversations and a documented backup-deletion schedule are not complete.
9. **Operational security:** Incident response, breach notification, access reviews, privileged-account MFA, security alert ownership, support escalation and periodic restore exercises need documented owners and rehearsals.

## How to prove data protection to a prospective customer

Build a small, accurate evidence pack. Do not substitute marketing language for evidence.

1. **Architecture and data-flow diagram:** Show what is stored in Supabase, what runs on Vercel, what goes to Stripe and what is sent to the AI provider. Label each environment and data region.
2. **Subprocessor register:** Identify Supabase, Vercel, Stripe, Vercel AI Gateway and the underlying model provider; state purpose, data categories, region and links to each provider's DPA/security materials. Confirm the exact provider chain before publishing it.
3. **Contractual documents:** Publish Avenor's privacy notice, terms, retention/deletion policy and customer DPA. Obtain and review the relevant processor DPAs. Explain international transfers and subprocessors accurately.
4. **Technical access evidence:** Keep the SQL/RLS test suite, entitlement tests, API authorization tests and CI results. Add two-user/two-workspace tests for read, insert, update and delete across every customer-data table.
5. **Independent assessment:** Commission an application penetration test once the Production release is stable. Share a dated executive summary, scope, remediation status and retest confirmation under NDA where appropriate.
6. **Operational evidence:** Demonstrate MFA for privileged accounts, secrets management, access reviews, backup retention, a completed restore exercise, monitoring, incident response and deletion procedures.
7. **Provider assurance:** Obtain Supabase's current DPA and relevant security report. Supabase's SOC 2 / ISO controls are evidence about Supabase's service, not an Avenor certification. Avenor remains responsible for its application, authorization and customer data handling.

## Release gates before accepting real company financial data

- [ ] Enable leaked-password protection and MFA for privileged accounts.
- [ ] Complete two-user/two-organization RLS and API isolation tests.
- [ ] Verify Production region, environment keys, access, rate limits and webhook configuration.
- [ ] Confirm Vercel AI Gateway provider, data handling and processor terms; complete a successful controlled test inference.
- [ ] Complete Stripe test-mode trial, cancellation, renewal, failed-payment, webhook retry and portal acceptance tests.
- [ ] Add a customer-ready Privacy Notice, Terms, Avenor DPA and subprocessor list.
- [ ] Verify backup settings and perform a restore exercise.
- [ ] Implement documented customer export, deletion, data retention and incident response.
- [ ] Commission an independent penetration test and remediate material findings.

## Provider and regulatory references

- Supabase shared responsibility model: https://supabase.com/docs/guides/deployment/shared-responsibility-model
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase password security: https://supabase.com/docs/guides/auth/password-security
- Supabase SOC 2 and compliance boundary: https://supabase.com/docs/guides/security/soc-2-compliance
- GDPR Article 32 (security of processing): https://eur-lex.europa.eu/eli/reg/2016/679/oj
- Stripe subscription trials: https://docs.stripe.com/billing/subscriptions/trials
- Stripe subscription webhooks: https://docs.stripe.com/billing/subscriptions/webhooks

