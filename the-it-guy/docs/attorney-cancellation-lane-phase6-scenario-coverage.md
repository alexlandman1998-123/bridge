# Cancellation Lane Phase 6 Scenario Coverage

Phase 6 validates cancellation activation and evidence coverage across finance routes, seller structures, and risk states.

## Scenario Matrix

Covered scenarios:

- Cash buyer, individual seller with existing bond: cancellation activates even though buyer finance is cash.
- Bond buyer, individual seller with existing bond: cancellation activates independently from the buyer bond lane.
- Hybrid buyer, trust seller with existing bond: cancellation activates with trust authority evidence.
- Cash buyer, no seller existing bond: cancellation stays inactive.
- Unknown seller bond status: cancellation stays in review until the seller bond position is confirmed.
- Company seller with existing bond: cancellation activates with company authority evidence.
- Trust seller with existing bond: cancellation activates with trust authority evidence.
- Expired figures and penalty risk: cancellation remains active but carries attention before lodgement readiness.

## Runtime Rule

Cancellation is seller-bond driven. Buyer finance does not control cancellation activation.

That means:

- cash buyer plus seller existing bond activates cancellation
- bond or hybrid buyer without seller existing bond does not activate cancellation
- unknown seller bond status is review, not automatic activation

## Evidence Rule

The cancellation lane must inspect seller capacity and bank-cancellation evidence:

- Individual seller: identity and seller cancellation document signature where required.
- Company seller: registration, resolution, director IDs, and signatory authority.
- Trust seller: trust deed, letters of authority, trustee IDs, and trustee resolution.
- Cancellation matter: existing bond confirmation, bank, account number, instruction, figures, figures expiry, guarantees, and lodgement pack.
- Risk state: stale figures, penalty risk, or notice risk must remain visible before lodgement readiness.

## Phase 7 Candidate

Turn Phases 1, 2, 4, 5, and 6 into a cancellation rollout readiness report:

- all cancellation action buttons are present
- guarantee coordination is covered
- lodgement coordination is covered
- scenario coverage is complete
- cancellation stays non-linear
- Phase 3 command presets are still marked as outstanding, not silently assumed complete

## Verification

Run:

```bash
node scripts/verify-attorney-cancellation-lane-phase6.mjs
```
