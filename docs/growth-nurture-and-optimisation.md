# Autonomous service growth: follow-up and evidence-based improvements

This layer builds on migration 0034 and keeps customer/financial safety gates intact.

## Included

- Migration 0035: meeting requests, conversion events, reviewed content drafts, action recommendations and atomic source-reference uniqueness.
- An immediate queued acknowledgement for genuine business enquiries, without claiming a booking or available provider.
- Time-based provider evidence reminders for applicants who were specifically asked for more evidence. 3-day and 7-day stages are idempotently queued. `ENABLE_PROVIDER_NURTURE` remains off until authorised activation.
- Daily evidence-driven opportunity analysis. Missing verified supply is prioritised for recruitment; a local content suggestion is only produced when verified supply and measured customer demand exist. All recommendations and content remain unpublished pending review. `ENABLE_GROWTH_INTELLIGENCE` remains off by default.
- Internal meeting requests stored as `needs_review`. No calendar event is claimed and no email is sent solely because a meeting record was created.
- Daily scheduling hooks for the two gated workers. With flags off the existing cron simply receives disabled status; no outreach or provider messages are sent.

## Still requires integrations

Provider discovery/decision-maker enrichment, legal-basis review, verified professional addresses, a dedicated outreach sender, Resend webhook signing, a publicly reachable webhook URL, Google Calendar availability and event creation, and real measured supplier coverage.

Full inbox AI replies, automatic publication, unsupported trade bookings, emergency safety decisions, financial transfers and high-frequency live outreach remain disabled or unimplemented.

**No migration or email sequence should be activated without verifying both the account and domain-level eligibility and existing suppression lists.**
