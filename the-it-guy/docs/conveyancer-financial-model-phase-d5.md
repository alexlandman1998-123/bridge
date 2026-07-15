# Conveyancer Phase D5 — Financial model

## Outcome

D5 establishes one versioned financial truth contract for a conveyancing matter. It gives accounts staff and the responsible conveyancer a common view of the purchase consideration, funding, buyer costs, seller deductions, credits and resulting party positions before downstream statements or payments are produced.

The model uses integer minor units throughout. `ZAR 1.00` is stored as `100`, so purchase-price reconciliation, tax splits and party totals do not depend on floating-point arithmetic.

## Contract

Each snapshot is bound to the organisation, transaction, matter-plan version and legal lane. It records:

- the purchase price and tax treatment, sourced from a hashed signed agreement or amendment;
- funding lines for deposits, cash contributions, bond proceeds and guarantees;
- buyer charges, seller deductions and buyer or seller credits;
- the liable party, recipient, amount, confidence status, due date and evidence provenance for every line;
- net/VAT splits where applicable;
- the preparer and an optional independent legal approval; and
- append-only revision ancestry and tamper fingerprints.

Confirmed, received, paid and reversed lines require a source reference, SHA-256 evidence hash and effective date. Adjustments and reversals also require a reason and decision reference.

## Derived positions

The model derives, rather than accepts, the following values:

- committed and secured purchase-price funding;
- funding commitment and security variances;
- total deposit;
- buyer charges, credits and total exposure; and
- seller deductions, credits and net proceeds.

It blocks a funding shortfall, overfunding, a deposit above the purchase price, secured overfunding and negative seller proceeds. Estimates, quotes, unknown tax treatment, unsecured funding and missing legal approval keep the snapshot in review.

## Ownership and approval

Accounts staff, secretaries and the attorney responsible for the lane may capture the position. Only the responsible conveyancer/attorney or firm manager may approve it. The approver must be a different user from the preparer.

This separation lets operational staff maintain the numbers without silently converting their work into an approved legal financial position.

## Revision and audit boundary

Changes are represented by a new snapshot whose revision increments by one and whose `previousFinancialModelId` and `previousFingerprint` bind it to the exact prior snapshot. Matter, organisation, plan, lane and currency bindings cannot change across that revision chain.

D5 is deliberately side-effect free. It does not:

- persist the snapshot;
- initiate or record an actual bank payment;
- post to a trust ledger;
- issue a client statement; or
- update registration readiness.

Those operations can consume the approved D5 contract in later phases without weakening its audit boundary.

## Assurance

Run:

```bash
npm run test:conveyancer-financial-model-d5
```

The suite covers exact money arithmetic, reconciled positions, shortfall and overfunding, evidence provenance, tax splits, estimates, tax treatment, seller proceeds, unique lines, adjustments, lane authority, independent approval, revision ancestry, tamper detection and the no-side-effect boundary.
