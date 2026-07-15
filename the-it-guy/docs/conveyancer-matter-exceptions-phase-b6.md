# Phase B6 — Override workflow

## Outcome

B6 introduces a controlled, temporary permission to continue a narrow set of safe operational activities while an exception remains unresolved. An override does not change the exception's status, evidence, resolution, dependencies or legal truth.

## Authority model

- The exception owner may propose, revise and withdraw an override within the existing ownership and team-assignment boundary.
- A firm manager may propose, revise or withdraw on behalf of the team.
- Only a firm manager has the `override` capability needed to approve, reject or revoke an override.
- A proposer may not approve or reject their own proposal. A manager proposal therefore needs a different manager's decision.
- Approval requires a decision summary and an external or internal decision reference.

## Safe operation allowlist

An override may authorize only:

- continuing unaffected work;
- requesting documents;
- coordinating an external party;
- preparing draft documents;
- scheduling a signing;
- recording a financial receipt; or
- performing an internal review.

Unknown operations and legal-state changes fail closed. In particular, an override cannot complete an action, satisfy evidence, assert an appointment or instruction, authorize lodgement or registration, or resolve an exception.

## Lifecycle

1. An owner proposes named operations, a reason, business justification, safeguards and an expiry.
2. The proposal can be revised or withdrawn without changing the exception status.
3. An independent firm manager approves or rejects it.
4. Runtime callers evaluate the exact operation against the active override and current time.
5. The override fails closed at expiry and can be explicitly revoked earlier by a firm manager.

Only one proposal or active override may exist at a time. A correction, not-applicable or waiver review blocks a new override proposal.

## Time limits

Maximum duration is measured from the original proposal time, including revisions:

| Severity | Maximum duration |
| --- | ---: |
| Low | 336 hours |
| Medium | 168 hours |
| High | 72 hours |
| Critical | 12 hours |

## Audit and concurrency

Every successful command creates an immutable before/after event. Commands require the expected exception ID and runtime revision, support secure idempotent replay, and never mutate caller input. The event captures the actor, authority route, proposal or decision and the unchanged status/evidence/resolution boundary.

Run `npm run test:conveyancer-matter-exceptions-b6` for focused verification.
