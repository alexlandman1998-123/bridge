# OTP legal baseline

This directory holds the Phase 1 evidence for the exact Offer to Purchase configured in Bridge.

`current.json` is the immutable, hash-protected legal snapshot. It records every section, its wording, variables, classification, and raw activation condition. `attorney-review.json` is deliberately separate so legal review decisions cannot modify the evidence being reviewed.

The snapshot also records machine-readable `findings`. A `blocking` finding means the captured OTP is not ready to become the approved standard; a `warning` needs an explicit review decision but does not make the export invalid. Findings are evidence, not automatic legal conclusions.

The four classifications are:

- `core_wording`: standard wording included in the ordinary OTP.
- `conditional_clause`: wording included only when an onboarding or transaction fact activates it.
- `transaction_data`: schedules or data-driven sections populated from transaction variables.
- `signing`: execution, signature, witness, or initial fields.

## Export the live OTP

Run this from the application directory with the appropriate environment file:

```sh
node --env-file=.env.production.local scripts/export-otp-legal-baseline.mjs \
  --template-id 5eb54da8-6e9a-4364-9dc9-083f72cd0791 \
  --environment production
```

Re-exporting unchanged content preserves its attorney review. Changed content produces a new baseline hash and resets the attorney review to `pending`. Never carry approval across a changed hash.

## Attorney review

A qualified South African property attorney must review the actual legal text in `current.json` and set a decision for every entry in `attorney-review.json`:

- `approved`: wording and, for conditional clauses, the activation fact are approved.
- `changes_requested`: legal or activation-rule changes are required; explain them in `notes`.
- `pending`: not reviewed yet.

Only after every section is approved may the reviewer set the overall status to `approved`, enter their name and role, and record `reviewedAt`. This workflow records legal approval; it does not substitute software-team judgment for legal advice.

## Verification

```sh
npm run verify:otp-legal-baseline
npm run verify:otp-legal-baseline:approved
```

The first command verifies structure, review linkage, and snapshot hash. The second is the release gate: it requires completed attorney approval and refuses any unresolved `blocking` finding.
