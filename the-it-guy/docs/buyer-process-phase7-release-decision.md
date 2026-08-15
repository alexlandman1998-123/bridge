# Buyer Process Phase 7 Release Decision

Date: 2026-08-14

## Purpose

Phase 7 is the go/no-go release-decision gate for the buyer process refinement.
It starts only after Phase 6 has accepted redacted release-readiness evidence
for both the global buyer process and the Kingstons manual OTP variant.

This phase does not deploy. It does not send buyer onboarding links. It does not upload OTPs.
It does not create transactions, send bond applications, send transfer
instructions, mutate buyer portals, alter organisation configuration, or change
lead stages. It only validates a redacted release decision file.

## Command

For local contract validation:

```bash
npm run test:buyer-process-release-decision-phase7
```

For the guarded release-decision gate after Phase 6 evidence and a release
decision have been collected:

```bash
npm run verify:buyer-process-release-decision -- --phase6-evidence=private-evidence/buyer-process-phase6-release-readiness.json --decision=private-evidence/buyer-process-phase7-release-decision.json
```

The release command revalidates the Phase 6 evidence, then requires the Phase 7
decision file.

## Decision Rules

Start from:

```text
docs/buyer-process-phase7-release-decision.template.json
```

The decision must be redacted. It must not contain emails, names, phone
numbers, URLs, property addresses, buyer portal tokens, onboarding tokens,
signed URLs, OTP files, document contents, credentials, provider logs, raw buyer
profile facts, or client details.

Use opaque references only, for example `qa-owner-ref`, `release-ref-001`, or a
ticket/reference digest.

The operator confirmation phrase must be exactly:

```text
BUYER_PROCESS_PHASE7_RELEASE_DECISION_CONFIRMED
```

## Required Release Proof

The decision must prove:

- Phase 6 evidence was accepted and is still fresh
- global diagnostic passed against the same source state
- production build passed
- global and Kingstons stay separated
- the global buyer process keeps Captured, Contacted, Qualification, Viewing,
  Transaction Setup, Offer, Transaction
- the Kingstons buyer process keeps Captured, Contacted, Qualification,
  Viewing, Offer, Transaction Setup, Transaction
- global buyer leads have no OTP generation path
- Kingstons manual OTP path remains manual and requires signed-by-all-parties
  plus Arch9 terms confirmation
- Transaction Setup captures the buyer profile and roleplayer handoff details
- bond originator and transfer attorney handoffs are accepted
- buyer portal instructions are accepted without exposing private portal links
- the Move to Transaction gate and Buyer Process Handoff are verified
- converted transaction IDs persist from lead conversion
- offer-to-transaction scenario matrix passed
- the gate itself made no live mutations
- support has the exact stop conditions
- rollback owner, rollback plan, and last-known-good source reference are ready
- QA and release ownership are separate opaque references

## Stop Conditions

The release decision must be `no_go` if:

- the Phase 6 evidence is stale, missing, private, or from the wrong project
- the global stage order exposes the Kingstons manual OTP order
- a Kingstons lead exposes global onboarding as the primary OTP path
- global buyer leads regain OTP generation
- signed OTP upload can bypass signed-by-all-parties or Arch9 terms confirmation
- buyer profile details are missing before Transaction Setup completion
- bond originator or transfer attorney handoffs cannot be traced
- buyer portal instructions require private links in release evidence
- Move to Transaction can bypass the accepted-offer and Transaction Setup gates
- Buyer Process Handoff is missing from the transaction workspace
- converted transaction IDs do not persist against the converted lead
- rollback is not validated
- the decision requires recording private data

No production rollout should be treated as approved by Phase 7 alone. Phase 7 is
the release-decision record for the buyer process global and Kingstons split.
