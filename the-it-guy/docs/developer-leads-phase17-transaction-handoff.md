# Developer Leads Phase 17 Transaction Handoff

Phase 17 adds the first conversion bridge between developer leads and the
development transaction workspace.

## What It Does

- Evaluates every developer lead for transaction-handoff readiness.
- Requires visible buyer details before agency-fed leads can be converted.
- Requires the lead to be `qualified` or `reserved`.
- Requires a buyer name, buyer contact channel, primary development, and
  preferred unit before a development transaction can be prepared.
- Builds a non-mutating handoff payload shaped for the existing transaction
  wizard and buyer-onboarding engine.
- Shows row-level readiness on the Developer Leads workspace.

## What It Does Not Do Yet

- It does not insert a transaction from the Developer Leads page.
- It does not send the buyer onboarding email from the lead lane.
- It does not bypass the existing transaction workspace or RLS policies.

## Next Step

Phase 18 calls the existing transaction creation flow with the Phase 17 handoff
payload, then generates and sends the buyer onboarding link from the resulting
transaction.
