# OTP Template vNext Phase 0 Target Freeze

Generated: 2026-08-03T00:00:00.000Z
Version: otp_template_target_freeze_phase0_v1
Status: OTP_TEMPLATE_TARGET_FROZEN
Mutated data: false

## Decision

The current `otp_default_v1` remains a transition starter/fallback only. It is not the final launch-ready OTP standard and must not be used as proof that live OTP automation is ready.

The OTP target is frozen as two first-class route templates:

| Route | Target template key | Role |
| --- | --- | --- |
| `resale_existing_property` | `otp_resale_existing_property_v1` | Primary normal/resale OTP |
| `new_development` | `otp_new_development_v1` | Primary new-development OTP |

## Required Before Live Use

Each target route template must have:

- explicit `otp_document_variant` metadata
- current OTP content-scan metadata
- source-owner metadata for field-bearing sections
- current render validation
- route-appropriate branded shell
- route-appropriate signature zone
- counsel-approved wording

## Non-Goals

Phase 0 does not publish live templates, mutate Supabase data, change runtime generation, or approve legal wording. It freezes the target so later phases have one enforceable source of truth.

## Verification

Run:

```bash
npm run test:otp-template-target-freeze-phase0
npm run verify:otp-template-vnext
```

