# Conveyancer Phase D7 — Final-account workflow

## Outcome

D7 converts an approved D5 financial model and a legally reconciled D6 record into balanced buyer and seller final-account packets. Accounts staff no longer need to re-key totals into separate statements, while the responsible conveyancer retains an explicit, independent approval decision.

## Account derivation

The buyer account derives:

- purchase consideration and buyer charges as debits;
- buyer credits as credits;
- reconciled purchase funding and cost collections as credits; and
- reconciled buyer-credit refunds as debits.

The seller account derives:

- purchase consideration and seller credits as credits;
- seller deductions as debits; and
- reconciled base proceeds and seller-credit payments as debits.

Every displayed line carries a D5 consideration/line identity or D6 target identity. Both accounts must close to exactly zero before a packet can be created.

## Presentation contract

The packet is bound to final-account template governance evidence:

- template key and version;
- governed template fingerprint;
- template content hash;
- PDF output format; and
- locale.

D7 produces a renderer-ready account model and SHA-256 content hash. It does not render or store the PDF itself.

## Lifecycle and ownership

The lifecycle is:

1. `pending_review`
2. `approval_recommended`
3. `approved`, `changes_requested` or `rejected`

Accounts staff or the responsible legal lane may prepare and recommend the packet. Final approval must come from the correct legal lane and from a different user than both the preparer and recommender. Negative decisions require a reason, decision reference and summary.

## Integrity and privacy

D7 validates line arithmetic, account totals, zero balances, template evidence, source binding, content hashes, review fingerprints and chronology. Buyer and seller identities are represented by hashes in the workflow contract. Audit events expose only account roles and line counts, never party hashes, account values or line details.

## Side-effect boundary

D7 does not:

- persist the packet;
- render a PDF;
- deliver a final account to a client;
- post to a trust or accounting ledger; or
- update registration or close-out state.

Those actions can consume the approved D7 packet in later phases.

## Assurance

Run:

```bash
npm run test:conveyancer-final-account-d7
```

The suite covers buyer and seller derivation, D5/D6 binding, template evidence, party references, role authority, recommendation and approval, correction and rejection, concurrency, idempotency, content and runtime tampering, audit redaction and the no-side-effect boundary.
