# Production launch preflight — National Electrician Hub

This checklist reconciles the source repo against **Service Business Master Todo Status** (Google Drive), especially User Actions UA-001 through UA-005. The master spreadsheet is the tracking source, not proof of production readiness.

## Automated, non-destructive surface check

Use a preview/production deployment URL **without changing live DNS**:

```sh
node scripts/production-preflight.mjs https://YOUR-DEPLOYMENT-ORIGIN
```

The script checks the public health/configuration response plus customer and provider entry pages, exits nonzero on errors, and never triggers payments, bookings or cron jobs. Do not include credentials in the URL. Health readiness alone does not prove downstream integrations work.

## Remaining launch blockers

1. **UA-001 / configuration:** Confirm one valid public Supabase key is actually present in the Production deployment: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` **or** `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The workbook describes the latter as missing at a prior deployment; recheck current state, never expose private keys. Run the preflight above against the exact deployment.
2. **UA-004 / RBAC:** Apply `supabase/migrations/0031_capability_rls_completion.sql` to the correct service-business Supabase project through an authorised schema-write connection. Verify migration history, then execute positive/negative role permission tests for team, pricing, finance, calendars/location, learner and opportunity actions.
3. **UA-005 / competence:** Apply `supabase/migrations/0032_engineer_competency_lifecycle.sql` after 0031 and verify the exact-service, expiry, trainee-supervision, evidence-approval/revocation and dispatch gates. Do not assume migrations are deployed just because they are in GitHub.
4. **UA-003 / Stripe:** Configure the live webhook signing secret and agreed event subscriptions; replay representative webhook fixtures and test checkout, separate transfer, reserve hold, refund/dispute recovery, follow-on charge and invoice paths in Stripe test mode. Check idempotency, finance journal balance, and explicit provider payout clearance.
5. **Operations:** Confirm service-role security, email delivery, private evidence-storage policies, scheduled daily intelligence/competency/expiry workers, route provider ETA handling and production notifications. Test supply-first territory gating and simultaneous-offer single-winner behaviour.
6. **UA-002 / DNS:** Only after the above gates are evidenced should `electrician.theraeburngroup.com` be considered for cutover. Do not move the existing customer domain on the strength of one successful build or `/api/health` response.

## Evidence record

For every gate, record the deployment SHA, environment, test run URL, time, result, and reviewer in the master workbook. Keep secrets, customer information and test payment credentials outside the tracker. A failed gate leaves cutover blocked.

## Separation of delivery status

- **Code present:** committed files and passing CI.
- **Infrastructure configured:** verified environment and migrations on the intended production project.
- **Journey verified:** authenticated/negative-path production smoke tests and safe Stripe test-mode fixtures.
- **Commercially launchable:** legal, support, provider-supply, payments and area thresholds signed off.

No single status implies the next.
