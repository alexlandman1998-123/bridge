# Conveyancer productisation P2: application orchestration

P2 connects real matter events to the A1-F8 contracts through a controlled, idempotent application boundary. It remains disabled after migration and does not introduce a new cockpit or send notifications.

## Implemented event routes

- `matter_instruction_accepted` generates and activates the first A2 matter plan.
- `matter_facts_changed` runs the A3 rerouting preview and requires human review.
- `matter_reroute_approved` appends an acknowledged replacement plan.
- `action_command_requested` runs A4/A5 authority, dependency and evidence checks before appending the action event and runtime plan revision atomically.
- `external_evidence_received` is accepted only as a review requirement; it cannot create canonical evidence or legal truth.
- `coordination_changed` requests deterministic projection rebuilding without persisting the timeline or readiness views.

`runConveyancerMatterEvent` is the application entrypoint. It loads the latest immutable firm control, current persisted plan and action history, runs the relevant A-series contracts, and commits the resulting batch through the guarded RPC.

The existing incoming-transfer acceptance flow now publishes `matter_instruction_accepted` into this entrypoint after its transaction audit event is recorded. If P1/P2 is unavailable or disabled, acceptance continues through the established workflow and reports orchestration as skipped; it never leaves the instruction half-accepted.

## Safety boundary

- With no control record, orchestration is disabled.
- Every new control revision starts with the kill switch on unless explicitly disabled by a firm administrator.
- Observe mode executes contracts but writes nothing.
- Pilot mode is restricted to explicit transaction UUIDs.
- Database commands require an active exact-firm member who already has transaction access and holds transfer-attorney or management authority.
- Browser clients retain no direct table mutation privileges; writes pass through the two P2 security-definer RPCs.
- Each source event has one immutable receipt per firm. Reusing an event ID with changed input fails as an idempotency conflict.
- Fact changes and provider evidence stop for review.

## Activation sequence

1. Apply and verify P1 first.
2. Apply `202607160002_conveyancer_productisation_p2.sql`.
3. Run `sql/conveyancer-productisation-p2-verify.sql` and keep all firms without a control record or create a `disabled`/kill-switch-on control.
4. Run observe mode against representative matter events and compare generated projections with the existing attorney workflow.
5. Create an isolated pilot control with named transaction IDs and only the required event types.
6. Disable the kill switch for that revision only after P2 assurance passes.
7. Monitor orchestration receipts, idempotency conflicts and A7-F8 assurance.

## Recovery

Append a new control revision with `killSwitchEnabled: true`; do not update or delete historical controls, receipts, plans or events. Existing attorney workflows remain available because P2 does not replace their UI or manual provider paths.

## P3 handoff

P3 can build the conveyancer cockpit and single action-queue UI from `buildConveyancerOperationalProjections`. It should show event/receipt provenance, rerouting review prompts, manual-provider fallbacks and the active kill-switch/pilot state without bypassing P2 commands.
