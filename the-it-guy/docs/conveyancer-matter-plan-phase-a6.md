# Conveyancer Matter Plan — Phase A6

## Purpose

Phase A6 adds firm-team ownership, capacity and continuity controls around the A4 queue and A5 execution service. It consumes attorney-firm membership and department/team-shaped records without creating a second membership model.

The executable service is `src/services/attorneyWorkflow/conveyancerMatterTeamOwnership.js`.

## Ownership projection

- Maps active attorney-firm roles to A1 matter-plan roles and capabilities.
- Classifies every active action as unassigned, team pool, user owned, stale assignment or overloaded owner.
- Calculates weighted member and team workload using action priority, urgency, review and blocker signals.
- Exposes available, balanced, busy, overloaded and inactive capacity states.
- Lists every active capable candidate for each action.
- Flags critical actions with no capable owner or a single point of failure.
- Detects inactive users, missing teams and role-incompatible assignments.

## Recommendations and execution

- Recommends the lowest-load capable member, preferring the currently assigned team.
- Recommendations never mutate the plan or silently allocate work.
- Assignment and handover require an explicit reason and command ID.
- Targets must be active, capability-compatible and within capacity unless an authorised caller explicitly allows over-capacity assignment.
- Team-pool assignment is permitted only when the team has active capable coverage.
- Approved changes execute through A5, retaining optimistic concurrency, idempotency and immutable audit events.
- Assignment changes user/team ownership only; the generated legal owner role and action definition remain unchanged.

## Phase boundary

A6 does not persist team ownership, create attorney-firm memberships, automatically rebalance work or alter the current UI. It returns the ownership projection, recommendations and A5 execution result for later adapters to consume.

