# Stripe test-mode readiness

The live webhook endpoint is enabled but production Stripe event receipts were zero when checked on 10 October 2026. This is not proof of failed delivery.

Do not use a live-mode API key or real card to simulate a payment. Before end-to-end payment testing, connect a Stripe sandbox or test account, use a test-mode webhook signing secret in an isolated deployment, and validate signed delivery, idempotent receipt handling, job status, balanced ledger postings, held settlement, refund/dispute behaviour and negative cases.

A production Vercel deployment being READY or having its STRIPE_WEBHOOK_SECRET set does not prove signature matching or processing. Keep live domain cutover blocked until delivery and reconciliation are evidenced.
