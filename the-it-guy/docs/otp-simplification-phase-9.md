# OTP simplification — Phase 9 controlled follow-up

Phase 9 turns Phase 8 findings into a small human follow-up journey. It does not make a legal decision or change the OTP.

## Three-step journey

1. **Run operational audit** — read the current generated-document, exact master-version, approval and release evidence.
2. **Review notification plan** — show who would be notified and why. Nothing is sent.
3. **Confirm notifications** — re-run the Phase 8 audit and notify only if the reviewed plan is still exactly current.

If the packet, generated version, canonical master-version ID, evidence issue, operational state or target role changes, the reviewed plan is rejected. The administrator must inspect a fresh plan.

## Canonical evidence findings

An OTP that does not match its recorded immutable master version creates a critical action:

- signature progression must stop;
- the assigned agency and attorney roles are notified;
- the plan shows the short canonical master-version ID;
- the evidence issues form part of the plan fingerprint; and
- identical unread notifications are deduplicated per packet, version and evidence state.

Superseded master versions remain valid for documents generated while they were live, so they do not create follow-up merely because a newer master is active.

## Legal boundary

Notifications cannot approve an OTP, clear an attorney-review item, edit or lock wording, create signing links, repair evidence, activate a version or trigger rollback. They only direct the right humans to the existing governed workflow.

## Delivery boundary

Phase 9 requires no migration and performs no deployment. Applying a notification plan creates normal transaction notifications; the implementation and automated tests do not apply a plan or send notifications.
