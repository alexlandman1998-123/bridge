# Developer Leads Phase 20 Agent Capture

Phase 20 wires the agency development surface into the developer-lead pipeline.

## What It Adds

- Adds a `Submit Buyer Lead` action on `/listings/developments`.
- Lets the agent select an assigned development and optional preferred unit.
- Captures buyer name, email, phone, budget, unit interest, protected summary,
  and private agency notes.
- Submits through `createAgencyIntroducedDeveloperLead`.
- Creates the developer lead as `agency_introduced`, `agent_led`, and
  `limited` visibility through the existing service.
- Refreshes the agent development listings surface and notifies the developer
  leads workspace through `itg:developer-leads-changed`.

## Privacy Boundary

The agent owns the buyer private details at capture.

The protected summary is the only buyer-context text intended for the developer
before handover. The UI blocks obvious leakage of buyer name, buyer email, or
buyer phone into that protected summary.

The developer sees a protected lead card until handover. Buyer private details
remain in `developer_lead_private_details` and are governed by the Phase 10/12
RLS contract.

## Required Context

The capture flow requires:

- a source agency workspace id
- a target developer workspace id from the selected development
- a primary development
- buyer full name
- buyer email or phone

Preferred unit is optional at capture, but should be captured when known so the
lead can convert cleanly in Phase 18.

## Guardrails

No Phase 20 code adds privileged database functions, bypasses RLS, sends buyer
onboarding, or converts the lead to a transaction. It only creates an
agency-introduced protected developer lead using the existing Supabase client
service path.
