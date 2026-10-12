# Service Business production release gate (12 October 2026)

The authoritative repository is `Raebu/Service_Business`. The customer domain must NOT be repointed solely because GitHub CI and a Vercel build pass. All service lines other than the electrical vertical remain unimplemented.

## Verified production facts

- Vercel application: `service-business-ten.vercel.app`, latest deploy from `main`, protected by Vercel Authentication. The authenticated `GET /api/health` returned HTTP 200 and `ready:true` on 12 October 2026; this checks **configuration presence, not payment delivery or provider availability**.
- Correct Supabase project: `utxzfelxvbeeqmdmrjbb`. Migrations `0031` (role capability), `0032` (engineer competency lifecycle), and `0033` (settlement claim safety) were applied and confirmed in migration history.
- Production Supabase had zero providers, engineers, customer jobs, live service areas, finance-journal entries and Stripe event receipts at the last audit.
- Live Stripe webhook `we_1UD5lVDG7MuGUtai9IY2C6Sg` is enabled and points to `https://service-business-ten.vercel.app/api/stripe/webhook`. Signature matching and actual delivery have not been verified.
- Stripe live account had zero PaymentIntents and zero charges when inspected on 12 October 2026.
- The live Stripe endpoint targets a `vercel.app` domain protected by Vercel Authentication. Project automation bypass creation returned permission denied (403); **no protection or webhook settings were changed**.
- Payment reliability, settlement concurrency, worker orchestration, checkout and reconciliation hardening were merged via PRs #6–#9 and #11. PR #10's Vercel package-manager change was reverted in #11 after a failed deploy. Later changes must be independently verified for code SHA, CI and deployment.

## Release gates requiring real evidence

1. **Webhook reachability**: configure a publicly reachable dedicated webhook host, or a controlled Vercel automation bypass with appropriate project-admin permissions. Preserve Stripe signature verification. Prove a real signed event reaches the correct endpoint and is recorded exactly once; verify failed-event replay.
2. **Payment lifecycle**: test quote approval, Checkout, payment status, balanced accounting, refund/dispute adjustments and safe transfer reconciliation with authorised credentials and a genuine customer journey. Never generate a live card charge, refund or payout merely as a synthetic test.
3. **Supply and scope**: verify provider business identity, service-specific qualifications, insurance, capability, real availability, usable coverage areas and customer service promises. The current implementation supports the electrical vertical only.
4. **RBAC and safety**: perform representative positive/negative organisation-capability tests and exact-service engineer competency, expiry, revocation and trainee-supervision tests.
5. **Dispatch and automation**: prove single-winner dispatch under concurrent acceptance and safe recovery; verify notification delivery, compliance, reserve, settlement and reconciliation workers. The new operational cycle is feature-gated; no high-frequency scheduler has been activated, and automated settlements must stay off pending sign-off.
6. **Security and reliability**: review Supabase advisors, record DB performance baselines, add dependency lockfiles and branch protection, and configure actionable alerts.
7. **Domain activation**: after verified end-to-end operation and sign-off, schedule a reversible domain cutover. Do not alter the existing electrician customer hostname early.

## Non-destructive checks

- `node scripts/production-preflight.mjs https://DEPLOYMENT-ORIGIN` performs basic public route checks when deployment protection permits access.
- Check Vercel deployment by exact `main` SHA and the protected health endpoint with authorised Vercel access.
- Query Supabase migration history and non-sensitive coverage/provider/payment counts.
- Check Stripe endpoint status and existing events in read-only mode.
- Record evidence, environment, date, reviewer and pass/fail for each release gate in the Service Business Master Todo Status spreadsheet.

Do not copy tokens, service-role keys, Stripe secrets, bypass secrets or customer data into issues, logs, docs or the tracker. **Build READY does not mean commercially launch-ready.**
