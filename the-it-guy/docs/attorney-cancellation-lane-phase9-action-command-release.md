# Cancellation Lane Phase 9 Action Command Release

Phase 9 closes the cancellation command gap that Phase 8 deliberately kept visible.

## Release Decision

The runtime source of truth is `buildCancellationLanePhase9ActionCommandReleaseReport(...)`.

- `go`: every cancellation attorney action has a stage-specific command preset and valid scenarios can proceed to controlled rollout.
- `review`: the selected matter can be inspected, but seller bond status, expired figures, penalty risk, or notice risk must be resolved before signoff.
- `blocked`: a cancellation action lacks a command preset, an executable command cannot be built, or prior coordination/scenario coverage regresses.

The default report returns `ready_for_controlled_rollout`.

## Command Coverage

Phase 9 adds `CANCELLATION_ATTORNEY_STAGE_COMMAND_PRESETS` for the full cancellation attorney lane:

- intake: existing bond, bank, bond account, instruction
- notice and figures: notice period, figures requested, figures received, figures expiry, penalty risk
- guarantees: requested, received, accepted
- documents and signing: cancellation documents prepared, seller signed documents
- lodgement and close-out: lodgement ready, lodged, registered, settlement proof, close-out

These presets are wired through `buildAttorneyWorkflowActionCommand(...)`, so the action buttons produce real work packets, drafts, command types, audiences, due dates, and checklists.

## Non-Linear Workflow Rule

Cancellation work remains concurrent. Figures, penalty-risk notes, guarantees, seller signing, lodgement readiness, and close-out commands are independently executable; the release report does not require previous stages to be completed first.

## Scenario Coverage

The Phase 9 verifier covers:

- cash buyer with seller existing bond returning `go`
- bond buyer with seller existing bond returning `go`
- hybrid buyer with trust seller and existing bond returning `go`
- cash buyer with no seller existing bond returning `go` with cancellation suppressed
- unknown seller bond status remaining `review`
- company seller authority evidence
- trust seller authority evidence
- expired figures and penalty risk remaining `review`

## Controlled Rollout Rule

Phase 9 retires the Phase 8 `go_with_phase3_gap` warning. Valid cancellation matters now return `go`, while unknown seller bond status and figures/notice risk remain `review`.

Cancellation remains seller-bond driven. Buyer finance does not activate or suppress cancellation by itself.

## Verification

Run:

```bash
node scripts/verify-attorney-cancellation-lane-phase9.mjs
```

The verifier fails if any cancellation attorney action lacks a command preset, command-builder output regresses to a generic unusable command, valid scenarios keep the Phase 8 warning, unknown seller bond auto-activates cancellation, or company/trust seller evidence coverage is removed.
