# Bond Lane Phase 5 Lodgement Coordination

Phase 5 formalizes simultaneous lodgement readiness between the bond attorney and transfer attorney.

## Coordination Pair

The lodgement handoff has two linked sides:

- Transfer attorney depends on `bond.bond_lodgement_ready`.
- Bond attorney depends on `transfer.lodgement_ready`.

This means:

- The transfer attorney can request bond readiness before confirming simultaneous lodgement.
- The bond attorney can request transfer readiness before marking the bond lodged.
- Each lane can action its own readiness independently, without forcing the other lane through unrelated stages.

## Runtime Behavior

The existing coordination panel remains the surface. Phase 5 improves the generated lodgement commands:

- `bond_bond_lodgement_ready` now opens **Request Bond Readiness**.
- `transfer_transfer_lodgement_ready` now opens **Request Transfer Readiness**.
- Both commands use `professional_shared` visibility and retain `sourceCoordinationId` metadata.
- Both commands persist through existing workflow note handling.

## Boundaries

- Phase 5 does not introduce a new persistence endpoint.
- Phase 5 does not automatically mark transfer lodgement ready when bond readiness is confirmed.
- Phase 5 does not automatically lodge the bond when transfer readiness is pending.

## Phase 6 Candidate

Use the same paired model for registration confirmation:

- Transfer depends on `bond.bond_registered`.
- Bond depends on transfer registration confirmation.
- The originator remains a read-only observer after attorney instruction unless a bank or grant correction is requested.

## Verification

Run:

```bash
node scripts/verify-attorney-bond-lane-phase5.mjs
```
