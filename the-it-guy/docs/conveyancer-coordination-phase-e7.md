# Conveyancer Phase E7 — Coordination assurance

## Outcome

E7 is the independent, read-only certification gate over E1–E6. It verifies that coordination contracts, the three-role dependency graph, shared timeline, guarantees, simultaneous-lodgement readiness, escalations and attorney replacement evidence remain individually valid and exactly connected.

The result is:

- `ready` when platform integrity is intact and the supplied matter evidence is operationally ready;
- `observe` when contracts remain valid but the matter is legitimately waiting, at risk, escalated or awaiting replacement activation; or
- `blocked` when a contract, binding, authority, audit chain or side-effect boundary fails.

This distinction prevents an ordinary cross-firm delay from being misreported as platform corruption while still failing closed on forged readiness.

## E1 and E2 assurance

E7 validates the complete E2 model and every current E1 record, including:

- exact coordination IDs and definition fingerprints;
- matter, plan and organisation binding;
- unique supplied records with no orphan records;
- lifecycle authority and mandatory evidence; and
- timestamps no later than the assurance time.

Definitions embedded in E2 remain the fallback for coordination records that have not started. This supports valid planned work without inventing runtime events.

## E3 timeline assurance

The E3 timeline must validate against the same E2 model, viewer and assurance time. Every projected item must match the current E1 status, definition fingerprint and evidence-reference projection.

A valid timeline containing overdue or blocked work becomes an operational observation. A stale timeline that no longer matches current E1 is a critical binding failure.

## E4 and E5 assurance

The guarantee workspace must validate against E2 and reproduce current E1 guarantee statuses. The simultaneous-lodgement projection must bind to the exact E4 workspace fingerprint and current E1 lodgement-readiness records.

Every E5 lane that claims an attestation must have its exact source attestation supplied to assurance. E7 compares the attestation ID, fingerprint, lane, status and readiness reference. A lane with no attestation remains a valid observable matter state; a projected certificate without its source is blocked.

Cash transfer-only, bond, cancellation-only and full hybrid matters are certified without manufacturing unnecessary lanes.

## E6 assurance

Each escalation is checked for:

- E2 matter binding;
- unique identity;
- contiguous revision, event and command counts;
- unique commands and events;
- chronological event order;
- sequential escalation levels;
- terminal event alignment; and
- current source binding for active coordination, E4 or E5 targets.

Open escalations are observations. Invalid audit history is critical.

Replacement records must retain the correct current-firm and E2 binding, lawful appointment authority, evidence hash and optional escalation lineage. A confirmed appointment remains an observation until E2 is regenerated and downstream E3–E5 projections are rebuilt.

## Missing escalation coverage

E7 identifies overdue or blocked E1 items and blocking E4/E5 issues without a matching active E6 escalation. This is an operational warning rather than contract corruption. The assurance report therefore reveals unmanaged coordination risk without claiming that an escalation notification was sent.

## Guarded pilot

The pilot evaluator fails closed on any contract failure, binding failure, audit gap, authority violation or side-effect attempt. Callers cannot loosen those zero-tolerance thresholds.

The default pilot requires a 100% scenario pass rate. Open-escalation rates create an observation band at 10% and hold the pilot above 25%.

The manifest limits a pilot to:

- at most three firms;
- selected transfer, bond and cancellation lanes;
- at most 25 matters;
- a fixed start and end window; and
- named assurance, legal, operations, support and rollback owners.

Human approval remains mandatory. Database writes, notifications, appointment activation, invitation delivery, access revocation and deeds submission remain disabled.

## Evidence and privacy

The serialized evidence packet contains decisions, counts, phase status, finding codes, evidence identifiers, pilot metrics and controls. It excludes document content, bank details, party identity values, appointment contacts and arbitrary fields attached to the input report.

## Verification

Run:

```bash
npm run test:conveyancer-coordination-e7
```

The suite covers cash, bond, cancellation-only and hybrid certification, stale E3 state, E4 tampering, valid incomplete E5 work, source-attestation binding, E6 audit continuity, open escalations, authority-correct replacement, forged appointment evidence, viewer isolation, strict pilot thresholds, manifest limits and evidence redaction.

## Database boundary

E7 requires no migration. It consumes supplied immutable evidence and returns an in-memory report. Persisting certification reports or enabling pilot side effects remains later integration work.
