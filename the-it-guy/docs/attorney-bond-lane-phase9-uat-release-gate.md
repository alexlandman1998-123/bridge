# Bond Lane Phase 9 UAT And Release Gate

Phase 9 closes the bond attorney rollout proof. It does not add new bond stages; it converts the Phase 8 readiness report into a UAT pack and controlled-release gate.

## Release Decision

The runtime source of truth is `buildBondLanePhase9UatReleaseGateReport(...)`.

- `go`: Phase 8 readiness is clean, UAT checklist is complete, no scenario is blocked, and any built-in review state is expected.
- `review`: the selected matter can be tested, but captured facts need review before bond lanes activate.
- `blocked`: Phase 8 readiness failed or a scenario has missing actions, evidence links, coordination, or capacity requirements.

Unknown finance must stay `review`; it must not automatically activate the bond originator or bond attorney lane.

## UAT Walkthrough

The runtime UAT pack is `buildBondLanePhase9UatReleaseGateReport(...).uatChecklist`.

Required walkthrough:

1. Confirm the finance route activates or suppresses bond lanes correctly.
2. Open bond originator evidence from the attorney workspace and confirm it is read-only.
3. Open and action the bank instruction stages.
4. Resolve bank conditions out of sequence.
5. Prepare, sign, and submit bond documents.
6. Coordinate guarantees with transfer.
7. Coordinate simultaneous lodgement readiness.
8. Register and close out the bond file.
9. Run legal structure and cancellation scenarios.

## Scenario Coverage

The Phase 9 verifier covers:

- cash individual buyer
- cash married buyer
- bond married buyer
- bond multiple buyers
- company buyer with trust seller and cancellation
- hybrid trust buyer with company seller and cancellation
- unknown finance company buyer remaining in `review`, not `go`

## Controlled Rollout Rule

Cash matters are a valid `go` when bond lanes are suppressed. Bond and hybrid matters are a valid `go` when originator evidence, attorney actions, guarantees, lodgement, and capacity evidence are all available. A selected matter with unknown finance returns `review_required` until finance is confirmed.

## Verification

Run:

```bash
node scripts/verify-attorney-bond-lane-phase9.mjs
```

The verifier fails if the UAT checklist is incomplete, action-button proof regresses, unknown finance starts activating bond lanes, or company/trust/married/cancellation coverage is removed.
