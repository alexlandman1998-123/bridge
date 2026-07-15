# Cancellation attorney module - Phase 5 cancellation figures register

Phase 5 closes the fifth Phase 0 blocker: `cancellation_figures_register_missing`.

It turns verified cancellation figures into a structured, evidence-backed register with expiry, daily-interest, penalty-risk and guarantee-variance checks. It does not request figures from a lender, issue figures, accept guarantees, reconcile settlement, execute payment or mutate the matter.

The executable source is `src/core/transactions/cancellationAttorneyModulePhase5.js`.

## What changed

- Added a cancellation figures register that normalizes verified figures into structured rows.
- Each figure set now has:
  - lender and bond account reference
  - source reference
  - amount
  - expiry date
  - daily-interest amount
  - settlement date check
  - projected settlement amount
  - penalty or notice-risk state
  - guarantee required amount
  - guarantee variance state
  - validity state
  - blockers
  - next action
- Added a schedule model that can feed Phase 4 operational summaries without reinterpreting raw figures evidence.
- Added metrics for:
  - ready figure count
  - blocked figure count
  - expiry-risk count
  - settlement-after-expiry count
  - high penalty-risk count
  - guarantee variance count
  - missing amount, expiry and daily-interest counts
- Added redacted audit metadata for the register build. The audit event includes fingerprints and counts, not figures values, fact values or document body content.

## Figure states

Phase 5 supports these figure statuses:

- `requested`
- `received`
- `verified`
- `expired`
- `disputed`
- `superseded`

The register separately computes expiry state:

- `missing`
- `invalid`
- `expired`
- `expires_today`
- `expiring_soon`
- `valid`

And validity state:

- `ready`
- `attention`
- `blocked`

That separation matters. A figure set can be verified but still blocked because it expires before settlement, has unresolved penalty risk, or does not line up with the guarantee amount.

## Controls

Phase 5 enforces these controls in code:

- Canonical Phase 2 figure facts must be verified:
  - cancellation figures amount
  - cancellation figures expiry date
  - daily-interest amount
  - penalty or notice risk
- Every figure set must have an amount.
- Every figure set must have an expiry date.
- Every figure set must have daily interest.
- Settlement date is checked against figures expiry.
- Penalty or notice risk is surfaced as a next action.
- Guarantee amount is compared against the figures amount.
- Expired or settlement-invalid figures prevent Phase 6 readiness.
- Under-guaranteed figures prevent Phase 6 readiness.
- Missing, rejected or unresolved risk states surface as next actions.

## Phase 5 boundary

This phase intentionally does not:

- request external figures automatically
- issue cancellation figures
- alter lender figures
- accept guarantees automatically
- reconcile settlement
- execute settlement payment
- write to external systems
- mutate the matter
- generate legal instruments

It is a structured operational tracker and readiness gate only.

## Why this helps the cancellation attorney

The cancellation team can now see exactly why the matter is or is not ready for guarantee coordination:

- whether the current figures are verified
- when the figures expire
- whether the expected settlement date falls after expiry
- how daily interest affects the projected amount
- whether penalty or notice risk still needs review
- whether the guarantee amount is below the figures amount

That gives the conveyancer and secretary a concrete work queue instead of a vague “figures outstanding” or “figures expiring” note.

## Acceptance check

Run:

```bash
npm run test:cancellation-attorney-module-phase5
```

Phase 5 is complete when Phases 0-4 still pass, verified cancellation figures become structured rows, malformed figures are rejected, expiry/settlement/penalty/guarantee blockers produce next actions, audit metadata stays redacted, and only ready figures unlock Phase 6 readiness.
