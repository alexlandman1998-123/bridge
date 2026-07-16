# Conveyancer trust-money controls — G5

G5 adds the professional-authority and evidence controls around trust receipts and payments. It binds D5 expected financial truth, G3 evidence, G4 client-risk approval, D6 reconciliation, D7 final accounts and F3 trust-ledger evidence without initiating a bank movement or mutating an accounting ledger.

## Delivered

- Versioned firm trust-control policies.
- Responsible-practitioner Fidelity Fund Certificate evidence and expiry control.
- Verified trust-account evidence and matter-to-account linkage.
- Exact expected receipt and payment instructions derived from D5 lines.
- Independently reviewed beneficiary and account verification.
- Changed-bank-detail evidence, independent approval and cooling periods.
- Payment requisitions with approved client risk and supporting-document requirements.
- Controlled third-party-payment and unidentified-receipt exceptions.
- Accounts and legal dual approval separated from the requester.
- Time-bounded payment-release recommendations.
- Paid, failed and reversed outcome records backed by accepted G3 evidence.
- Exact trust-ledger reconciliation, unidentified-entry detection and independent legal review.
- Trust-to-D6/D7 zero-balance close-out reconciliation.
- Common G1 audit events and G2 restricted financial classification.

## Permanent safety boundary

G5 never:

- initiates or releases a bank payment;
- creates a bank command;
- changes beneficiary banking details;
- posts to or mutates the trust ledger;
- changes D5, D6, D7 or registration state; or
- treats a release recommendation as proof that money moved.

A payment outcome exists only after accepted manual or integrated G3 evidence is captured. F3 or equivalent ledger evidence must still reconcile that outcome to the matter trust account.

## Approval and exception boundary

Every release recommendation requires a distinct accounts approver and responsible legal approver, neither of whom may be the requester. Changed bank details remain held until independently verified, approved and outside the configured cooling period.

Third-party payments and unidentified receipts do not disappear into a general override. They require a specifically scoped decision approved independently by compliance and the responsible legal role, and remain visible in reconciliation.

## Productisation boundary

G5 is an executable domain contract. It does not persist records, connect to a bank or accounting provider, install RLS, expose trust account numbers to the UI or dispatch payment/posting commands.

Run G1–G5 together:

```sh
npm run test:conveyancer-practice-g5
```

G5 adds no database migration.
