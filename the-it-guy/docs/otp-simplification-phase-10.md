# OTP simplification — Phase 10 closure

Phase 10 answers the final operational question: **Was the underlying OTP problem actually fixed?**

Reading a notification is acknowledgement only. It never counts as legal or operational resolution.

## Closure rule

Every check starts with a fresh Phase 8 audit. A Phase 9 finding is resolved only when its exact packet, generated version, operational state, canonical master-version ID and evidence issue are no longer present.

Canonical follow-up is reported as:

- **Notification missing** — the finding is active but no matching outreach exists.
- **Awaiting acknowledgement** — outreach exists and remains unread within its SLA.
- **Overdue unread** — outreach exceeded the acknowledgement SLA.
- **Acknowledged, unresolved** — reviewers saw the notification, but the evidence problem remains.
- **Unroutable** — the finding has no transaction from which assigned roles can be resolved.
- **Resolved after notification** — the exact evidence finding disappeared from the fresh audit.

If the evidence changes rather than clears, the previous finding is retained as historical resolution and the changed evidence becomes a new active finding requiring its own reviewed notification plan.

## Operator view

The OTP overview shows active, missing, overdue, acknowledged-unresolved and resolved counts. Current and historical canonical findings display the short immutable master-version ID so the operator can distinguish evidence belonging to different releases.

## Safety boundary

The closure check is read-only. It does not mark notifications read, send reminders, approve an OTP, clear legal review, regenerate a document, change wording, create signing links, activate a version or trigger rollback.

## Delivery boundary

Phase 10 requires no migration and performs no deployment. Automated verification uses in-memory evidence fixtures and does not send notifications or alter live data.
