# Buyer Process Phase 8 Controlled Smoke

Date: 2026-08-14

## Purpose

Phase 8 records the controlled smoke observation for the buyer process
refinement. It starts only after Phase 6 release-readiness evidence has been
accepted and Phase 7 has recorded a go release decision.

This phase does not itself send buyer onboarding links. It does not itself upload OTPs.
It does not create transactions, send bond applications, send transfer
instructions, mutate buyer portals, change organisation configuration, deploy,
or alter lead stages. It validates a redacted observation from an authorised
controlled smoke run.

## Command

For local contract validation:

```bash
npm run test:buyer-process-controlled-smoke-phase8
```

For the guarded controlled-smoke gate after the run has been completed:

```bash
npm run verify:buyer-process-controlled-smoke -- --phase6-evidence=private-evidence/buyer-process-phase6-release-readiness.json --decision=private-evidence/buyer-process-phase7-release-decision.json --observation=private-evidence/buyer-process-phase8-controlled-smoke.json
```

The command revalidates the Phase 7 decision, which revalidates Phase 6, and
then accepts or blocks the Phase 8 observation.

## Observation Rules

Start from:

```text
docs/buyer-process-phase8-controlled-smoke.template.json
```

The observation must be redacted. It must not contain emails, names, phone
numbers, URLs, property addresses, buyer portal tokens, onboarding tokens,
signed URLs, OTP files, document contents, credentials, provider logs, raw buyer
profile facts, or client details.

Use opaque references only, for example `smoke-run-ref`, `lead-ref-global`, or
a ticket/reference digest.

The operator confirmation phrase must be exactly:

```text
BUYER_PROCESS_PHASE8_CONTROLLED_SMOKE_COMPLETE
```

## Required Controlled Smoke Proof

The observation must prove:

- Phase 7 go decision was accepted
- change window was approved before the smoke
- global and Kingstons stay separated
- the global and Kingstons test leads are isolated and controlled
- global onboarding link delivery is controlled
- global buyer onboarding submitted state was observed
- global Transaction Setup completed before Offer
- global signed offer upload or capture completed
- Kingstons manual OTP upload completed without using global onboarding as the
  primary path
- Kingstons signed-by-all-parties and Arch9 terms confirmations were captured
- buyer profile was captured before moving to Transaction
- bond originator handoff was observed
- transfer attorney handoff was observed
- buyer portal instructions were sent through the controlled route
- Move to Transaction gate was observed
- transaction was created from the accepted buyer process lead
- Buyer Process Handoff was visible in the transaction workspace
- converted transaction ID persisted against the converted lead
- no Kingstons manual OTP state leaked into the global flow
- no global onboarding-link primary path leaked into the Kingstons flow
- rollback was validated before the smoke and was not needed
- support monitoring was clear after the smoke

## Stop Conditions

The observation must be `failed` or `aborted` if:

- evidence is missing, stale, private, or from a different project/source
- Phase 7 does not have a go release decision
- a global buyer lead shows the Kingstons manual OTP order
- a Kingstons buyer lead shows global onboarding as the primary manual OTP path
- global buyer leads regain OTP generation
- signed OTP upload can bypass signed-by-all-parties or Arch9 terms confirmation
- Transaction Setup can complete without buyer profile and roleplayer facts
- bond originator or transfer attorney handoffs cannot be traced
- buyer portal instructions require private links in release evidence
- Move to Transaction can bypass accepted-offer and Transaction Setup gates
- Buyer Process Handoff is missing from the transaction workspace
- converted transaction IDs do not persist against the converted lead
- rollback readiness is missing
- support monitoring shows any global/Kingstons cross-over

Phase 8 is an observation gate only. It does not approve wider rollout beyond
the explicitly controlled smoke scope.
