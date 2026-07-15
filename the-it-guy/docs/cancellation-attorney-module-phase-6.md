# Cancellation attorney module - Phase 6 guarantee coordination workspace

Phase 6 closes the sixth Phase 0 blocker: `guarantee_coordination_workspace_missing`.

It creates a controlled cancellation guarantee workspace on top of the Phase 5 figures register. It checks guarantee amount, beneficiary, wording, expiry, evidence and cancellation-attorney acceptance against the verified cancellation figures. It does not issue guarantees, accept guarantees automatically, route documents externally, submit to a lender, reconcile settlement or mutate the matter.

The executable source is `src/core/transactions/cancellationAttorneyModulePhase6.js`.

## What changed

- Added a guarantee workspace for the cancellation attorney lane.
- Added guarantee rows with:
  - guarantee reference
  - instrument type
  - owner role
  - amount
  - required amount
  - variance state
  - beneficiary and wording match
  - acceptance status
  - expiry check against figures
  - evidence contract
  - match state
  - blockers
  - next action
- Added a figures gate, requiring the Phase 5 figures register to be ready before guarantee acceptance can unlock the next phase.
- Added an evidence contract for:
  - guarantee document evidence
  - wording review evidence
  - cancellation attorney acceptance decision
- Added metrics for:
  - matched guarantees
  - blocked guarantees
  - evidence gaps
  - rejected evidence
  - amount mismatches
  - under-guaranteed items
  - wording mismatches
  - acceptance pending items
  - expiry risks
- Added a schedule model that can feed operational guarantee summaries without exposing document bodies.
- Added redacted audit metadata. Audit events include fingerprints and counts, not guarantee payloads, fact values, evidence bodies or document content.

## Guarantee states

Phase 6 supports these guarantee statuses:

- `requested`
- `received`
- `under_review`
- `accepted`
- `variance`
- `rejected`
- `superseded`

The workspace separately computes match state:

- `matched`
- `attention`
- `blocked`

That separation matters. A guarantee can be received but still blocked because the amount is short, the wording differs, the evidence is incomplete, the expiry is unsafe, or the cancellation attorney has not recorded an acceptance decision.

## Controls

Phase 6 enforces these controls in code:

- Phase 5 figures must be ready.
- Canonical Phase 2 guarantee facts must be verified:
  - guarantee required amount
  - guarantee beneficiary and wording
  - guarantee reference
  - guarantee acceptance status
- Guarantee amount must match the required amount.
- Beneficiary and wording must match the cancellation requirement.
- Guarantee evidence must be verified.
- The cancellation attorney acceptance decision must be verified.
- Guarantees expiring before the figures period are blocked.
- Under-guaranteed or mismatched guarantees produce next actions.

## Phase 6 boundary

This phase intentionally does not:

- issue a guarantee
- accept a guarantee automatically
- route guarantee documents externally
- submit anything to a lender or bank portal
- generate legal instruments
- reconcile settlement
- execute settlement payment
- write to external systems
- mutate the matter

It is a structured guarantee coordination and readiness workspace only.

## Why this helps the cancellation attorney

The cancellation team can now answer the practical question: “Can I accept this guarantee for cancellation?” without mentally stitching together figures, wording, beneficiary details, guarantee documents and transfer/bond handoffs.

The workspace shows:

- whether the figures gate is clear
- whether the guarantee amount covers the cancellation figures
- whether the beneficiary and wording match
- whether evidence has been verified
- whether the guarantee remains valid long enough
- whether the cancellation attorney acceptance decision is recorded

That gives the conveyancer and secretary a concrete work queue before bank-controlled cancellation documents and signing controls begin in Phase 7.

## Acceptance check

Run:

```bash
npm run test:cancellation-attorney-module-phase6
```

Phase 6 is complete when Phases 0-5 still pass, ready figures gate guarantee acceptance, guarantee mismatches produce next actions, evidence gaps remain visible, audit metadata stays redacted, automatic acceptance remains blocked, and only a matched/evidenced/accepted guarantee unlocks Phase 7 readiness.
