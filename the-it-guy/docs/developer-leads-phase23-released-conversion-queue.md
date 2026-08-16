# Developer Leads Phase 23 Released Buyer Onboarding Queue

Phase 23 closes the gap after agency handover release.

## What It Adds

- Adds a developer-side released buyer onboarding panel.
- Lists agency-fed leads where `visibility_state = handed_over`.
- Keeps protected and consent-pending leads out of the buyer onboarding queue.
- Reuses the Phase 17 transaction handoff rules for qualification, buyer
  contact, development, and preferred unit checks.
- Uses the existing Phase 18 `convertDeveloperLeadToTransactionAndSendOnboarding`
  action for eligible leads.
- Shows blocked released leads with the exact next setup action.

## Operating Boundary

Phase 21 requests handover from the developer module.

Phase 22 releases buyer details from the agency portal.

Phase 23 makes released agency leads actionable in the developer module and
keeps buyer onboarding send on the existing onboarding context path.

## Guardrails

Phase 23 does not create new Supabase tables, add RLS policies, bypass RLS,
call Edge Functions directly, send email directly, or add privileged database
functions. It is a read-only queue model plus developer-page UI that delegates
buyer onboarding send to the established Phase 18 service.
