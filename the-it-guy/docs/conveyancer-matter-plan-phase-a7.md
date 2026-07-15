# Conveyancer Matter Plan — Phase A7

## Purpose

Phase A7 closes the A programme with deterministic assurance evidence and a guarded pilot contract spanning A1 through A6.

The executable assurance and pilot service is `src/services/attorneyWorkflow/conveyancerMatterPlanAssurance.js`.

## Per-matter assurance

Critical platform checks certify:

- A1 contract validity and active-plan state.
- A2 deterministic generation parity with no action-definition drift.
- A3 no-change rerouting rehearsal with a valid candidate and no applied mutation.
- A4 queue availability.
- A5 event-chain completeness, uniqueness, runtime-revision integrity and independent actor-authority checks.
- A6 resilient coverage for critical actions.

Matter-health checks observe incomplete facts, ownership exceptions, missing next actions, overdue work, blockers and overloaded teams. Critical failures produce `blocked`; ordinary operational exceptions produce `observe`; a clean matter produces `ready`.

Each result contains a frozen, serializable evidence packet suitable for release records.

## Pilot suite

The default suite exercises:

- Cash individual transfer.
- Bond-financed company buyer.
- Hybrid trust matter with bond and cancellation coordination.
- Sectional-title clearance requirements.
- Commercial VAT entity transfer.
- Missing-classification safe fallback.

Expected exception behaviour can pass under observation. Unexpected action, evidence or assurance outcomes hold the pilot.

## Pilot controls

- Expansion decisions are `go`, `observe` or `hold`.
- Generation failures, audit gaps, unauthorised mutations, missing queues and material execution failures are rollback triggers.
- Overdue and blocked-action rates have observation and hold thresholds.
- The manifest requires named pilot firms, dates, matter limits, rollback ownership and support ownership.
- Legacy workflow fallback and a kill switch are mandatory.
- Automatic rerouting and automatic workload rebalancing remain disabled.
- The manifest cannot enable database writes.

## Phase boundary

A7 produces assurance, pilot and release evidence only. It does not deploy feature flags, enrol firms, write production data, activate plans or execute rollback actions.
