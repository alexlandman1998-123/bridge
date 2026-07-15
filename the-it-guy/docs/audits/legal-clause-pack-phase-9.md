# Legal Clause Pack Phase 9 — Closed-Loop Review Escalation

Phase 9 turns the read-only Phase 8 audit into a controlled human follow-up workflow. It does not auto-approve, alter clauses, lock documents, release signing links, or repair legal evidence.

## Escalation routing

- Ordinary OTP approval waits notify the assigned agency role.
- Specialist legal-review waits notify the assigned attorney role.
- Stale specialist approvals return to the attorney; ordinary stale approvals return to the agency.
- Critical unsafe release states notify both agency and attorney roles.
- Healthy, safely released, and legacy-only rows do not create escalation actions.

## Two-step safety model

1. **Plan review notifications** generates a dry-run with action keys, target roles and a deterministic plan fingerprint.
2. **Apply reviewed plan** refreshes Phase 8 diagnostics and refuses to continue when the packet/version/state action set changed after review.

Notifications use packet/version/state-specific dedupe keys, so rerunning the same plan does not intentionally create duplicate unread notifications.

Packets without a linked transaction remain visible in the plan but are non-executable because Arch9 cannot safely resolve their assigned transaction roles.

## Non-negotiable legal boundaries

The escalation workflow cannot satisfy a legal review item. Only the authorised Phase 7 approval action can produce valid signature-release evidence for the current OTP version and content fingerprint.

