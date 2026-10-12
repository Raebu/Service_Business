# Education partnerships and growth integration handover

## Audience and offers
The `education_partnerships` workstream is distinct from `academy_employer` (employer demand) and `corporate_acquisition` (service buyers). Institution categories: universities, FE colleges, sixth forms, apprenticeship providers, independent training organisations, adult learning and skills bootcamps.

Potential conversations: industry curriculum advice, electrical work placements, employer introductions, guest lectures, practical projects, employability partnerships and adult reskilling. These are **proposals for discussion**, not claims of awarded contracts, secured placements, accreditations, grants, university endorsement or funding.

## Implemented
- Migration 0036 expands database workstream checks and creates private education partnership stages, evidence and Apollo discovery candidates; two unapproved, unsent education email campaigns are seeded.
- Internal `POST /api/internal/education-discovery` optionally searches UK Apollo People Search, stores organisation and job-title research only. No enrichment, guessing of emails, or marketing eligibility is performed.
- Internal `POST /api/internal/education-partnerships` stores verified institution source/domain and declared partnership interests, transactionally inserting a prospect in `discovered` status without contact rights.
- Institutional meeting requests remain `needs_review`. `POST /api/internal/growth-calendar-booking` requires a *previously approved* meeting, checks Google Calendar free/busy and holds ambiguous booking outcomes for reconciliation, never auto-retries.
- `POST /api/growth/admin/campaigns/[campaignId]/approve` requires a signed-in Supabase user with **trusted** `app_metadata.service_business_growth_admin=true`; it does not enable sending.
- Resend signed inbound processing now fetches full message text to detect opt-outs in the email body and safely retries incomplete processing.
- Migration 0037 restricts client-writable `profiles` columns to `display_name`, blocking self-promotion via `default_role`.

## Current connected-provider facts, 12 October 2026
- Apollo MCP research for UK employer-engagement and employability roles works. **Search provides no direct emails**, so researching an institution is not sending a message.
- Resend account with `theraeburngroup.com`: sending verified; receiving disabled. No webhooks on that account. To preserve root mail, use a dedicated receiving subdomain **only when DNS access is available**, rather than overwriting production MX records.
- Google Calendar connector is linked to a business calendar, but the running Next.js application does **not** inherit connector OAuth tokens. For the calendar adapter, install scoped OAuth credentials into Vercel: `GROWTH_GOOGLE_CLIENT_ID`, `GROWTH_GOOGLE_CLIENT_SECRET`, `GROWTH_GOOGLE_REFRESH_TOKEN`, `GROWTH_GOOGLE_CALENDAR_ID`.
- The public Vercel `.vercel.app` deployment is SSO-protected. Earlier access to change the Vercel automation bypass returned 403. Until a publicly accessible, signature-protected inbound webhook route exists, do not claim that live inbound email or Stripe webhooks are operating.
- All live marketing flags remain OFF, including `ENABLE_AUTONOMOUS_OUTREACH`, `growth_controls.outbound_enabled`, `ENABLE_EDUCATION_DISCOVERY` and `ENABLE_APPROVED_GROWTH_MEETINGS`.

## Activation checklist
1. Confirm privacy and PECR UK marketing assessment for each recipient and establish institutional legal form, lawful basis, verified professional email and relevant opt-out details.
2. Curate contacts from legitimate sources. Apollo candidate records are research-only; never treat search snippets, masked names or `has_email` as verification.
3. Review and approve education draft campaigns through an authenticated administrator, using server-owned user `app_metadata`. Separate admin privilege must be provisioned by an authorised Supabase administrator, not the prospect.
4. Ensure an appropriate sending subdomain and dedicated receiving solution, add Resend webhook and signing secret (`GROWTH_RESEND_WEBHOOK_SECRET`), and test inbound/body classification, bounce and unsubscribe end to end. Outbound uses `GROWTH_OUTREACH_FROM_EMAIL`, `GROWTH_REPLY_TO_EMAIL`, and `RESEND_API_KEY`.
5. Set `APOLLO_API_KEY` only if unattended discovery is approved; otherwise use the existing Apollo connector for supervised research.
6. Configure Google Calendar OAuth scopes for free-busy and event creation. Do not enable `ENABLE_APPROVED_GROWTH_MEETINGS` before credentials, invitation wording and human approval rules are verified.
7. Configure webhook access/monitoring with appropriate project administrator permission. Never put webhook-signing secrets in URLs or bypass protection for all routes.
8. Test and audit all negative cases (unknown subscriber type, no verified domain/email, opt-out, rejected campaign, occupied meeting slot, Google API timeouts, spoofed webhook, duplicate replies).
9. Only then schedule approved high-frequency outreach/operations and enable corresponding flags explicitly. Daily business-intelligence processing is **not** evidence of live outreach.

Live checkout/Stripe, verified supply, dispatch, and multi-trade launches remain separately blocked pending controlled end-to-end validation.
