# Conveyancer Matter Exceptions — Phase B5

## Purpose

Phase B5 adds a governed accepted-risk waiver workflow. A waiver confirms that an exception genuinely applies but the firm has authorised progression despite the documented residual risk. It is deliberately separate from B4’s factual `not_applicable` decision.

The executable service is `src/services/attorneyWorkflow/conveyancerMatterExceptionWaiver.js`.

## Waiver proposal

An acknowledged, investigated, waiting or remediation exception may receive a scoped waiver proposal. The proposal requires:

- A named proposer.
- The evidence requirements proposed for waiver.
- A reason, explicit risk and mitigation.
- Optional conditions.
- A future review date for critical exceptions.

Proposals can be revised or withdrawn only by their proposer or a firm manager.

## Independent decision

- A proposer cannot approve or reject their own waiver.
- Approval requires waiver capability, a decision summary and a durable decision reference.
- Critical approval requires a firm manager.
- Accounts may propose a financial waiver but cannot approve accepted legal risk.
- Scoped requirements become `waived`; every unscoped required item must already have satisfactory evidence.
- Approval sets exception status to `waived` and resolution outcome to `accepted_risk`.
- Rejection or withdrawal returns the exception to remediation and preserves the decision record.

## Execution controls

Commands enforce owner role, user and team boundaries, expected runtime revision and secure idempotency. Every successful proposal or decision emits one immutable before/after event. Invalid commands never mutate the input exception.

## Phase boundary

B5 returns updated exceptions and events in memory. It does not persist decisions, notify reviewers, enforce waiver conditions against matter actions, monitor review dates, reopen expired waivers or modify the matter plan.
