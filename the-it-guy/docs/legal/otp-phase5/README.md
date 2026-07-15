# OTP Phase 5: certified reference transactions

Phase 5 certifies a governed OTP template against representative South African transactions before it can be published or used by the governed generation path.

## Reference matrix

The matrix contains six understandable scenarios:

1. Individuals, cash and full title.
2. Married individuals, bond finance and a sectional-title estate.
3. Companies, bond finance and VAT-inclusive treatment.
4. Trusts, cash, sectional title and VAT-exclusive treatment.
5. Combination finance, a linked property sale and early occupation.
6. An existing lease with potentially zero-rated VAT treatment.

Together these scenarios exercise all 23 publishable conditional clause packs.

Each scenario now runs the Phase 4 assembly contract. A scenario fails when required wording is hidden, inactive wording leaks into the document, wording is duplicated, approval is missing, the legal core or signing is absent, or the scenario's facts conflict.

## Certification binding

A passing matrix result records a deterministic fingerprint of the exact template sections. The fingerprint includes:

- section order and identity;
- legal wording;
- visibility conditions;
- clause-pack mappings; and
- approval and lock state.

At generation time Bridge recomputes the fingerprint. If the template has changed since certification, the saved pass is stale and generation is blocked. An unsupported certification contract also fails closed.

The fingerprint is a change detector and audit reference; access control and immutable generated-document provenance remain the security boundary.

## Publishing journey

The Legal Templates screen runs the matrix against the current draft and displays:

- scenarios passed;
- clause packs exercised;
- the current certification fingerprint; and
- the first scenario-specific failure.

Publishing stores the certification key, fingerprint, result counts and validation time. Any subsequent wording, routing, ordering or approval change requires a new passing result.

## Runtime and signing release

- Phase 5 certification is a non-bypassable generation prerequisite for adopted templates.
- Generated versions retain their template, clause selection and render fingerprints.
- Sending a governed OTP for signature still requires approval bound to the exact generated version and content fingerprint.

## Verification

```bash
npm run test:otp-certification-phase5
npm run test:otp-runtime-phase4
npm run test:otp-governance-phase3
npm run test:otp-composition-phase2
npm run test:otp-legal-baseline
npm run build
```
