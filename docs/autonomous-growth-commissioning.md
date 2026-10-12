# Raeburn Services — Autonomous Growth & Operations

## Safe commissioning state (12 October 2026)

The shared service platform supports electrical services first. Growth autonomy is **OFF BY DEFAULT** in the environment and Supabase.

**Implemented here**
- Migration `0034_autonomous_growth_control_plane.sql`: private campaigns, suppression, inbound records, audit runs and atomic rate-limited claims, preserving service-role-only database access.
- Read-only control centre: authenticated `GET /api/internal/growth-dashboard`; aggregated metrics, no raw prospect details.
- Research candidate intake: authenticated `POST /api/internal/growth-prospects`; imports up to 25 candidates as **discovered, unverified and non-send-eligible**. Unique source references are checked, and cross-domain/generic mailbox addresses rejected.
- Approved outreach delivery worker: authenticated `POST /api/internal/growth-outreach` and gated `GET /api/cron/growth-cycle`. Requires both `ENABLE_AUTONOMOUS_OUTREACH=true` **and** `growth_controls.outbound_enabled=true`, an approved campaign with real human `approved_by`, documented subscriber classification/legal basis, source provenance, named verified professional email and matching company domain. Maximum **25/hour and 100/day**, atomic in database. Follow-ups OFF by default. Unknown delivery results go to manual reconciliation, not automatic retries.
- Signed webhook `POST /api/growth/inbound`, with separate `GROWTH_RESEND_WEBHOOK_SECRET` and database `growth_controls.inbound_enabled`. On replies it suspends follow-ups and queues human review; explicit subject opt-outs and bounces suppress addresses. It does not send AI replies or falsely claim full-text classification.
- Public email preference form: `GET /api/growth/unsubscribe?token=...` and `POST /api/growth/unsubscribe`; service-role-mediated suppression. Marketing emails include sender identity and an opt-out route.
- Unit tests for legal gating, generic inbox blocking, signature verification, opt-out prioritisation and content sanitisation.

**Not commissioned and not to be claimed active**
- Unrestricted discovery crawling, Apollo people enrichment and independently verified direct email addresses.
- Resend webhook registration, actual inbound message body retrieval, human approval inbox and Calendar meeting integration.
- Company-type verification, LIA documentation and privacy notices for actual UK prospect data.
- Content creation/publishing, commercial forecasting, full AI customer support and enterprise-grade workflow orchestration.
- Live B2B sending, SMS or phone marketing, transactional settlement, Stripe customer payment verification, high-frequency scheduler.
- Non-electrical service verticals, verification and area-level capacity.

## Enabling live outreach (intentionally separate decisions)

1. Apply `0034` to the verified Service_Business Supabase project and verify private tables/RPC permissions, function correctness and new RLS lint findings.
2. Confirm a dedicated **verified outreach sending address**, bounce processing, dedicated inbound webhook and signed secret. Store secrets only in Vercel. Do not reuse production transactional sender unintentionally.
3. Configure a genuinely publicly reachable signed webhook endpoint; Vercel Authentication on generated domains currently blocks third-party webhook delivery. Project protection bypass creation previously returned 403; do not weaken security as a workaround.
4. Complete a written UK PECR / GDPR assessment for each campaign type and contact. Corporate subscribers differ from sole traders and many partnerships. For named contacts, document UK GDPR lawful basis, fair processing and a functioning opt-out.
5. Import real business candidates with proven data provenance. Enrich and verify them separately, assign to an actual approved campaign and review the complete sequence.
6. Run manual positive/negative tests for suppressed, unknown-subscriber, generic mailbox, invalid-domain, duplicate, non-approved, and timed-out delivery scenarios.
7. Explicitly activate `growth_controls.outbound_enabled` and `ENABLE_AUTONOMOUS_OUTREACH` **only after approvals**. To permit follow-ups, additionally approve the sequence and set `growth_controls.follow_ups_enabled=true`.
8. Set up authenticated scheduling for growth-cycle and alerting. This PR **does not add an active cron schedule**.

## Security and operation

The existing `CRON_SECRET` authenticates internal automation endpoints; do not share it with external prospecting vendors. Candidates from Apollo, Companies House or directories must enter as unverified suggestions; those services do **not** establish marketing consent.

Classifying unsubscribe or interest from an email subject is deliberately conservative. Full email bodies require a separate authenticated Resend inbound retrieval pipeline; no automatic reply is dispatched from an untrusted incoming message. Verify `GROWTH_RESEND_WEBHOOK_SECRET` against raw request bytes (Svix HMAC). Keep webhook signing secrets separate from Stripe secrets.

Use suppression lists globally and by sender domain, plus stopped follow-ups when ANY reply is received. Email limits apply across concurrently running workers because they are enforced in one Supabase database transaction.

The human control centre must be extended with role-aware approve/pause controls before activating sending; as delivered here it is read-only and accessible only to internal authenticated worker clients. Payouts, provider compliance approval, emergencies and refunds remain outside autonomous growth workflows.

## Dependencies

Existing: Next.js/Vercel, Supabase, Resend; optional later: Apollo for discovery, email verification provider, Google Calendar and AI summarisation.

No Cloudflare access is necessary to build or test this stage.
