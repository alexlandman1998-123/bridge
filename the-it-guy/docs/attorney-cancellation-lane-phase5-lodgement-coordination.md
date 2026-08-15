# Cancellation Lane Phase 5 Lodgement Coordination

Phase 5 wires simultaneous lodgement coordination between transfer and cancellation.

Phase 3 stage-specific command presets are still outstanding. This phase uses Phase 2 generic workflow actions plus shared coordination command presets so lodgement readiness is already actionable.

## Coordination Pairs

1. **Transfer requests cancellation readiness**

   `transfer.lodgement_ready` waits on `cancellation.cancellation_lodgement_ready`.

   Runtime command: `Request Cancellation Readiness`

2. **Cancellation requests transfer readiness**

   `cancellation.cancellation_lodgement_ready` waits on `transfer.lodgement_ready`.

   Runtime command: `Request Transfer Readiness`

## Required Evidence

The coordination note must keep the cancellation lodgement context visible:

- valid cancellation figures for the target lodgement date
- accepted cancellation guarantees
- cancellation documents or bank consent pack ready
- seller signing status where required
- unresolved bank, figures-expiry, or signing blockers
- target lodgement date or remaining blocker

## Workflow Rule

This stays non-linear. Transfer can request cancellation readiness before all transfer-side lodgement steps are complete, and cancellation can request transfer readiness before marking cancellation lodged.

## Phase 6 Candidate

Phase 6 should validate scenario coverage:

- cash buyer with seller existing bond
- bond buyer with seller existing bond
- hybrid buyer with seller existing bond
- seller without existing bond suppressing cancellation
- unknown seller bond status remaining in review
- company or trust sellers requiring authority evidence
- figures expiry or penalty risk requiring attention

## Verification

Run:

```bash
node scripts/verify-attorney-cancellation-lane-phase5.mjs
```
