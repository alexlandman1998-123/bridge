# Developer Leads Phase 17 Buyer Onboarding Handoff

Phase 17 adds the first buyer-onboarding handoff between developer leads and the
development transaction workspace context.

## What It Does

- Evaluates every developer lead for buyer-onboarding readiness.
- Requires visible buyer details before agency-fed leads can receive onboarding.
- Requires the lead to be `qualified`, `viewing`, or `reserved`.
- Requires a buyer name, buyer contact channel, primary development, and
  preferred unit before a buyer-onboarding context can be prepared.
- Builds a non-mutating handoff payload shaped for the existing transaction
  wizard and buyer-onboarding engine.
- Shows row-level readiness on the Developer Leads workspace.

## What It Does Not Do Yet

- It does not insert a transaction from the Developer Leads page.
- It does not send the buyer onboarding email from the lead lane.
- It does not bypass the existing transaction workspace or RLS policies.
- It does not mark the lead converted before OTP is uploaded.

## Next Step

Phase 18 prepares the existing onboarding context with the Phase 17 handoff
payload, then generates and sends the buyer onboarding link. OTP upload is the
handoff into the live development transaction workflow.
