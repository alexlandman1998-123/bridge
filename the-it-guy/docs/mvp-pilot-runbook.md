# Arch9 MVP controlled-pilot support runbook

This is the operating procedure for the first agencies and attorneys. It is deliberately designed for a controlled pilot: at most 10 new transactions in a batch and at most 100 in a month. It is not a substitute for production deployment verification in [the deployment runbook](mvp-deployment-runbook.md).

## Operating rule

One pilot lead owns each batch. The lead records the transaction reference, the creation idempotency key, the post-deploy check output, and any incident. Do not create a second transaction to “try again” when a conversion is uncertain: find the original accepted offer and transaction first.

Only real pilot work belongs in a live batch. Synthetic records must use the controlled test role set and `TEST — DO NOT ACTION`; the platform suppresses their external notifications. A test transaction must never be used to contact a real client or role player.

## Before a pilot session

1. Confirm the target environment and the signed-in organisation. Do not paste Supabase keys into tickets, chat messages, or batch evidence.
2. Run the launch and session checks from the app root:

   ```bash
   node scripts/mvp-launch-readiness.mjs
   node scripts/mvp-pilot-session-check.mjs
   ```

   Continue only when the first command returns `ready_for_mvp_launch` and the second returns `go_for_controlled_pilot`.
3. Confirm the batch has fewer than 10 newly created transactions. If the previous batch has not been closed, close it first.
4. Open the transaction health panel. The pilot lead must be able to see the current gate, next action, participant/document counts, and recovery recommendation before accepting new work.

## For every transaction

1. Start from the normal lead → listing → accepted offer path. Do not use a manual override to bypass an accepted offer in pilot operations.
2. Confirm the transaction health panel immediately after conversion:

   - the stage and next action make sense;
   - required participants are present and contactable;
   - required documents and workflow lanes are present;
   - the current gate explains any blocked progress;
   - a `TEST — DO NOT ACTION` banner means no real notification may be expected.
3. Run the persisted-spine check and save its JSON output with the batch evidence:

   ```bash
   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
   node scripts/mvp-postdeploy-transaction-check.mjs --transaction-id=<transaction-uuid>
   ```

   The output includes a `batchRecord`. Copy that object into the open batch file. It contains the transaction id, idempotency key, and participant/document/workflow bootstrap confirmations.
4. Before moving to the next main stage, use the health panel and audit recommendation. Resolve the listed blocker in its proper workspace; do not change a stage merely to make a panel look green.

## Closing a batch

Create a local evidence file such as `pilot-batch-01.json`; do not put personal contact details or document contents in it:

```json
{
  "batchLimit": 10,
  "transactions": [
    {
      "transactionId": "<uuid>",
      "idempotencyKey": "<creation-idempotency-key>",
      "participantBootstrapComplete": true,
      "documentBootstrapComplete": true,
      "workflowBootstrapComplete": true
    }
  ]
}
```

Run both controls:

```bash
node scripts/mvp-pilot-batch-audit.mjs --input=pilot-batch-01.json
node scripts/mvp-pilot-metrics.mjs --input=pilot-batch-01.json
```

The batch may close only when the audit passes and metrics return `continue_rollout`. Record the outputs, count any support calls, and run `node scripts/mvp-pilot-session-check.mjs` again before opening the next batch.

## Support triage and recovery

| Symptom | Immediate action | Resume condition |
| --- | --- | --- |
| Transaction was created but participants, documents, or lanes are missing | Pause new transactions. Capture the id and post-deploy output. Do not create a duplicate. | The transaction is reconciled and its post-deploy check passes. |
| Health panel shows a blocked gate | Use the listed owner and recovery recommendation; complete the underlying role, document, onboarding, OTP, finance, or transfer action. | The gate is satisfied from a refreshed health audit. |
| Notification delivery failed | Use **Prepare notification retry** only after confirming recipient and content. It returns the event to `prepared`; it never resends automatically. | An operator reviews and explicitly sends the prepared event. |
| `TEST — DO NOT ACTION` appears | Stop. No external retry or real notification is allowed. Confirm the test record has not been mixed into live work. | Test data is isolated; any suspected real-data exposure is escalated. |
| Session, certification, duplicate identity, or bootstrap check fails | Stop the batch, preserve evidence, and run the command below. | Certification and the affected transaction/batch check are green. |

For any pause condition:

```bash
node scripts/mvp-release-certification.mjs
```

Record: time, operator, transaction id, accepted-offer id if available, health/audit issue, what was changed, and the successful re-check output. Never record passwords, access tokens, identity documents, or full client contact details in the support log.

## Escalate immediately

- A real client receives a test notification or data marked `TEST — DO NOT ACTION`.
- A duplicate transaction is suspected for the same accepted offer.
- The same failure recurs after one guided recovery attempt.
- Any role player cannot access their required transaction documents or workflow.
- A transaction cannot be reconciled without manual database editing.

The pilot lead pauses new creation, preserves evidence, and escalates with the transaction id and the completed audit output. Manual database edits are not a pilot recovery action.
