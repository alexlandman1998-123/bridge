# Bond Lane Phase 7 Scenario Coverage

Phase 7 validates the bond lane across finance routes and buyer/legal structures.

## Scenario Matrix

Covered scenarios:

- Cash individual buyer: bond originator and bond attorney lanes stay inactive.
- Cash married buyer: bond lanes stay inactive, but marital-capacity evidence is still identified.
- Bond married buyer: originator and bond attorney lanes activate with marital evidence.
- Bond multiple buyers: originator and bond attorney lanes activate with co-buyer finance applications.
- Company buyer, trust seller, cancellation: bond and cancellation lanes activate with company authority evidence.
- Hybrid trust buyer, company seller: bond and cancellation lanes activate with trust authority evidence.
- Unknown finance company buyer: finance stays attention state and bond lanes do not activate until finance is confirmed.

## Runtime Rule

The bond attorney is only involved when the finance route requires bond work. Cash deals must not create a bond attorney workflow just because attorney transfer work exists.

## Evidence Rule

The bond lane must be able to inspect buyer capacity evidence because bond originator and transfer attorney requirements differ by structure:

- Individual: identity, address, income, bank statements.
- Married in community: marital status and spouse consent.
- Married out of community: antenuptial contract.
- Multiple buyers: co-buyer finance applications.
- Company: registration, resolution, director IDs, financials.
- Trust: trust deed, letters of authority, trustee IDs, trustee resolution.

## Cancellation Rule

Seller existing bond activates cancellation coordination independently from the buyer bond lane.

## Phase 8 Candidate

Turn Phases 1-7 into a bond attorney rollout readiness report:

- no dead-end buttons
- all bond stages actionable
- scenario coverage complete
- coordination coverage complete
- originator evidence links available
- read-only/mutation boundaries enforced

## Verification

Run:

```bash
node scripts/verify-attorney-bond-lane-phase7.mjs
```
