# Bond attorney module - Phase 5 bank-condition register

Phase 5 closes the Phase 0 blocker `bank_conditions_not_structured`. It turns the verified `bank_conditions` canonical fact into a typed, owned and evidence-backed condition register.

The executable source is `src/core/transactions/bondAttorneyModulePhase5.js`.

## What changed

- Added a bank-condition register that normalizes lender conditions into structured rows.
- Each condition now has:
  - condition type
  - owner role
  - due date
  - condition status
  - bank-blocking flag
  - blocker state
  - evidence requirements
  - evidence links and review status
  - next action
- Added a schedule model that can feed the Phase 4 bank-condition schedule document without reinterpreting raw condition text.
- Added metrics for:
  - structured condition count
  - open condition count
  - open bank-blocking condition count
  - overdue open condition count
  - evidence-gap count
  - missing owner count
  - missing due-date count
- Added redacted audit metadata for the condition-register build. The audit event includes fingerprints and counts, not condition text, fact values or document body content.

## Condition states

Phase 5 supports these condition statuses:

- `open`
- `in_progress`
- `evidence_provided`
- `satisfied`
- `rejected`
- `waived`

The register separately computes blocker state:

- `resolved`
- `blocking`
- `attention`
- `monitor`

That separation matters: a condition can be structurally valid but still block the matter because evidence is missing or the bank still requires satisfaction.

## Controls

Phase 5 enforces these controls in code:

- The canonical `bank_conditions` fact must be verified.
- Every condition must have a typed owner.
- Every condition must have a due date.
- Every condition must have an evidence contract.
- A satisfied condition cannot be treated as resolved unless its required evidence is satisfied.
- A waived condition requires a waiver reason.
- Open bank-blocking conditions prevent Phase 6 readiness.
- Missing evidence, rejected evidence and overdue conditions surface as next actions.

## Phase 5 boundary

This phase intentionally does not:

- generate bank approval
- submit anything to a bank portal
- approve or alter bank wording
- generate legal instruments
- create signing packets
- alter Deeds Office or registration evidence

It is a structured operational tracker and readiness gate only.

## Why this helps the bond attorney

The bond team can now see exactly why the matter is or is not ready:

- who owns each bank condition
- what evidence is needed
- whether that evidence has been supplied or approved
- which dates are overdue or approaching
- which conditions block the next phase

That gives the conveyancer/secretary a concrete work queue instead of a vague “bank conditions outstanding” note.

## Acceptance check

Run:

```bash
npm run test:bond-attorney-module-phase5
```

Phase 5 is complete when Phases 0-4 still pass, verified bank conditions become structured rows, malformed conditions are rejected, open bank blockers produce next actions, audit metadata stays redacted, and only fully satisfied/waived evidence-backed conditions unlock Phase 6 readiness.
