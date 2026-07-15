# Conveyancer Matter Plan — Phase A3

## Purpose

Phase A3 provides a read-only rerouting preview before an active matter plan is superseded. It uses the A2 generator to produce the proposed next version and the A1 contract to validate both the current and candidate plans.

The executable preview service is `src/services/attorneyWorkflow/conveyancerMatterPlanReroutingPreview.js`.

## Preview contents

- Canonical fact changes with before and after values.
- Added, removed and changed actions.
- Dependency, ownership, priority, deadline and evidence-contract changes.
- Progress that will carry forward or reset.
- Bond and cancellation legal lanes that will activate or deactivate.
- Roles that would need notification if the reroute is later applied.
- A severity level, blockers and a concise count summary.

## Safety rules

- The source must be a valid active plan.
- The candidate must pass the A1 contract.
- A reroute must contain a material change and a recorded reason.
- A1 supersession authority still applies; transfer conveyancers may inspect the preview but only a firm manager may authorise v1 supersession.
- Removing an action with progress requires explicit acknowledgement.
- Resetting a completed action requires explicit acknowledgement.
- Deactivating a bond or cancellation lane requires explicit acknowledgement because changing the plan does not cancel a bank appointment, legal instruction or platform access.

## Phase boundary

A3 does not save, activate, notify, revoke access, cancel instructions or mutate the current plan. It returns a candidate plan and a structured impact preview for a later controlled apply phase.

