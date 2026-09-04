# Service Business Platform

Reusable multi-vertical managed-services platform for service businesses.

The repository separates shared marketplace/managed-service architecture from vertical-specific configuration. The first vertical is electrical services, but the platform is designed to support HVAC, landscaping and other service categories without duplicating the core product.

## Principles

- Audience-led journeys: customers, business clients, service providers, training partners and authenticated users.
- Managed service, not a lead-selling directory.
- Supply-first launch gating: do not market an area as covered until verified provider capacity meets configured thresholds.
- Verification is evidence-backed and expiring, not a decorative badge.
- Corporate and consumer experiences are separate products on the same platform.
- Brand, terminology, services, compliance rules and launch thresholds live in vertical configuration.

## Planned structure

- `apps/web` — public website and portal entry point.
- `packages/platform` — reusable types, launch-readiness logic and vertical contracts.
- `packages/ui` — shared visual primitives.
- `verticals/electrical` — electrical-specific configuration and copy.
- `docs` — architecture, trust, verification and launch strategy.

## Status

Initial platform foundation in progress.
