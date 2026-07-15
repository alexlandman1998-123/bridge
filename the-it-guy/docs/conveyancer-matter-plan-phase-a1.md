# Conveyancer Matter Plan — Phase A1

## Purpose

Phase A1 defines the executable contract for a versioned conveyancing matter plan. It does not persist plans or replace the current attorney workflow yet. Later phases must consume this contract instead of inventing separate action, ownership, evidence, or versioning rules.

The executable source of truth is `src/core/transactions/conveyancerMatterPlanContract.js`.

## Contract boundaries

- A plan belongs to one transaction and organisation.
- Published plans are immutable versions; a changed plan links to its predecessor and records a reason.
- Action keys are unique within a plan.
- Action dependencies must reference existing actions and may not form cycles.
- Every action has one state, priority, owner role, required capability, due-date rule, and evidence contract.
- Waiting actions identify what they are waiting on.
- Blocked and cancelled actions record a reason.
- Completed actions record a completion time and satisfy every required evidence item.
- Waived evidence records a reason.
- A completed action may only be reopened by an authorised reviewer with a reason.
- Only a firm manager may supersede an active plan in contract v1.

## Phase A1 boundary

This phase adds no database migration, generation engine, action queue UI, reminders, or automatic workflow updates. Those begin in Phase A2 and must preserve these invariants.

