# OTP Template vNext Phase 9 Runtime Enforcement, Live Audit, And Migration

Generated: 2026-08-03T00:00:00.000Z
Status: OTP_RUNTIME_ENFORCEMENT_READY_FOR_LIVE_AUDIT

## What Changed

Phase 9 adds runtime enforcement for the OTP content gate and launch-readiness rules.

- OTP generation now decorates validation with `otpTemplateContentGate`.
- OTP generation now decorates validation with `otpTemplateLaunchReadiness`.
- OTP content-gate blockers become critical validation issues with source `otp_template_content_gate`.
- OTP launch-readiness blockers become critical validation issues with source `otp_template_launch_readiness`.
- Generation throws specific OTP errors for content-gate and launch-readiness blocks.
- Generation, draft source context, render provenance, and audit events now carry OTP gate/readiness metadata.
- A read-only live audit script can inspect live OTP templates before any corrective migration is prepared.
- Corrective migration planning is explicitly blocked unless it is bound to a completed live audit output.

## Runtime Blockers

- Wrong-route OTP clauses at generation time.
- Missing required OTP content families.
- Empty or unscannable OTP template sections.
- Unapproved generic fallback for a resale or new-development transaction.
- Stale or missing OTP content scan.
- Blank-render risk and missing source-owner metadata on live templates.

## Live Audit

Run the live audit only with the correct Supabase environment:

```bash
npm run audit:otp-template-live-readiness
```

The audit is read-only and writes `docs/otp-template-vnext-phase9-live-audit.md` by default.

## Corrective Migration Boundary

No OTP corrective migration should be created from assumptions. The migration plan must receive an audit object with `auditCompleted: true` and `auditVersion: otp_template_live_audit_phase9_v1`.
