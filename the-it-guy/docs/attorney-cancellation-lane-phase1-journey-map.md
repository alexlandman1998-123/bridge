# Cancellation Lane Phase 1 Journey Map

Phase 1 establishes cancellation attorney context only. It does not change action buttons, persistence, or workflow behavior.

## Activation Rule

The cancellation attorney lane only activates when the seller has an existing bond or cancellation is explicitly required.

The trigger is:

`transfer_attorney.existing_bond_confirmed` -> `cancellation_attorney.cancellation_existing_bond_confirmed`

A cash buyer can still require cancellation when the seller has an existing bond. Buyer bond finance is not required for the cancellation lane to exist.

## Cancellation Attorney Journey

1. **Instruction and Existing Bond Intake**
   Seller existing bond, cancellation bank, account number, and formal cancellation instruction are captured.

2. **Notice, Figures, and Bank Risk**
   90-day notice status, cancellation figures, expiry, and penalty or notice risk are captured.

3. **Cancellation Guarantees**
   Guarantees are requested, received, checked against cancellation figures, and accepted.

4. **Cancellation Documents and Seller Signing**
   Cancellation documents are prepared and seller signature requirements are completed where required.

5. **Lodgement, Registration, Settlement, Close-Out**
   Cancellation is made ready for simultaneous lodgement, lodged, registered, settled, and closed out.

## Required Handoffs

- **Transfer to cancellation attorney:** seller existing bond confirmation, bank, and account/reference evidence.
- **Cancellation to transfer guarantee alignment:** cancellation figures, figures expiry, guarantee letter, and guarantee acceptance.
- **Cancellation to lodgement coordination:** cancellation lodgement pack, valid figures, and simultaneous lodgement confirmation.
- **Cancellation registration close-out:** registration confirmation, settlement payment reference, and bank close-out confirmation.

## Phase 2 Gaps To Inspect

- Whether every cancellation stage has an action button or command-backed status update.
- Whether figures expiry and penalty risk can be captured without forcing unrelated stages complete.
- Whether guarantees requested/received/accepted are coordinated with transfer and bond where applicable.
- Whether cancellation lodgement readiness can move concurrently with transfer and bond lodgement readiness.
- Whether cash transactions with seller existing bond activate cancellation while still suppressing buyer bond lanes.

## Verification

Run:

```bash
node scripts/verify-attorney-cancellation-lane-phase1.mjs
```
