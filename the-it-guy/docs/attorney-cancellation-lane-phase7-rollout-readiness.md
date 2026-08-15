# Cancellation Lane Phase 7 Rollout Readiness

Phase 7 turns the cancellation lane work from Phases 1, 2, 4, 5, and 6 into a release-facing readiness report.

## Decision

`buildCancellationLanePhase7RolloutReadinessReport()` returns `ready_for_phase8`.

The rollout decision is `go_with_phase3_gap`.

That means the cancellation lane is usable for Phase 8 UAT with generic workflow actions, but the Phase 3 command-preset gap is still open and visible.

## Passing Checks

The readiness report proves:

- cancellation journey map has all 19 canonical stages mapped
- transfer trigger action exists for seller existing bond activation
- all 19 cancellation attorney stage actions are covered
- all handoffs are covered by actions
- guarantee coordination works in both directions
- lodgement coordination works in both directions
- scenario coverage is complete
- cancellation work remains non-linear

## Phase 3 Warning

The warning is deliberate:

`phase3_stage_command_gap`

Outstanding command-preset scope:

- figures
- figures expiry
- penalty and notice risk
- guarantees
- seller signing
- lodgement
- registration
- settlement close-out

Do not convert this warning into a silent pass until stage-specific cancellation command presets exist.

## Phase 8 Candidate

Use Phase 8 as the cancellation UAT release gate:

- run the Phase 7 readiness report as a go/warning/hold gate
- walk every cancellation action button in the UI
- confirm generic actions are acceptable for UAT or complete Phase 3 first
- test cash buyer with seller existing bond
- test no seller bond suppression
- test unknown seller bond status review
- test company/trust seller authority evidence
- test guarantee and lodgement coordination from both lanes
- test expired figures or penalty risk before lodgement readiness

## Verification

Run:

```bash
node scripts/verify-attorney-cancellation-lane-phase7.mjs
```
