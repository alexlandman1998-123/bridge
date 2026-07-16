# Conveyancer Productisation Phase P0 — Product baseline

## Outcome

P0 converts A1-F8 from a collection of domain contracts into one approved product baseline for implementation. It fixes the pilot scope, terminology, persistence decisions, source-of-truth boundaries, threat model, migration rules, success measures and traceability expected by P1.

The executable source of truth is `src/core/productisation/conveyancerProductBaseline.js`.

## Pilot scope

P0 defines five required archetypes:

1. Cash transfer without an existing bond.
2. Cash transfer with cancellation.
3. Financed purchase without cancellation.
4. Financed purchase with cancellation.
5. Sectional-title financed purchase with cancellation and levy clearance.

Every archetype remains manual-first. External evidence may be uploaded and reviewed manually; no provider is required for the matter workflow to function.

## Canonical terminology

P0 fixes shared matter and evidence statuses and defines four high-risk terms:

- **Complete:** all bounded work and evidence requirements are satisfied.
- **Reviewed:** an authorised human made an evidence-bound decision.
- **Ready:** all current preconditions for the proposed next action are satisfied.
- **Registered:** reviewed registration evidence exists; a stage label is insufficient.

Product screens may use friendlier display labels but must map to these canonical values.

## Persistence decisions

The record catalogue distinguishes:

- canonical persisted records, such as the matter, active plan, exception, evidence and financial model;
- append-only records, such as action, decision, financial and integration events;
- versioned configuration, such as templates and provider profiles;
- derived projections, such as the action queue, shared timeline and lodgement readiness; and
- external-reference-only content, such as files held in secure object storage.

P1 should persist source records and events. It must not introduce writable tables that compete with derived projections as a second source of truth.

## Source-of-truth boundary

Provider data never overwrites canonical legal facts. Signed provider events enter the inbox as evidence for reconciliation. Registration, signing, financial and compliance outcomes require the review or decision specified by their A-F contracts.

## Threat model

The minimum P0 model covers cross-tenant access, wrong-firm actions, privilege and privacy disclosure, evidence tampering, replay, duplicate execution, provider-created legal truth, unauthorised money movement, stale evidence, migration loss and failed-release recovery.

Each threat has a named control and accountable owner. P1 must translate the tenancy, authorisation, classification and audit controls into database constraints and RLS policies.

## Migration and rollback policy

P0 mandates `expand → migrate → verify → contract`:

- dry-run before mutation;
- backup and tested restore;
- row-count and fingerprint reconciliation;
- feature-flag activation;
- limited pilot cohort;
- named rollback ownership; and
- forward repair instead of destructive rollback where possible.

P0 does not execute a migration.

## Exit gates

P0 only releases P1 when:

- all five archetypes are covered;
- plans and action queues remain deterministic;
- all evidence has complete lineage;
- no unauthorised or cross-tenant action succeeds;
- no provider is required for the manual workflow;
- no external outcome becomes legal truth without review;
- migration reconciliation has zero variance; and
- no critical pilot finding remains open.

Product, legal, security, data, operations and rollback owners must approve independently.

## A1-F8 traceability

All 45 phases are included in the traceability catalogue and mapped to a P0 record domain. P1 schema proposals must identify the P0 record key and A-F source contract they implement.

## P1 handoff

P1 should implement durable identifiers, organisation and firm tenancy, canonical and append-only tables, versioned configuration, object-storage references, evidence immutability, audit history, retention metadata, indexes and RLS. It should leave action queues, timelines and readiness as calculated projections.

No database migration is required for P0. It is an immutable baseline, validation, metric-gate and redacted-evidence contract.
