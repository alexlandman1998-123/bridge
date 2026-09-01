# Portal Release Rehearsal — Phase 4

This is the final human release check. Run it against a non-production transaction that has the Phase 3 role matrix: buyer, seller, agency user, developer user, bond originator, and transfer attorney.

Do not use customer records. Record the transaction id, tester, viewport, date, expected result, actual result, and a screenshot for every failed check.

## Required walkthroughs

| Role | Desktop and mobile route | Must prove |
| --- | --- | --- |
| Buyer | Secure buyer portal | First load, documents, finance, transfer journey, messages/team, loading/error/empty states, and every visible action has a clear result. |
| Seller | Secure seller portal | Password gate, property/sale progress, documents, replacement upload, multiple-owner requirements, mandate/listing state, loading/error/empty states. |
| Agency | Buyer and seller workspaces | Handoff, review queues, document status, role-safe updates, exceptions, and action-state feedback. |
| Developer | Developer document portal | Token/access boundary, document request and review actions, buyer-safe visibility, and empty/error states. |

## Mandatory interaction checks

1. Every visible button/link has a visible enabled state, disabled/loading state when it performs work, and an understandable result.
2. Every upload shows the selected file, an honest secure-upload state, receipt/review confirmation, and an inline retry path on failure.
3. At 390px width, no horizontal overflow, clipped primary action, hidden menu destination, or inaccessible bottom action is permitted.
4. Journey, finance, document, and transfer updates from the Phase 3 matrix appear once for the intended viewers and never expose internal details to buyer or seller.
5. Refresh each role after an update. The new stage and activity must remain visible after reload/reconnect.
6. Invalid/expired links and expired seller sessions must explain what happened and provide a safe retry or sign-in path.

## Decision rule

Release is blocked by any broken primary action, incorrect role visibility, misleading document completion state, mobile overflow, inaccessible control, client-data leak, or unrecoverable error. Warnings require a named owner and a dated follow-up before an internal pilot.
