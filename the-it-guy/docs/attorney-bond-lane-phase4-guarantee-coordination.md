# Bond Lane Phase 4 Guarantee Coordination

Phase 4 formalizes the guarantee exchange between the bond attorney and transfer attorney.

## Coordination Pair

The exchange has two linked sides:

- Transfer attorney depends on `bond.guarantees_issued`.
- Bond attorney depends on `transfer.transfer_guarantees_accepted`.

This means:

- The transfer attorney can request issued guarantees from the bond attorney.
- The transfer attorney can receive, check, and accept guarantee wording and values.
- The bond attorney can request transfer acceptance or correction before marking `guarantee_wording_accepted`.
- Neither lane is forced through unrelated stages before the guarantee handoff can be updated.

## Runtime Behavior

The existing coordination panel remains the surface. Phase 4 improves the generated coordination commands:

- `bond_bond_guarantees_issued` now opens **Request Bond Guarantees**.
- `transfer_transfer_guarantee_acceptance` now opens **Request Wording Acceptance**.
- Both commands use `professional_shared` visibility and retain `sourceCoordinationId` metadata.
- Both commands persist through existing workflow note handling.

## Boundaries

- Phase 4 does not introduce a new persistence endpoint.
- Phase 4 does not auto-complete transfer acceptance when bond guarantees are issued.
- Phase 4 does not auto-complete bond wording acceptance when transfer acceptance is pending.

## Next Phase

Phase 5 extends the same paired model to simultaneous lodgement readiness:

- Transfer depends on `bond.bond_lodgement_ready`.
- Bond depends on `transfer.lodgement_ready`.
- Both need to support simultaneous lodgement without sticky sequencing.

## Verification

Run:

```bash
node scripts/verify-attorney-bond-lane-phase4.mjs
```
