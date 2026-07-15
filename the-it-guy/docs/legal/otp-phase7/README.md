# OTP Phase 7 — Post-activation operations

Phase 7 adds an operational safety layer around the governed OTP introduced in Phases 1–6. It does not alter approved legal wording or automatically change the live template.

## What operators see

The OTP overview now reports a plain-language post-activation state:

- **Healthy · rollback ready** — the governed OTP is live and the recorded prior OTP has passed every recovery check.
- **Attention required** — the live route is stable, but one or more recovery checks failed.
- **Critical recovery issue** — the recorded governed OTP is no longer the active default and the recovery route is not safe.
- **Available after activation** — no governed activation with a rollback anchor exists yet.

The checks verify that the current template is the live default, the activation record belongs to it, and the rollback target still exists, belongs to the same organisation, is a standard OTP, and remains eligible for restoration.

## Safe rollback workflow

An authorised organisation administrator can choose **Restore previous OTP** from the legal-template editor only when all checks pass. The confirmation dialog:

1. names the version that will stop serving new OTPs;
2. names the previous version that will become live;
3. explains that existing transactions and generated documents are unchanged; and
4. requires an operational reason of at least 12 characters.

The browser calls `rollback_governed_otp_template` once. The database function locks and revalidates both templates, changes the default routing, and inserts the audit event in a single transaction. Any failed validation or audit insert rolls back the entire operation.

Approved template content is never edited. The displaced governed version remains in the legal-template library for investigation and a future reviewed release.

## Database prerequisite

Deploy the Supabase migrations through `202607150001_governed_otp_atomic_rollback.sql` before exposing the recovery control in production. The operation deliberately fails closed with no template changes when the RPC is not installed. It also depends on the existing `security_audit_events` foundation migration.

## Verification

Run:

```bash
npm run test:otp-operations-phase7
```

The suite covers a healthy recovery route, missing targets, cross-organisation attempts, withdrawn targets, and the audit payload. Run the Phase 1–6 commands as regression coverage before release.
