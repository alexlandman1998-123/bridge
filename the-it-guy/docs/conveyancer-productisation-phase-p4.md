# Conveyancer productisation P4 — notifications, reminders and escalations

P4 adds a durable, opt-in in-app delivery layer to the P2 orchestration and P3 cockpit. Notifications remain projections of the current matter plan. They never complete work, approve evidence or become legal truth.

## Delivered

- Deterministic notification intents for ready work, legal review, blockers, due-soon reminders, overdue work and management escalations.
- Owner-role routing to active members of the exact attorney firm, with management escalations restricted to firm administrators and partners.
- A versioned P4 control with disabled, observe, pilot and live modes, an independent kill switch and exact pilot transaction cohort.
- A deduplicated durable outbox plus append-only delivery events.
- Scheduled future reminders generated from matter-plan due dates.
- A service-role dispatcher that locks due work safely, rechecks the latest P2/P4 controls and current action state, and skips stale notifications.
- In-app delivery through the established transaction notification surface.
- Delivery health in the conveyancer cockpit.
- Best-effort P4 invocation after successful P2 plan commits; missing or disabled P4 never breaks instruction acceptance or action execution.

## Deliberate boundary

P4 currently enables only the `in_app` adapter. Email, SMS and WhatsApp are not silently enabled: each requires approved templates, recipient-address governance, unsubscribe/quiet-hours policy and a separately assured delivery adapter. Manual follow-up remains available.

## Migration and activation

P4 requires `202607160004_conveyancer_productisation_p4.sql`, after P1 and P2. It creates no active control and sends nothing by default.

1. Apply P1 and P2 and run their verification scripts.
2. Apply the P4 migration.
3. Run `sql/conveyancer-productisation-p4-verify.sql`.
4. Create an observe-mode P4 control and compare projections with the P3 action queue.
5. Create a pilot control for explicit transactions, retaining the kill switch until sign-off.
6. Invoke `dispatch-conveyancer-notifications` from the approved scheduler using an authenticated service-role request.
7. Monitor queued, delivered, failed and skipped counts in the cockpit and delivery-event ledger.

Stopping P4 requires a new control revision with the kill switch enabled. Historical controls, outbox rows and delivery events remain intact.

## Verification

```sh
npm run test:conveyancer-productisation-p4
```
