# Service Business Platform

This repository contains the shared production platform for service-business verticals, beginning with electrical services.

## Core principles

- Shared platform architecture with vertical-specific configuration.
- Supply-first launch gating: recruit and verify providers before activating customer demand in an area.
- Audience-specific experiences for customers, businesses, providers, education partners and internal operations.
- Transparent commercial rules with no hidden double-dipping.
- Zero-routine-work automation: deterministic straight-through processing first, exception handling second.
- Auditability by design across jobs, compliance, payments and finance.

## Current foundation

The repository includes provider verification, public verification profiles, coverage gating, customer booking, business enquiries, Academy interest, authentication/portals, job dispatch and offer lifecycle, operations controls, evidence moderation, reviews/quality feedback, notifications substrate, and critical foundations for individual engineer identities, competencies, availability, provider-owned rate cards, structured scheduling, geolocation fields and an append-only balanced finance journal.

The electrical vertical remains the first implementation. Production Supabase/hosting/Stripe wiring is intentionally kept environment-specific and must be connected before the public domain is moved from the legacy prototype.
