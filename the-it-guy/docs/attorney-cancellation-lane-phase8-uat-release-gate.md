# Cancellation Lane Phase 8 UAT Release Gate

Phase 8 converts cancellation rollout readiness into a UAT release gate.

## Release Decision

The runtime source of truth is `buildCancellationLanePhase8UatReleaseGateReport(...)`.

- `go_with_phase3_gap`: UAT can proceed, but stage-specific cancellation command presets are still outstanding.
- `review`: the selected matter can be inspected, but seller bond status, figures expiry, penalty risk, or notice risk must be resolved before signoff.
- `blocked`: required wiring, actions, coordination, or scenario coverage is missing.

The default report returns `ready_for_controlled_uat_with_warning`.

## UAT Walkthrough

The runtime UAT pack is `buildCancellationLanePhase8UatReleaseGateReport(...).uatChecklist`.

Required walkthrough:

1. Confirm seller bond activation.
2. Confirm cancellation suppression where there is no seller existing bond.
3. Open and action cancellation intake.
4. Capture figures and notice risk.
5. Coordinate cancellation guarantees.
6. Prepare and sign cancellation documents.
7. Coordinate simultaneous lodgement.
8. Register, settle, and close out.
9. Confirm the Phase 3 command-preset decision.

## Scenario Coverage

The Phase 8 verifier covers:

- cash buyer with seller existing bond
- bond buyer with seller existing bond
- hybrid buyer with trust seller and existing bond
- cash buyer with no seller existing bond
- unknown seller bond status remaining in `review`
- company seller authority evidence
- trust seller authority evidence
- expired figures and penalty risk remaining in `review`

## Controlled UAT Rule

Cancellation is seller-bond driven. Buyer finance does not activate or suppress cancellation by itself.

The Phase 3 command-preset gap remains a warning until figures, expiry, penalty risk, guarantees, seller signing, lodgement, registration, settlement, and close-out have stage-specific command presets.

## Verification

Run:

```bash
node scripts/verify-attorney-cancellation-lane-phase8.mjs
```

The verifier fails if the UAT checklist is incomplete, unknown seller bond status starts auto-activating cancellation, no-seller-bond matters activate cancellation, or the Phase 3 warning disappears silently.
