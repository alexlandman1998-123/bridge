# Developer Leads Phase 21 Protected Intake Queue

Phase 21 makes agency-submitted development buyer leads operational inside the
developer module after Phase 20 capture.

## What It Adds

- Adds a `Protected Intake Queue` panel to `/developer/leads`.
- Summarises agency-fed leads that are still protected or awaiting handover.
- Shows protected summary, development interest, preferred unit context, budget
  band, status, and handover state.
- Lets the developer request buyer-detail handover through the existing
  `requestAgencyLeadHandover` service action.
- Keeps conversion locked for protected agency-fed leads until the agency
  releases handover.

## Privacy Boundary

The queue does not expose buyer name, email, phone, ID/passport values, private
agency notes, or raw agency payloads.

The developer sees only the protected summary and commercial context needed to
decide whether to request handover. Once the agency releases handover, the lead
leaves the protected queue and can follow the Phase 17/18 conversion path.

## Operational States

- `protected`: visible to the developer as a limited lead card, with handover
  request available.
- `handover_requested`: visible as awaiting agency release, with duplicate
  handover requests disabled.
- `released`: counted as released, but no longer shown in the protected queue.

## Guardrails

No Phase 21 code adds privileged database functions, bypasses RLS, creates
transactions, sends buyer onboarding, or changes live Supabase schema. Phase 21
does not convert leads; it uses the existing developer-lead service path and the
existing RLS-governed handover request update.
