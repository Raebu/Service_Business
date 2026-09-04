# Architecture

## Goal

Build one managed-service platform that can power multiple industries without cloning business logic.

## Layers

1. **Platform core** — audiences, providers, customers, corporate accounts, booking, dispatch, territories, payments, verification, reviews, portals, outreach, analytics, trust and launch readiness.
2. **Vertical configuration** — terminology, services, verification requirements, pricing rules, regulatory controls and launch thresholds.
3. **Brand configuration** — public name, visual identity, domain, copy and campaign settings.
4. **Deployments** — one or more consumer-facing brands using the same platform packages.

## Audience architecture

- Consumer
- Business / portfolio client
- Service provider
- Education partner
- Learner / apprentice
- Internal operations

Each audience gets a distinct acquisition journey and authenticated workspace. Internal operations must not leak into customer-facing account screens.

## Launch model

Supply first. Areas remain closed or recruiting until provider capacity and service KPIs meet configured thresholds. Only live areas should receive active consumer acquisition or location SEO pages.

## Verification model

Verification is a stateful, expiring record. A provider badge links to a public verification URL. Expired evidence can suspend the badge and dispatch eligibility automatically.
