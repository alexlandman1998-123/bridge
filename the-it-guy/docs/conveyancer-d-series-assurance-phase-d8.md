# Conveyancer Phase D8 — D-series assurance

## Outcome

D8 is the independent, read-only release gate over the complete D1–D7 conveyancer chain. It verifies that signing capacity, signing plans, appointments, signed-pack review, the financial model, reconciliation and final accounts remain individually valid and exactly connected before a guarded pilot can proceed.

The result is one of:

- `ready`: every contract, binding and event chain is valid and each matter workflow has reached its expected release state;
- `observe`: platform integrity is intact, but a valid matter-level workflow is incomplete or has ended in an exception state; or
- `blocked`: a contract, binding, authority, audit continuity or side-effect boundary has failed.

## Assurance boundary

D8 validates:

- D1 capacity and D2 signing-plan contracts using their recorded assessment timestamps;
- D3 appointment and D4 signed-pack contracts, their exact D2 fingerprints and complete event histories;
- D5 financial-model integrity;
- D6 reconciliation and D7 final-account contracts, with exact D5 and D6 revision/fingerprint binding;
- contiguous revisions, command and event uniqueness, before/after snapshot continuity and final snapshot agreement;
- event actor capability and lane authority, including operational roles only where the underlying phase permits them; and
- the no-side-effect flags across appointment, review, reconciliation and final-account evidence.

Missing phase evidence fails closed. Matter states such as an appointment awaiting confirmation remain visible as observations rather than being misclassified as platform corruption.

## Guarded pilot

Pilot thresholds cannot be loosened by callers. Any contract failure, audit gap, binding failure or side-effect attempt holds the pilot. A bounded matter-exception rate creates an observation band before the hard hold threshold.

The manifest limits a pilot to:

- at most three firms;
- explicitly selected transfer, bond or cancellation lanes;
- between one and 25 matters;
- a fixed start and end window; and
- named assurance, legal, financial, support and rollback owners.

Human approval remains mandatory. Database writes, notifications, payments, delivery and registration updates are disabled by the D8 manifest.

## Evidence and privacy

The serialized evidence packet contains decisions, counts, finding codes, evidence identifiers, pilot metrics and controls. It deliberately excludes money values, bank-account hashes, party hashes, document payloads and signing evidence.

## Assurance

Run:

```bash
npm run test:conveyancer-d-series-assurance-d8
```

The suite covers a clean end-to-end D1–D7 chain, valid observed state, record tampering, exact-binding failure, audit gaps, forged event authority, side-effect attempts, fail-closed thresholds, pilot limits and evidence redaction.

## Database boundary

D8 adds no database schema and requires no migration. It consumes immutable contracts and event evidence supplied by the application layer. Persisting assurance reports or enabling pilot side effects is explicitly outside this phase.
