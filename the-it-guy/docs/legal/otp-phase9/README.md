# OTP Phase 9 — Controlled review follow-up

Phase 9 turns Phase 8 findings into a controlled human follow-up workflow inside the OTP overview. It does not make legal decisions.

## Workflow

1. **Run operational audit** reads the current governed OTP packet and version evidence.
2. **Plan review notifications** creates a dry-run showing every action, target role and non-routable item. Nothing is sent.
3. An authorised organisation administrator reviews the deterministic plan and chooses **Review and notify**.
4. The confirmation explains the legal boundaries and exact executable action count.
5. **Confirm notifications** re-runs Phase 8 immediately before applying the reviewed plan.
6. If any packet, version, operational state, target-role action or audit-completeness result changed, the plan is rejected and nothing is sent.

## Routing

- Ordinary OTP approval waits notify the assigned agency role.
- Specialist legal-review waits notify the assigned attorney role.
- Stale specialist approvals return to the attorney; ordinary stale approvals return to the agency.
- Critical unsafe release states notify agency and attorney roles.
- Healthy, safely released and legacy-only rows create no action.
- Packets without a linked transaction remain visible but cannot be routed automatically.

Packet/version/state-specific dedupe keys suppress intentional duplicate unread notifications.

## Safety improvements

The reviewed plan fingerprint includes both executable and non-executable findings. A newly linked or unlinked packet therefore invalidates the reviewed plan instead of silently falling outside it.

Plans built from partial Phase 8 diagnostics cannot be applied. The operator must repair the query/schema problem and run a complete audit first.

Only organisation administrators see the planning and apply controls. An applied result reports notified actions, missing active recipients and failures.

## Legal boundaries

Notifications cannot:

- approve an OTP;
- clear an attorney-review item;
- change or lock wording;
- create signing links;
- repair stale evidence; or
- trigger template rollback.

Those actions remain in their respective governed workflows.

## Verification

```bash
npm run test:otp-followup-phase9
```

This runs the hardened escalation contract plus the Phase 8 assurance and Phase 7 rollback-safety regressions.
