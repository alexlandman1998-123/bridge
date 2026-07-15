# Conveyancer Matter Exceptions — Phase B1

## Purpose

Phase B1 defines the canonical exception contract layered over the A-series matter plan. An exception is a first-class operational or legal issue requiring accountable handling; it is not another name for an action state and cannot silently mutate the plan.

The executable source of truth is `src/core/transactions/conveyancerMatterExceptionContract.js`.

## Contract boundaries

- Every exception belongs to one transaction, organisation and exact matter-plan version.
- An exception may reference one action and explicitly block multiple affected actions or the complete matter.
- Category, severity, status and source are typed and validated.
- A stable deduplication key lets later detectors update one issue instead of opening parallel records.
- Every exception records who or what detected it and assigns an internal owner capable of managing it.
- High and critical exceptions require response and resolution SLAs.
- A critical exception must block work and carry a recorded escalation.
- External waiting states identify the dependency and next follow-up time.
- Resolution and waiver require every mandatory evidence item, an authorised actor, timestamp and outcome.
- Critical risk acceptance requires a firm manager.
- Closed exceptions can only reopen through explicit authority; supersession is manager-only, same-plan and reasoned.
- Runtime revisions must link to an audit event once mutation begins.

## Lifecycle

The contract supports `open`, `acknowledged`, `investigating`, `waiting_external`, `remediation`, `pending_review`, `resolved`, `waived`, `cancelled` and `superseded` states. The transition matrix prevents direct or unauthorised closure while still allowing controlled reopening.

## Severity policy

Severity provides deterministic response and resolution targets:

- Low: 48-hour response, 240-hour resolution.
- Medium: 24-hour response, 120-hour resolution.
- High: 8-hour response, 48-hour resolution.
- Critical: 2-hour response, 12-hour resolution and mandatory escalation.

These targets are contract defaults for later generation and monitoring phases; B1 validates supplied SLAs but does not schedule reminders.

## Phase boundary

B1 adds no exception detection engine, database persistence, automatic assignment, notifications, dashboard, action blocking, document request or escalation execution. Later B phases must consume this contract rather than create parallel exception semantics.
