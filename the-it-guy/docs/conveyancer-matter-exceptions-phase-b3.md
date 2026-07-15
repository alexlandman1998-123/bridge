# Conveyancer Matter Exceptions — Phase B3

## Purpose

Phase B3 activates B2 definitions into validated B1 exception records from explicit, timestamped observations. It provides deterministic, idempotent in-memory activation and audit evidence without writing to production systems.

The executable service is `src/services/attorneyWorkflow/conveyancerMatterExceptionActivation.js`.

## Observation contract

An observation identifies a B2 signal, scope, state, observation time, source and detector. Supported states are `present`, `missing`, `true`, `false`, `overdue`, `rejected`, `conflict`, `changed` and `clear`.

The absence of an observation is always `not_observed`; it never activates a missing-evidence or missing-fact exception. This prevents a disconnected integration or incomplete payload from opening false exceptions.

Multiple observations for one signal are allowed only when their scope keys differ, such as separate buyer and seller FICA documents.

## Activation behaviour

- Only a valid active matter plan may activate exceptions.
- Definitions must be applicable to the current plan actions and canonical facts.
- Triggered observations create B1-valid records using B2 defaults, SLAs, evidence and provenance.
- Plan/version/definition/scope deduplication makes activation idempotent.
- An already-active exception is retained without another event.
- A recurring terminal exception becomes an authorised-reopen candidate; it is not duplicated.
- A cleared trigger becomes a resolution-review candidate; it is never auto-resolved or auto-waived.
- A definition made inapplicable by rerouting also becomes a resolution-review candidate.
- Critical system observations escalate immediately; critical client reports require an authorised escalation actor.
- Every new activation emits one immutable audit event.
- Activation batches are atomic: if any proposed record fails B1 validation, the batch emits no events and adds no records.

## Phase boundary

B3 returns the proposed next exception collection and activation events in memory. It does not poll integrations, persist records or events, block matter actions, reopen or resolve exceptions, send notifications, allocate individual staff or update dashboards.
