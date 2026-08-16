# Developer Leads Phase 26 Operations Health

Phase 26 adds a developer-side operations health view for lead follow-up.

## What It Adds

- Adds a read-only operations health model for active developer leads.
- Flags missing primary development allocation, unassigned developer-owned
  leads, stale follow-up, protected agency handovers that have not been
  requested, handover SLA items, released leads awaiting conversion, and
  qualified leads blocked from conversion.
- Adds a developer leads page panel with blocker, attention, stale, and
  released-awaiting-conversion counts.
- Reuses existing developer lead rows and the existing Phase 17 transaction
  handoff checks.

## Operating Boundary

Phase 25 gives the developer attribution visibility across source lanes.

Phase 26 gives the developer an operational exception list so lead managers can
see what requires action before a lead can move to transaction conversion and
buyer onboarding.

## Guardrails

Phase 26 does not create transactions, send buyer onboarding, expose onboarding
tokens, add Supabase tables, add RLS policies, bypass RLS, or add privileged
database functions. It is a read-only model and developer-page UI.
