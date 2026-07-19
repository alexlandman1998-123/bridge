# Notification failure-recovery rehearsal blocker — 19 July 2026

## Result

Do **not** force a failed notification against a real staging recipient yet.

Staging has the applied phase-7 schedule migration. Every five minutes it invokes the transaction-progress dispatcher. The dispatcher claims `failed` email events whose retry time is due and whose retry budget remains. The attorney UI also describes queued resends as automatically retrying when needed.

That contradicts the required invariant: a controlled failure must prepare for review only, not resend automatically.

## Safe forward path

Add one forward-only notification recovery change before this rehearsal:

1. Add a manual-review/controlled-test state or metadata flag excluded from automatic claiming and dispatch.
2. On a controlled failure, clear its next retry timestamp and record a review-required reason.
3. Provide an audited, deliberate operator retry action.
4. Verify the change, then create one `.invalid`/labelled controlled failed event and confirm it remains review-only.

No event was created or sent during this review.
