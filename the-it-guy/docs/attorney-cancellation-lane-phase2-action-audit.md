# Cancellation Lane Phase 2 Action Audit

Phase 2 checks whether the cancellation lane is actually workable, not just visible.

## Audit Result

`buildCancellationLanePhase2ActionAudit()` returns `ready_for_phase3`.

Covered surface:

- 1 transfer trigger action
- 19 cancellation attorney actions
- 4 action surfaces
- 4 handoffs covered by at least one action

## Transfer Trigger

The lane starts from the transfer attorney action:

`transfer_confirm_existing_bond_for_cancellation`

This protects the activation rule from Phase 1: seller existing bond or explicit cancellation requirement starts the cancellation lane. Buyer bond finance is not required.

## Cancellation Attorney Actions

Every canonical cancellation stage has an action:

- existing bond confirmation
- cancellation bank capture
- bond account capture
- instruction confirmation
- notice status capture
- figures request
- figures received
- figures expiry capture
- penalty or notice risk capture
- guarantees requested
- guarantees received
- guarantees accepted
- cancellation documents prepared
- seller cancellation documents signed
- lodgement ready
- lodged
- registered
- settlement proof captured
- close-out complete

## Handoff Coverage

The action audit covers:

- transfer to cancellation attorney activation
- cancellation to transfer guarantee alignment
- cancellation to lodgement coordination
- registration and settlement close-out

## Phase 3 Candidate

Add stage-specific cancellation command presets:

- figures request and figures received
- figures expiry and stale-figures risk
- penalty or notice risk
- guarantee request, receipt, and acceptance
- seller cancellation document signing
- lodgement readiness and simultaneous lodgement
- registration, settlement proof, and bank close-out

The workflow must stay non-linear. Figures, notice risk, guarantees, documents, and lodgement preparation can overlap in real files.

## Verification

Run:

```bash
node scripts/verify-attorney-cancellation-lane-phase2.mjs
```
