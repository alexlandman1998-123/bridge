# Legal Clause Pack Phase 8 — Operational Assurance

Phase 8 adds a read-only operational audit around the governed OTP signature-release workflow introduced in Phase 7.

## Product outcome

Platform support can run an organisation-scoped OTP release audit and distinguish:

- ordinary OTPs awaiting agency approval;
- specialist OTPs awaiting attorney approval;
- stale approvals after a version or content change;
- approvals recorded by an unauthorised role;
- approved OTPs waiting to be locked;
- approved OTPs ready to send;
- OTPs released with valid approval evidence; and
- the critical exception where a governed OTP was released without valid approval.

The audit never changes packet, version, signer, or approval data.

## Release gate

The Phase 8 gate fails when the audit finds unsafe evidence, including a governed OTP released without a valid version-bound approval or specialist approval recorded by an unauthorised role.

The gate warns while approval or attorney-review queues remain outstanding. It passes when no governed OTP has an unsafe or outstanding release state.

## Evidence

Each row reports the packet and version, lifecycle state, reviewer role, specialist review codes, approval timestamp, severity, and recommended next action. Legacy OTPs remain visible but do not fail the governed release gate.

## Operator workflow

1. Open Platform Admin → Operations Center.
2. Run **OTP release audit** for the active organisation.
3. Resolve critical rows before rollout or continued signature progression.
4. Route attorney-review rows to an attorney.
5. Re-run the audit after approvals, locking, or signature release.

