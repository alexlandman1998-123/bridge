# Conveyancer Matter Exceptions — Phase B4

## Purpose

Phase B4 adds controlled correction and not-applicable decisions to active B1 exceptions. It distinguishes fixing a genuine problem from deciding, with evidence and authority, that the exception does not apply to the matter.

The executable service is `src/services/attorneyWorkflow/conveyancerMatterExceptionCorrection.js`.

## Correction path

The supported correction path is:

1. Acknowledge the exception.
2. Investigate and begin remediation.
3. Record evidence against known B1 requirements.
4. Submit the complete correction for review.
5. Approve the correction or reject specific evidence back to remediation.

Approval changes evidence requiring review from `provided` to `approved`, resolves the exception with the `corrected` outcome and records the reviewer, summary and immutable event.

## Not-applicable path

Not applicable is a factual applicability decision, not accepted legal risk:

1. An authorised owner proposes a reasoned not-applicable review.
2. An actor with both resolution and evidence-waiver capability decides it.
3. Each now-irrelevant evidence requirement is explicitly waived with the decision reason.
4. The exception resolves with outcome `not_applicable`; its status is never `waived`.

Critical not-applicable decisions require a firm manager. This prevents the not-applicable path from bypassing critical-risk governance.

## Execution controls

- Commands require exception identity and expected runtime revision.
- Exception owner role, user and team boundaries are enforced; firm managers have an audited override.
- Command IDs are idempotent, but replay data is returned only to an authorised actor.
- Every successful command increments the runtime revision and creates one immutable before/after event.
- Invalid commands never mutate the source exception.

## Phase boundary

B4 returns the updated exception and event in memory. It does not persist either, modify matter-plan actions, auto-request documents, notify participants, reopen terminal exceptions or make risk-waiver decisions.
