# Conveyancer Matter Plan — Phase A5

## Purpose

Phase A5 adds controlled command execution to active matter-plan actions. Commands return a new runtime snapshot plus an immutable audit event; the supplied plan is never mutated.

The executable service is `src/services/attorneyWorkflow/conveyancerMatterActionExecution.js`.

## Supported commands

- Start a dependency-ready action.
- Mark work waiting or blocked and record the context.
- Resume waiting or blocked work with a reason.
- Submit work for review.
- Complete an action once dependencies and evidence are satisfied.
- Reopen completed work under review authority with a reason.
- Cancel an action with a reason.
- Record, approve, reject or waive evidence.
- Assign an action to a user and/or team without changing its owner role or generated definition.

## Safety contract

- Only valid active plans can execute commands.
- Every command targets an expected plan ID, plan version and action runtime revision.
- Stale commands fail rather than overwrite newer work.
- A command ID produces a stable event ID and supports idempotent replay.
- A1 ownership and capability rules govern execution, review, waiver, assignment and reopening.
- Bond and cancellation work remains inaccessible to the transfer team when owned by those legal lanes.
- Required dependencies gate start, resume, review and completion.
- Required evidence gates completion; approval-required evidence must be approved.
- Evidence records are current-state projections while immutable command events preserve the audit history.

## Phase boundary

A5 is a pure execution service. It does not write events or runtime snapshots to the database, send notifications, generate documents or replace the current attorney UI. A persistence adapter can commit the returned plan and event atomically in a later phase.

