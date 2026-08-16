# Developer Leads Phase 25 Attribution Ledger

Phase 25 adds developer-side attribution visibility across lead sources.

## What It Adds

- Adds an attribution ledger for developer-direct, developer-assigned, and
  agency-introduced leads.
- Groups lead performance by source agency, credited agent, and primary
  development.
- Shows protected, handover requested, released, qualified/reserved, converted,
  lost, and active counts per attribution lane.
- Adds a developer leads page panel with total, agency, developer-owned, and
  converted lead counts.
- Keeps the ledger read-only and based on the existing developer lead intake
  rows.

## Operating Boundary

Phase 24 gives the source agency a conversion receipt after developer
conversion.

Phase 25 gives the developer a source attribution ledger for operational
tracking and conversion ownership.

## Guardrails

Phase 25 does not create transactions, send buyer onboarding, expose onboarding
tokens, add Supabase tables, add RLS policies, bypass RLS, or add privileged
database functions. It is a read-only model and developer-page UI.
