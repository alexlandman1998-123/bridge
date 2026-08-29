# Phase 8: Multi-profile South African originator acceptance

Phase 8 executes every supported applicant, purchaser-entity, and employment combination against multiple requirement profiles.

## Current certification fixtures

- Published South African baseline.
- Representative strict-income overlay.
- Representative enhanced company/trust authority overlay.

These representative overlays test the configuration mechanism. They do not claim to reproduce the private requirements of OOBA, BetterBond, banks, or any other commercial originator.

## Certification rules

- Each profile runs all 54 scenarios.
- Repeated resolution must produce identical requirement fingerprints.
- Profiles may add or strengthen requirements but may never weaken the baseline.
- Every real profile must identify its policy owner, version, effective period, approval reference, jurisdiction, and policy source.
- Expired, disabled, unsupported, or unowned profiles fail certification.
- Credit decisions and lender approvals may not be inferred from requirement configuration.
- The report states `requirements_resolved_not_credit_approved` for every scenario.

The built-in suite executes 162 scenario/profile combinations. New approved originator profiles can be supplied to the same runner without adding originator-specific branches to application code.

Run `npm run test:bond-originator-multi-profile-acceptance-phase8`.
