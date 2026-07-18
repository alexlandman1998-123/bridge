# Seller document release readiness — P1-10

P1-10 closes the first seller-document automation programme with a fail-closed release certificate and a revision-locked, tenant-scoped canary progression. It does not automatically enrol existing organisations: an organisation without a rollout-control row continues its existing behaviour until operations explicitly places it into `paused`, `canary`, or `enabled` state.

## What the certificate proves

The release snapshot is scoped to one organisation and optionally one listing. A strict pass requires all of the following at the same time:

- P0-3, P0-5, P1-8 and P1-9 RPCs and the P0-5, P0-6, P1-8 and P1-9 views are deployed.
- Every seller-document request, reminder, escalation and review-SLA automation definition is active and enabled.
- The deployed notification-reminder dispatcher has recorded a successful non-dry-run heartbeat in the last two hours.
- There are no P0-5 integrity/request-issuance blockers or attention items.
- There are no P0-6 listing-to-transaction continuity blockers or attention items.
- There are no P1-9 critical, unassigned, breached, due-soon, or failed-notification review items.
- There are no failed seller-document notification events from the last 24 hours.

The heartbeat is intentionally written by the deployed Edge Function after its seller follow-up and review-SLA queue passes. A migration-only deployment therefore cannot accidentally certify the scheduler as live.

## Safe rollout sequence

1. Deploy migration `202607170015_seller_document_release_readiness_p1_10.sql` and the updated `send-email` Edge Function.
2. Invoke the notification reminder dispatcher once in live mode and confirm its P1-10 heartbeat was recorded.
3. Run a read-only strict organisation report:

   `npm run certify:seller-document-release -- --organisation-id=<uuid> --strict`

4. Place one listing into canary mode. A new control starts at expected revision `0`:

   `npm run certify:seller-document-release -- --organisation-id=<uuid> --listing-id=<uuid> --set-mode=canary --reason=p1_10_pilot --expected-revision=0 --confirm-rollout-change`

5. Exercise request creation, seller receipt, upload, agent review, SLA refresh and listing-to-transaction propagation on that listing. Then certify it using the revision returned by step 4:

   `npm run certify:seller-document-release -- --organisation-id=<uuid> --listing-id=<uuid> --certify-canary --expected-revision=<revision> --confirm-rollout-change --strict`

6. Promote only with the new revision returned by certification. The database rejects promotion unless the canary passed within 24 hours and the current snapshot still passes:

   `npm run certify:seller-document-release -- --organisation-id=<uuid> --set-mode=enabled --reason=p1_10_canary_passed --expected-revision=<revision> --confirm-rollout-change --strict`

Every mutation is service-role-only, requires an explicit confirmation flag, reason and optimistic revision, and writes an append-only audit record. The command rejects unscoped mutations.

## Stop and recovery

If the gate regresses, set the organisation to `paused` with the current revision and a specific incident reason. Roll back the application/Edge Function release first; retain the additive migration, heartbeats and rollout audit evidence. Repair failed notifications, request issuance, document links, transaction promotion or review assignments, run the strict report again, and repeat canary certification before re-enabling.

P1-10 is a release-control and evidence boundary. The `mode` records the authorised rollout posture; it deliberately does not delete requests, documents, notification history, or legal evidence when paused.
