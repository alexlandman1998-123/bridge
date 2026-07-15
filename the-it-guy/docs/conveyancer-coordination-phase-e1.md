# Conveyancer Phase E1 — Coordination contract

## Outcome

E1 defines the canonical matter-level contract for a deliverable that must pass between the transfer, bond, cancellation or external lanes. It complements the existing legal-role appointment contract: appointment authority still belongs to the seller or relevant bank, while E1 begins only once known role players need to coordinate work.

The transfer attorney can lead the transaction by requesting and reviewing bond or cancellation deliverables. That does not give the transfer team authority to appoint the bank's attorney, perform work in the other lane or mark that lane's work complete.

## Authority boundary

Every coordination record has a distinct source and target lane:

- the source lane creates, requests, reviews, accepts or cancels the hand-off;
- the target lane acknowledges, updates, blocks and submits the deliverable;
- the target lane or a firm manager controls target assignment;
- only a firm manager may supersede the immutable definition; and
- clients have read-only contract capability.

Transfer, bond and cancellation actors inherit their lane from their legal role. Secretaries and accounts staff must carry an explicit matching lane, which prevents an operational user from acting across firms or lanes by accident.

## Contract contents

The E1 definition pins:

- matter-plan, transaction and organisation identity;
- source and target lane, firm and accountable owner;
- one deduplication key;
- deliverable type, label, description and optional format;
- dependencies and the matter-plan actions that require the deliverable;
- evidence requirements;
- priority, visibility, acknowledgement and delivery deadlines; and
- creation provenance.

Legal lanes require exact firm bindings. Owners require a user or team reference. Same-lane records are rejected because internal task assignment belongs in the A-series plan rather than the cross-lane coordination layer.

## Lifecycle

The contract supports:

1. `draft`
2. `requested`
3. `acknowledged`
4. `in_progress`
5. `submitted`
6. `accepted`, `changes_requested`, `blocked`, `cancelled` or `superseded`

The target cannot submit before acknowledging. The source cannot accept before submission, and acceptance requires all mandatory evidence. Negative transitions require a reason. Request, acknowledgement, expected-delivery, submission, decision, blockage and follow-up timestamps must remain chronological.

## Integrity and lineage

Each definition has a deterministic fingerprint over its immutable matter binding, lanes, owners, deliverable, dependencies, evidence contract, SLA and provenance. Runtime state is intentionally excluded so later event phases can advance the lifecycle without rewriting the definition.

A changed definition becomes a new revision with the previous coordination ID, previous fingerprint and change reason. Exact matter binding cannot change across supersession.

## Side-effect boundary

E1 normalizes, validates and evaluates authority in memory. It does not:

- send a request or notification;
- invite or appoint an attorney;
- write to the database;
- mutate another lane's workflow;
- upload or approve evidence; or
- schedule reminders and escalations.

Later E phases must consume this contract and preserve these boundaries.

## Verification

Run:

```bash
npm run test:conveyancer-coordination-e1
```

The suite covers transfer-to-bond and transfer-to-cancellation hand-offs, operational lane scoping, owner and firm binding, dependency validation, SLA and chronological rules, evidence-backed acceptance, lifecycle authority, definition tampering, append-only supersession, client access and system boundaries.

## Database boundary

E1 requires no migration. It introduces the application contract that a later persistence phase may store; no new table or production write path is added here.
