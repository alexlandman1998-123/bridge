# Document Generator Final-Mile Phase 1

Date: 2026-07-26

## Objective

Correct the final completion status model so the system cannot report `ready: true` or `completed_everywhere` while final recipient delivery is pending.

## Implementation

Added corrective migration:

`../supabase/migrations/202607260001_corrective_final_completion_status_truth.sql`

The migration replaces `bridge_get_final_completion_status_f5` and makes these values derive from the same truth:

- `ready`
- `stage`
- `retryable`
- `deliveryReady`
- `deliveryStage`
- `deliveryRetryable`

## Required Truth

`ready=true` now requires all of:

- final signed artifact exists
- transaction publication exists
- surface completion receipt exists and is visible/satisfied
- every signer has append-only final delivery evidence with `status='sent'` and provider evidence

If delivery is incomplete, the response must be:

- `ready=false`
- `stage='awaiting_recipient_delivery'`
- `retryable=true`
- `deliveryReady=false`

## Not Included

This phase does not add staging-safe suppressed delivery. That is Phase 2.
