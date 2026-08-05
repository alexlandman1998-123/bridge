# OTP Template vNext Phase 4 Resale Legal Content

Generated: 2026-08-05T00:00:00.000Z
Version: otp_resale_legal_content_phase4_v1
Status: OTP_RESALE_LEGAL_CONTENT_READY_FOR_COUNSEL_REVIEW
Route: resale_existing_property
Mutated data: false

## Purpose

Phase 4 converts the Phase 1 resale reference structure into a resale-only legal-content contract for sections 3 through 30.

This phase does not approve legal wording. It creates deterministic, counsel-review-ready content coverage so later PDF layout, content scanning, launch readiness and runtime integration cannot accidentally ship a thin or mixed-route OTP.

## Coverage

The contract covers all 28 reference legal sections:

| No. | Reference section |
| --- | --- |
| 3 | definitions |
| 4 | interpretations |
| 5 | sale |
| 6 | acceptance |
| 7 | purchase_price |
| 8 | the_property |
| 9 | risk |
| 10 | transfer |
| 11 | occupation |
| 12 | suspensive_conditions |
| 13 | warranties |
| 14 | nomination_capacity_parties |
| 15 | commission |
| 16 | certificates |
| 17 | rates_taxes_consumption_charges |
| 18 | breach |
| 19 | cooling_off |
| 20 | domicilium_notices |
| 21 | consent_to_jurisdiction |
| 22 | marital_status_purchaser |
| 23 | special_conditions |
| 24 | costs |
| 25 | sale_board |
| 26 | whole_agreement |
| 27 | non_variation |
| 28 | non_waiver |
| 29 | severability |
| 30 | applicable_law |

## Locked Rules

- Every section is scoped to `resale_existing_property`.
- Every section carries the reference DOCX path, SHA-256 hash, reference section number and reference section key.
- Every placeholder must be canonical in the merge-field registry and present in the OTP field registry.
- Development-only fields are forbidden in resale legal content.
- Every placeholder source owner must be declared on the section.
- Every section remains marked as draft-only, legal-review required and counsel-approval required.
- The content contract is paraphrased counsel-review wording, not a verbatim reference copy.

## Added Registry Coverage

Phase 4 also adds missing buyer capacity fields to the OTP field registry:

- `buyer_spouse_full_name`
- `buyer_spouse_consent_required`
- `buyer_representative_name`
- `buyer_representative_capacity`

These already existed in the canonical merge-field registry, but Phase 4 needs them explicitly owned by buyer onboarding before capacity, nomination and marital-status wording can use them.

## Verification

```bash
npm run test:otp-resale-legal-content-phase4
npm run verify:otp-template-vnext
```

## Boundary

Phase 4 does not mutate Supabase, publish templates, approve legal text, create the new-development legal content, or bypass rendered PDF validation. New-development legal wording remains a separate phase.
