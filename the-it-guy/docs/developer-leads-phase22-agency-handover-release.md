# Developer Leads Phase 22 Agency Handover Release

Phase 22 completes the protected agency-fed lead loop.

## What It Adds

- Adds a developer handover request panel to the agent portal Developments tab.
- Lists agency-introduced developer leads owned by the current agency workspace.
- Shows requested handovers with buyer name and contact details to the source
  agency only.
- Lets the agency release buyer details after the developer requests handover.
- Marks the developer lead `visibility_state = handed_over` through
  `releaseAgencyDeveloperLeadHandover`.
- Records a shared `handover_completed` activity event.

## Operating Boundary

The developer module requests handover in Phase 21.

The agency portal releases handover in Phase 22.

After release, the developer module can read private buyer details through the
existing RLS policy and can use the Phase 17/18 conversion path when the lead is
otherwise qualified and has a preferred unit.

## Guardrails

Phase 22 does not create transactions, send buyer onboarding, bypass RLS, add
privileged database functions, or change live Supabase schema. It only updates
agency-owned developer leads from `consent_pending` to `handed_over` using the
existing Supabase client path and scoped RLS policies.
