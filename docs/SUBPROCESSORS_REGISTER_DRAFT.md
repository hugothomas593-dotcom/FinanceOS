# Avenor subprocessor register — WORKING DRAFT

**Status: NOT APPROVED FOR CUSTOMER DISTRIBUTION.** This register identifies providers visible in the current application architecture, not a complete legally verified processor inventory. Confirm contracting entities, exact services, data locations, access, transfer terms and retention before publication.

| Provider / service | Purpose in Avenor | Data potentially processed | Region / transfer status |
|---|---|---|---|
| Supabase — Auth and Postgres | User authentication, workspace database, imported financial records, conversations, scenarios and application metadata | Account identifiers, workspace content, financial records, prompts and logs | Staging project verified in EU West. Production region, backups, support access and retention require a fresh check. |
| Vercel — application hosting | Host Next.js app and server routes; runtime/build logs and deployment metadata | Requests, account/session context, application data processed by server routes, technical logs | Preview functions observed in Dublin region. Production regions/log retention must be verified. |
| Vercel AI Gateway | Route Copilot inference to configured model | Copilot prompt, workspace context, model instructions and generated response | Code requests EU inference region. Confirm actual request/provider routing and gateway settings. |
| Anthropic — Claude model via AI Gateway | Generate natural-language Copilot explanations and tool selection | Prompt and relevant workspace financial context included in AI request | Provider region, retention, training/data-use terms and contractual path must be confirmed. Vercel's gateway ZDR claim does not by itself prove downstream provider handling. |
| Stripe | Hosted Checkout, billing portal, subscription events and payment processing | Customer email, Stripe customer/subscription IDs, billing status, payment details entered directly into Stripe | Stripe processing locations, account region, data retention and DPA/transfer terms must be confirmed. Avenor does not intentionally store raw card numbers. |

## Required before publication

- [ ] Confirm legal contracting entity for each provider and exact service names.
- [ ] Obtain and archive each provider DPA and applicable subprocessor list.
- [ ] Confirm all production regions, support access, logs and backups.
- [ ] Confirm AI model provider(s), actual routing, ZDR capability, data-use/training policy and transfer mechanism.
- [ ] Complete transfer impact assessment / SCC analysis where required.
- [ ] Define how customers are notified of subprocessor changes and how objections are handled.
- [ ] Reconcile this register against the live production architecture before sending it to a customer.
