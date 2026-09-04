# Stripe Connect integration plan

## Business model

Marketplace. Customers buy the managed electrical service through the platform. The platform is merchant of record for marketplace transactions and owns payment support, refunds and disputes.

## Approved Connect configuration

- Connected account Dashboard: none (fully white-label provider experience)
- Fee collection: application (the platform manages pricing and pays Stripe processing fees)
- Negative balance liability: application (the platform is liable for connected-account negative balances)
- Connected account configuration: recipient
- Required capability: `configuration.recipient.capabilities.stripe_balance.stripe_transfers`
- Onboarding: embedded Stripe onboarding/components inside the contractor portal where practical; the platform must also expose requirements/remediation, earnings, payout, refund and dispute status itself.
- Charge pattern: separate charges and transfers
- Customer checkout: charge created on the platform account with a unique `transfer_group`
- Provider settlement: transfer created only after the job is completed and the platform's clearance rules pass
- Fraud: Stripe Radar plus marketplace-specific custom rules
- Refund/disputes: platform-owned, policy-first automation with an exception queue

## Commercial rule

Current standard consumer pricing hypothesis:

- Provider controls the underlying job price.
- Customer service fee: 15% (`1500` basis points), subject to later published minimum/maximum if unit economics justify it.
- Provider receives 100% of the agreed provider price.
- The platform fee is shown separately to the customer.
- Never deduct a second marketplace commission from the provider for the same transaction.

Example: provider price £300, customer fee £45, customer total £345, provider entitlement £300.

## Settlement controls

A provider transfer is not created merely because the customer paid. Payment success creates a held provider entitlement. Transfer becomes eligible only after completion, the configured clearance period, active provider/Stripe capability status, and no open safety/dispute/refund/rework case that blocks settlement.

All Stripe money movements must post idempotent entries to the internal finance journal and remain linked to the job, customer, provider, Stripe objects and audit events.

## Compliance and operational note

`dashboard: none` deliberately increases platform responsibility. The provider portal must surface ongoing Stripe KYC requirements and payout status, and the platform must maintain webhook-driven refund/dispute/recovery workflows. Production activation must not occur until those flows and the connected-account liability acknowledgement are complete.
