# Conveyancer Phase E4 — Guarantee workspace

## Outcome

E4 gives the verified transfer, bond and cancellation firms one read-only professional workspace for guarantee requirements, instruments, allocations, wording, expiry and E1 coordination decisions.

It keeps the ownership established in E1–E3:

- the bond attorney issues and replaces bank guarantees;
- the transfer attorney reconciles amounts, controls wording and routes cancellation guarantees;
- the cancellation attorney supplies current figures and decides whether the routed guarantee satisfies the existing lender; and
- none of the three firms can mutate another firm's work through this projection.

## Reconciliation model

Every current requirement records an exact ZAR amount, beneficiary hash, wording hash, authoritative source reference and evidence hash. Every current instrument records an issuer lane and firm, exact amount, beneficiary and wording hashes, immutable document reference and hash, issue date and expiry date.

Transfer-owned allocations join instruments to requirements. E4 detects:

- under- and over-allocation;
- allocation beyond an instrument's face value;
- wording or beneficiary mismatches;
- expired instruments and instruments expiring before expected lodgement;
- missing guarantee, cancellation-figures or routed-document evidence;
- pending or blocked E1 decisions; and
- invalid replacement lineage.

Only current requirements and instruments participate in readiness. Superseded records remain acceptable lineage inputs, but allocations to a superseded or withdrawn item are rejected.

## Funding paths

E4 supports:

- a bank guarantee issued by the E2-bound bond firm;
- a transfer-firm cash undertaking where no bond attorney is appointed;
- a bond-only purchase-price guarantee;
- cancellation-only cash funding; and
- hybrid matters with separate purchase-price and cancellation beneficiaries.

A cash transaction with no cancellation requirement returns a frozen `not_applicable` workspace rather than manufacturing guarantee work.

## Evidence and decisions

The workspace binds bank-guarantee document references to `bond_guarantee_issued`, cancellation requirements to `cancellation_figures`, and routed cancellation documents to `cancellation_guarantee_provided`. Readiness also requires all applicable E1 guarantee coordination records to be accepted, including the transfer wording and cancellation acceptance decisions.

The projection exposes hashes and reference IDs, not document bodies, bank account details or beneficiary identity values.

## Access and responsibility

E4 reuses E3's exact matter-professional access boundary. A viewer must belong to a required E2 lane and its bound firm. Clients, outsiders and professionals from another firm receive no workspace payload.

Issues carry an owning lane, and `viewerResponsibilities` provides a lane-relative view of outstanding work. These are explanatory prompts only. E4 exposes no commands and does not bypass E1 authority.

## Integrity and side-effect boundary

E4 validates the E2 model, exact E1 definition bindings, record uniqueness, money precision, issuer-firm authority, provenance dates, evidence links and a fingerprint over the complete viewer-specific projection.

E4 does not persist data, issue or replace guarantees, accept wording, route documents, send notifications, mutate evidence or advance a workflow.

## Verification

Run:

```bash
npm run test:conveyancer-coordination-e4
```

The suite covers cash, bond and hybrid matters, exact reconciliation, all three professional viewers, replacement lineage, short allocation, wording and expiry failures, wrong-firm issuance, orphan allocations, future evidence, access denial, tampering and the side-effect boundary.

## Database boundary

E4 requires no migration. It is an in-memory projection contract over E1 and E2 plus supplied guarantee records. Durable storage and live command/UI wiring remain later-phase work.
