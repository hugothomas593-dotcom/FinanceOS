# Avenor Data Processing Agreement — WORKING DRAFT

**Status: NOT APPROVED FOR SIGNATURE.** This is a structure for legal completion, not an executed GDPR Article 28 agreement. The legal identities, processing instructions, subprocessors, data locations, transfer mechanism, retention and security commitments must be verified and approved.

## Parties

**Customer / Controller:** [LEGAL NAME, ADDRESS, REGISTRATION DETAILS]  
**Avenor / Processor:** [AVENOR LEGAL NAME, ADDRESS, REGISTRATION DETAILS]  
**Effective date:** [DATE]  
**Main service agreement:** [REFERENCE]

## 1. Scope and roles

Avenor processes personal data on the customer's documented instructions to provide the Avenor SaaS service. The customer determines the purposes and means of processing customer workspace data and is responsible for its lawful collection, accuracy, transparency and instructions. Avenor acts as an independent controller for account administration, platform security, billing and its own legal obligations where applicable.

## 2. Processing details — Annex 1

- Subject matter: hosting and analysis of business financial-planning data.
- Duration: contract term plus the agreed deletion/backup-expiry period.
- Nature and purpose: authentication, workspace collaboration, CSV import, financial forecasting, scenario modelling, Copilot responses, support and security.
- Data subjects: customer founders, employees, contractors and persons whose details appear in uploaded financial records.
- Personal data categories: names and email addresses, user identifiers, workspace roles, transaction descriptions/counterparties, financial and business context, Copilot prompts and conversation content, technical/security logs.
- Special-category data: not intended or required. Customer must not upload it unless separately agreed with safeguards and lawful basis.
- Instructions: provide and maintain customer account/workspace settings; submit financial records and questions; request export/deletion; and follow instructions documented in the service agreement and support tickets.

## 3. Processor obligations

Avenor will, subject to legal completion:

- Process customer personal data only on documented instructions, including transfer instructions.
- Ensure persons authorized to process data are bound by confidentiality.
- Implement appropriate technical and organizational measures.
- Assist the customer with data-subject requests, security obligations, DPIAs and consultations to the extent reasonably possible.
- Notify the customer of a personal-data breach without undue delay after becoming aware, using the agreed contact path.
- Make available information reasonably necessary to demonstrate compliance and support audits under agreed reasonable conditions.
- At the customer's choice, return or delete personal data at the end of service, subject to applicable legal retention and backup expiry.

**Breach notification contact and exact notification SLA: [INSERT AND APPROVE].**

## 4. Security measures — Annex 2 (current implementation, not a certification)

Current application controls include Supabase Auth, authenticated server-side routes, organization membership checks, PostgreSQL RLS, server-only service-role credentials, signed Stripe webhook verification, same-origin checks for mutating API requests and shared server-side per-user rate limits. Vercel hosts the Next.js application; Supabase hosts the database/authentication; Stripe handles billing; AI inference currently routes through Vercel AI Gateway.

These controls are not an independent penetration-test report or a promise of perfect security. Production configuration, MFA/access reviews, independent assessment, restore drills, incident response, retention and deletion need separate verification.

## 5. Subprocessors — Annex 3

The anticipated service providers are listed in `docs/SUBPROCESSORS_REGISTER_DRAFT.md`. Legal entity names, locations, data categories, transfer mechanisms and objection/notification procedures must be confirmed before execution. No subprocessor list should be treated as final merely because the code references a provider.

## 6. International transfers

No blanket EU-only statement is made. Verify the production Supabase region, Vercel hosting and support access, AI Gateway provider routing, downstream model provider, Stripe processing and backup/log locations. Add the actual applicable transfer mechanism (adequacy decision, SCCs and transfer impact assessment where required) after legal review.

## 7. Return and deletion

Define the export format, request authentication, completion period, deletion from primary systems, backup expiration, legal-retention exceptions and downstream provider deletion process. The service does not yet have a fully verified end-to-end customer deletion workflow; do not sign a commitment that the technical process cannot meet.

## 8. Audit and evidence

Audit scope, frequency, evidence package, confidentiality, cost allocation and any independent assessment must be agreed. Provider certifications do not automatically certify Avenor.

## 9. Annexes to complete

- Annex 1 — detailed processing description and instructions.
- Annex 2 — approved security measures and tested evidence.
- Annex 3 — final subprocessor list and locations.
- Annex 4 — international transfer mechanisms.
- Annex 5 — retention, return and deletion schedule.
- Annex 6 — breach notification and customer contacts.

**Legal review and signatures required before customer personal data is accepted.**
