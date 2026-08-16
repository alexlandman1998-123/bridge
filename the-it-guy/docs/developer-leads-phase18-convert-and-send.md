# Developer Leads Phase 18 Convert And Send

Phase 18 turns the Phase 17 handoff into an operator action.

## What It Does

- Adds a guarded `Convert & Send` action on eligible Developer Leads rows.
- Uses the existing transaction creation engine for developer-sale
  transactions.
- Ensures a buyer onboarding token exists for the created transaction.
- Sends the buyer onboarding email through the existing `send-email` Edge
  Function.
- Records buyer-onboarding-sent activity through the shared transaction helper.
- Marks the developer lead as `converted` and stores the linked transaction id.
- Shows the generated buyer onboarding link after conversion and copies it when
  browser clipboard access is available.

## Guardrails

- The action is only enabled when Phase 17 says the lead is eligible.
- Agency-fed leads still require handover before private buyer details can be
  used.
- Developer-sale conversion still requires a primary development and preferred
  unit.
- Conversion uses existing transaction/onboarding RLS paths; it does not add
  privileged database functions or bypass RLS.

## Operator Notes

If email delivery fails after transaction creation, the onboarding link remains
visible in the Developer Leads page so the operator can send it manually or open
the transaction workspace.
