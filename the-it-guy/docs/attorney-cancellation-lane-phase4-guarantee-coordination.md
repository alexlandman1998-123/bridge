# Cancellation Lane Phase 4 Guarantee Coordination

Phase 4 wires cancellation guarantee coordination between transfer and cancellation.

Phase 3 stage-specific command presets are still outstanding. This phase uses the Phase 2 generic workflow actions plus shared coordination command presets so the cross-lane guarantee handoff is already actionable.

## Coordination Pairs

1. **Transfer requests cancellation acceptance**

   `transfer.transfer_guarantees_accepted` waits on `cancellation.cancellation_guarantees_accepted`.

   Runtime command: `Request Cancellation Acceptance`

2. **Cancellation requests transfer alignment**

   `cancellation.cancellation_guarantees_accepted` waits on `transfer.transfer_guarantees_accepted`.

   Runtime command: `Request Transfer Alignment`

## Required Evidence

The coordination note must keep the important cancellation context visible:

- cancellation figures
- figures expiry date
- guarantee letter
- guarantee value and bank acceptance
- settlement shortfall or penalty risk
- wording correction or lodgement timing risk

## Workflow Rule

This must not become sticky. Transfer can ask for cancellation guarantee acceptance before all transfer-side lodgement steps are complete, and cancellation can ask for transfer alignment before accepting cancellation guarantees.

## Phase 5 Candidate

Phase 5 should handle simultaneous lodgement coordination:

- transfer requesting cancellation lodgement readiness
- cancellation requesting transfer lodgement readiness
- valid figures at lodgement
- cancellation pack readiness
- target lodgement date or blocker

## Verification

Run:

```bash
node scripts/verify-attorney-cancellation-lane-phase4.mjs
```
