# Raeburn AutonomyOS — durable execution and enterprise assurance

## Implementation checkpoint: 12 October 2026

The platform is **NOT** yet A+++++ commercially verified. This change introduces the first durable orchestration and operator-control foundation. Nothing here authorises payments, refunds, qualification approval, email campaigns, calendar invitations, public content publication or new trade launches.

### Delivered in PR #17
- Migration `0038_autonomyos_kernel.sql`: private, service-role-only, row-level-secured domains, workflows, immutable audit events, incident records, and human-review recommendations.
- Idempotency keys: the same action identity cannot be enqueued repeatedly with different worker types. Bounded JSON payloads and predefined types prevent arbitrary code execution.
- Atomic row claims with `FOR UPDATE SKIP LOCKED`, randomly generated lease tokens, four-minute execution leases, retry backoff of 30/90/270/810 seconds, max-attempt dead-letter handling and incidents.
- A stale worker cannot commit a result after another worker has reclaimed its lease.
- Explicit per-domain stop switches (all OFF initially), plus separate environment-level switches per action type.
- An internal-only one-task-per-tick executor, idempotent enqueue route, and authenticated scheduler endpoint. **No recurring scheduler is activated by this PR.**
- A fixed registry of preapproved worker handlers. Financial transfers, refunds, approvals, external content publication and new trade activation have no worker type.
- Read-only assurance that reports failed Stripe receipts, unknown email outcomes, finance reconciliation exceptions and dead letters; it never claims that a configured payment system passed a live test.
- Server-side administrator-authenticated `/mission-control`, with queue, incident and recommendation views; strict role-based stop switches and queued-only cancellation.
- Unit tests for action allowlists, dual feature gates, backoff, HTTP 207 failures and same-origin control requests.

### Non-negotiable release gates
1. Verify migration 0038, RLS and function execute privileges in the **correct** Service_Business Supabase project; tests must use transactions and ROLLBACK, not live customer data.
2. Exercise duplicate enqueue, concurrent claims, failed retry, expired lease, dead-letter incident, stale-token rejection, domain pause, queued cancellation and append-only audit enforcement in isolation.
3. Confirm `AUTONOMY_KERNEL_ENABLED` is unset/false in production. New domain control switches must be OFF. Existing legacy cron flows operate independently and are not stopped by AutonomyOS controls.
4. CI, TypeScript and production build must pass; verify exact main commit and protected health endpoint.
5. Run genuine end-to-end test journeys, including secure webhooks, provider competency, bookings, Stripe payment/refund/transfer accounting and customer messages. Do not claim these passed from a health check.
6. Establish a reliable sub-daily scheduler, centralised metrics, alerts, restore drills and runbooks. Vercel's current `vercel.json` only schedules daily intelligence; the autonomy-tick endpoint is **not yet scheduled**.
7. Verify Apollo, Resend and Google Calendar OAuth in the deployed environment separately, plus corporate/sole-trader marketing eligibility, suppression and manual campaign approval.
8. Validate normal-user vs trusted-admin access. Only server-managed `auth.users.app_metadata.service_business_autonomy_admin=true` permits Mission Control. Configure privilege through an authorised Supabase administrator, not self-service user metadata.
9. Only after all those tests, enable permitted domains and the kernel one at a time with rollback and operator escalation.

### Twelve capability roadmap (current truthful state)

| Capability | Status / next evidence |
| --- | --- |
| Durable orchestration | Implemented in this PR; must prove database replay and recovery |
| Live Mission Control | Built in this PR; admin auth and real incident flow need smoke testing |
| Automated assurance | Basic read-only exception detector built; alert delivery and external monitors outstanding |
| End-to-end simulation | Pure decision-policy tests present; full integration/fault-injection lab outstanding |
| Revenue director | Outreach/CRM code exists; verified leads, compliant sends and conversions not yet operational |
| Partnership director | Universities/FE research + draft campaigns exist; negotiations and legal agreements remain human-approved |
| Provider acquisition | Basic demand-gap code exists; verified supplier base currently empty |
| Dispatch & capacity | Scheduling code exists; concurrency and field validation still required |
| Customer relationship AI | Notifications and templates exist; safe full conversational triage not commissioned |
| Financial intelligence | Stripe journal/reconciliation code exists; production money lifecycle not proven |
| Multi-trade factory | Only electrical vertical; cannot claim other licensed/regulatory workflows are ready |
| Continuous improvement | Human-review recommendation storage added; controlled experiments not commissioned |

### Safety design

The worker registry never executes a user-provided URL or prompt. Incoming email/customer text is untrusted evidence, never an instruction with permission to initiate payouts or qualifications. Database permissions, allowlisted workflow kinds and deployment controls all must agree before an action executes. Status changes have signed-in admin authority, explicit enable confirmations and origin checks.

**Escalation**: dead letters, unreconciled money, unknown delivery outcomes, emergency safety reports and document verification conflicts require operator review. No automated retry of an ambiguous external transfer is permitted.

### Remaining engineering programme

1. Production test lab/fixtures with signed Stripe and Resend delivery, fake external provider adapters, restore exercises and disaster recovery.
2. Robust financial correctness including expense/refund journals, transfers, reserves, Stripe destination checks and dispute cases.
3. Event-driven task generation from bookings, enquiries, accepted quotes, provider capacity and Academy opportunities.
4. Scheduled autonomous prospect research, verification, human campaign approval, inbox classification and measurable outreach conversion.
5. Versioned multi-trade blueprints with actual legal/professional rules, provider supply, quotes and service-area launch gates.
6. SLO dashboards, anomaly alert channels, cost controls and audit retention policies.
7. Experiment evaluation and measured learning with rollback; AI never rewrites its own permissions or deploys unapproved code.

This is the foundation for high autonomy, not a claim that every feature in the roadmap is finished.
