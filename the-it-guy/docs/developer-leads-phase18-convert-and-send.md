# Developer Leads Phase 18 Buyer Onboarding Send

Phase 18 turns the Phase 17 handoff into a buyer-onboarding action.

## What It Does

- Adds a guarded `Send Onboarding` action on eligible Developer Leads rows.
- Uses the existing transaction creation engine to prepare the onboarding
  context required by the buyer portal.
- Ensures a buyer onboarding token exists for the onboarding context.
- Sends the buyer onboarding email through the existing `send-email` Edge
  Function.
- Records buyer-onboarding-sent activity through the shared transaction helper.
- Marks the developer lead as `onboarding_sent` and stores the linked
  onboarding context id.
- Shows the generated buyer onboarding link after sending and copies it when
  browser clipboard access is available.
- Keeps `converted` for the later OTP/transaction-workflow handoff.

## Guardrails

- The action is only enabled when Phase 17 says the lead is eligible.
- Agency-fed leads still require handover before private buyer details can be
  used.
- Developer buyer onboarding still requires a primary development and preferred
  unit.
- Sending uses existing transaction/onboarding RLS paths; it does not add
  privileged database functions or bypass RLS.
- Uploading the signed OTP is the operator handoff into the transaction
  workflow.

## Operator Notes

If email delivery fails after the onboarding context is prepared, the link remains
visible in the Developer Leads page so the operator can send it manually or open
the onboarding context.
