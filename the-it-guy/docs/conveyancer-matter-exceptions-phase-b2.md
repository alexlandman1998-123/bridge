# Conveyancer Matter Exceptions — Phase B2

## Purpose

Phase B2 provides the first curated exception-definition library on top of the B1 contract. It gives later detection and queue phases one versioned source for exception meaning, severity, action impact, ownership, SLA, evidence and resolution guidance.

The executable source of truth is `src/core/transactions/conveyancerMatterExceptionLibrary.js`.

## Initial coverage

The library covers the transfer lifecycle from opening through close-out:

- Missing classification facts and signed transfer instruction.
- FICA evidence and risk review.
- Entity authority documents and contradictory signing authority.
- Bank-appointed bond and cancellation attorney appointment and instruction states.
- Cancellation figures, municipal clearance and sectional-title levy clearance.
- Tax or VAT treatment, purchase funding and transfer payments.
- Defective signature packs and conflicting lodgement readiness.
- Deeds Office rejection, delayed registration and post-registration reconciliation.
- Matter-plan audit integrity and cross-lane instruction conflicts.

Bond, cancellation, entity-authority and sectional-title definitions are applicable only when the active plan contains the corresponding action and canonical facts.

## Definition contract

Each definition has:

- A stable key, code and version.
- B1 category and default severity.
- One A-series action association where applicable.
- Default owner and affected legal roles.
- Explicit matter/action blocking behaviour and customer visibility.
- A typed trigger signal and operator for later detectors.
- Required resolution evidence and practical resolution guidance.

The library validates unique keys/codes, recognised actions, capable owners, trigger structure, critical blocking behaviour and evidence definitions.

## Explicit record construction

`buildConveyancerMatterExceptionFromLibrary` creates a validated B1 record only when explicitly called with a valid active plan and detection context. It:

- Enforces definition applicability.
- Produces a stable plan/version/definition/scope deduplication key.
- Applies the B1 severity SLA policy.
- Records definition provenance.
- Escalates critical system detections immediately.
- Requires an authorised escalation actor for a critical client report.
- Never mutates the plan.

## Phase boundary

B2 does not inspect live signals, automatically detect exceptions, write records, block actions, allocate people, send requests or notify participants. Those later phases must use this library and the B1 contract.
