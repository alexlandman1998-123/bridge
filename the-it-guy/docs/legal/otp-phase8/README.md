# OTP Phase 8 — Live operational assurance

Phase 8 brings the existing governed OTP release audit into the Legal Documents journey and combines it with the Phase 7 template/recovery health checks.

It keeps two decisions separate:

1. **Template decision** — whether the live governed OTP and its rollback anchor are operationally healthy.
2. **Release decision** — whether generated OTP packets have valid readiness, reviewer authority, version-bound approval and signing-release evidence.

The audit is read-only. It never edits wording, approves a packet, creates signing links or triggers rollback.

## Operator states

- **Not assessed** — run the operational audit before making a release decision.
- **Healthy · release may continue** — the template route is healthy and all governed release evidence passes.
- **Hold for review** — operational or attorney approval queues remain.
- **Stop signature release** — at least one governed OTP has unsafe release evidence.
- **Audit incomplete** — a schema/query warning or result limit prevents an organisation-wide conclusion.
- **Recovery route needs attention** — packet evidence may be safe, but the live template recovery route is degraded.
- **Awaiting first governed OTP** — the governed template is live but there are no governed packets from which to evidence release behaviour.

Critical packet evidence does not automatically imply that the legal template itself should be rolled back. Operators must stop the affected signature progression, investigate the packet/version evidence, and use the separate Phase 7 recovery workflow only when the template release itself is defective.

## Evidence checked

The audit reads the newest OTP packets and their generated versions, then evaluates:

- Phase 4 transaction-readiness enforcement;
- generated-version identity and content fingerprint;
- operational versus specialist attorney approval authority;
- stale approvals after content/version changes;
- lock/signing preparation state; and
- sent, partially signed or completed packets without valid approval evidence.

The Legal Documents overview shows the gate, score, governed packet count, action count, four assurance checks, and up to six critical/warning records with their next action.

The audit defaults to the newest 100 OTP packets. If more packets exist, it marks the result incomplete instead of presenting the partial sample as an organisation-wide pass.

## Verification

```bash
npm run test:otp-assurance-phase8
```

This includes the Phase 8 decision model, the existing legal clause-pack operational diagnostics contract, and the Phase 7 rollback-safety regression.
