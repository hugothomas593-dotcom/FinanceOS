# Avenor privacy notice — WORKING DRAFT

**Status: NOT APPROVED FOR PUBLICATION.** This draft contains unresolved company-identity, retention, transfer and processor details. It is not legal advice and must be reviewed by qualified counsel before customers are invited to upload real financial information.

**Last reviewed:** 16 November 2026

## 1. Who is responsible?

Avenor's legal data controller is:

- Legal name: **[INSERT REGISTERED LEGAL NAME]**
- Legal form and registration number: **[INSERT]**
- Registered office: **[INSERT FULL ADDRESS AND COUNTRY]**
- Privacy contact: **[INSERT MONITORED PRIVACY EMAIL]**
- Data Protection Officer, if appointed: **[INSERT CONTACT OR STATE NOT APPLICABLE AFTER REVIEW]**

Do not publish this notice until these fields are completed and the controller/processor allocation has been reviewed.

## 2. Our role

Avenor processes account, billing, website-security and support data for its own service operation. For financial and company information that a business customer uploads to its workspace, Avenor will generally act as that customer's processor, while the customer determines the purposes and means of processing. The exact role depends on the processing activity and must be reflected in the signed Data Processing Agreement (DPA).

## 3. Personal data processed

Depending on how the service is used, the application may process:

- Account details: name if supplied, email address, authentication identifiers and session/security metadata.
- Workspace data: company name, country, base currency, team membership, role and founder-provided company context.
- Financial information: cash-flow assumptions, forecasts, business KPIs, saved scenarios and imported bank/accounting CSV rows. Transaction descriptions or counterparties can contain personal data.
- Copilot information: user prompts, conversation history, calculation evidence and relevant workspace data sent to the AI inference provider to generate an answer.
- Billing information: Stripe customer/subscription identifiers, status, trial and billing-period dates. Avenor does not intentionally store raw payment-card numbers; hosted Checkout and the Billing Portal are provided by Stripe.
- Technical data: IP/request metadata, browser/device information where available, security events, logs and error diagnostics.

## 4. Why and on what legal basis?

The final lawful-basis assessment must be completed by the controller for each purpose. Proposed bases for review:

| Purpose | Proposed basis — confirm with counsel |
|---|---|
| Create accounts, authenticate users and provide the subscribed service | Performance of a contract |
| Process customer workspace financial data on the customer's instructions | Customer's documented instructions under the DPA; customer determines its lawful basis |
| Process subscriptions, invoices and payment status | Performance of a contract and legal obligations |
| Protect the service, prevent abuse, enforce rate limits and investigate security incidents | Legitimate interests, subject to a balancing assessment |
| Respond to support requests and service communications | Contract and/or legitimate interests, as applicable |
| Meet accounting, tax and other statutory duties | Legal obligation |

Do not rely on consent as a general substitute for the correct legal basis.

## 5. AI Copilot and financial data

When a user sends a Copilot message, the server can include the workspace company name and currency, saved financial-model assumptions, a snapshot of forecast outputs, up to 5,000 recent imported actuals, monthly KPIs and founder-provided company context in the AI request. The prompt and relevant workspace data are used to generate the response. Do not submit third-party personal data unless the customer has a lawful basis and authority to do so.

The current code routes the request through Vercel AI Gateway and defaults to the model identifier `anthropic/claude-sonnet-4.6`, with EU inference-region settings. The exact provider selected, provider-side retention, transfer mechanism, contractual terms and production routing must be confirmed before launch. Vercel describes Zero Data Retention for the gateway layer, but downstream provider handling is separate; Avenor must verify actual settings and contractual coverage rather than promise that all inference data is never retained.

## 6. Service providers and transfers

The current technical architecture uses Supabase (authentication/database), Vercel (application hosting and AI Gateway), Stripe (billing) and the model provider selected through AI Gateway. The subprocessor register and DPA must identify the legal entities, service purposes, actual data locations, applicable transfer safeguards and current provider terms.

Do not state that all data remains in the EU until all production regions, provider routes, backups, logs and support access have been verified.

## 7. Retention

Retention periods are not yet configured and evidenced for all data classes. Before publication, set and document periods for:

- Account and authentication records: **[DEFINE]**
- Workspace financial records and CSV imports: **[DEFINE; include customer deletion and backup expiry]**
- Copilot threads, prompts, answers and evidence: **[DEFINE]**
- Billing and accounting records: **[DEFINE statutory retention by establishment country]**
- Security, rate-limit and audit logs: **[DEFINE]**
- Support records: **[DEFINE]**

The technical rate-limit table expires old per-user windows after two days when the user makes a subsequent request; this is not a general application-data retention policy.

## 8. Security

Avenor uses Supabase authentication, organization membership checks, PostgreSQL Row Level Security, server-only credentials, signed Stripe webhooks, same-origin checks for mutating browser API requests and shared per-user server-side rate limits. These controls reduce risk but do not guarantee perfect security. Avenor has not completed an independent penetration test or full Production security assessment.

Do not claim SOC 2 or ISO 27001 certification for Avenor, or that Avenor is 100% secure.

## 9. Data subject rights and contact

Depending on the applicable law and the controller/processor relationship, individuals may have rights to access, rectify, erase, restrict, object to or port personal data and to complain to a supervisory authority. Customers acting as controllers should route end-user requests to Avenor through the DPA process.

Privacy request email: **[INSERT MONITORED ADDRESS]**  
Response workflow and identity-verification procedure: **[DOCUMENT BEFORE LAUNCH]**

## 10. Children and sensitive information

Avenor is designed for business founders and finance teams, not children. Do not upload special-category personal data, payroll files containing unnecessary employee data, bank credentials, card numbers or other highly sensitive personal information.

## 11. Changes

The notice's version history, effective date and customer notification process must be added before publication.

---

## Pre-publication checklist

- [ ] Complete legal controller identity, address, registration and monitored privacy contact.
- [ ] Confirm controller/processor roles and lawful bases with counsel.
- [ ] Execute/review provider DPAs and Avenor customer DPA.
- [ ] Confirm exact production regions, backups, log retention, AI model provider and transfers.
- [ ] Approve retention/deletion schedule and implement customer export/deletion workflows.
- [ ] Review cookie/analytics usage and add consent controls if required.
- [ ] Verify the contact and data-subject-rights response process.
- [ ] Obtain legal review and only then publish at `/privacy`.
