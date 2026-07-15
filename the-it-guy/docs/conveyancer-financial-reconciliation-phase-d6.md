# Conveyancer Phase D6 — Financial reconciliation

## Outcome

D6 turns an independently approved D5 financial model into a controlled actual-versus-expected reconciliation. It gives accounts staff a precise preparation workflow and gives the responsible conveyancer a compact legal approval decision without allowing either user to alter the underlying financial truth inside the reconciliation.

## Derived reconciliation targets

Targets are projected from the immutable D5 snapshot. Users do not type expected totals into D6. The projection covers:

- deposit, cash, bond and guarantee funding;
- buyer-cost collections;
- buyer-cost disbursements;
- seller deductions;
- buyer and seller credits; and
- base seller proceeds after seller deductions.

Confirmed guarantees and qualifying bond funding are treated as financial instruments. Receipts, payments and other trust-account movements are treated as cash. This prevents a guarantee letter from being mistaken for money already received.

## Evidence and matching

D6 accepts a matter-scoped statement extract, actual entries and explicit value allocations from entries to targets. Every statement and entry carries hashed provenance. The workflow checks:

- opening balance plus cash inflows less cash outflows equals closing balance;
- every expected target is allocated to the cent;
- every actual entry is allocated to the cent;
- allocations point to known entries and targets;
- cash and instrument evidence use the correct source types;
- direction and evidence mode match the target; and
- entry and allocation identities are unique.

There is no variance tolerance. If the commercial truth has changed, D5 must be revised and independently approved; D6 cannot hide the difference with a reconciliation override.

## Lifecycle and ownership

Accounts staff or the lane-authorised legal team can prepare reconciliation evidence. The lifecycle is:

1. `pending_review`
2. `reconciliation_recommended`
3. `reconciled`, `changes_requested` or `rejected`

Recommendation requires all eight controls and no findings. Final approval requires the responsible legal lane and a different user from both the starter and recommender. Correction and rejection require a reason, summary and decision reference.

## Integrity and audit

The immutable evidence binding and mutable review state have separate fingerprints. Validation independently re-runs matching and statement arithmetic, then compares the stored target results, entry results, variances, checks and findings to the derived result.

Audit events expose matter identity, status, actors, controls and decision timing. They do not expose account hashes, transaction-reference hashes or financial evidence details.

## Side-effect boundary

D6 does not:

- persist reconciliation records;
- initiate or record an actual payment;
- post to a trust ledger;
- issue a client statement; or
- update registration readiness.

Those operations remain downstream consumers of a reconciled D6 record.

## Assurance

Run:

```bash
npm run test:conveyancer-financial-reconciliation-d6
```

The suite covers source-model readiness, statement arithmetic, funding, buyer costs, seller positions, unknown and partial allocations, direction and mode, evidence provenance, role separation, correction and rejection, concurrency, idempotency, tamper detection, redacted audit output and the no-side-effect boundary.
