# OTP Template vNext Phase 0 Target Freeze

Generated: 2026-08-03T00:00:00.000Z
Version: otp_template_target_freeze_phase0_v1
Status: OTP_TEMPLATE_TARGET_FROZEN
Mutated data: false

## Decision

The current `otp_default_v1` remains a transition starter/fallback only. It is not the final launch-ready OTP standard and must not be used as proof that live OTP automation is ready.

DOCX may remain as a reference or transition source artifact while the route templates are built. It is not an approved OTP runtime output path. Live OTP automation must produce a sealed canonical packet-bound PDF through native structured rendering.

The OTP target is frozen as two first-class route templates:

| Route | Target template key | Role |
| --- | --- | --- |
| `resale_existing_property` | `otp_resale_existing_property_v1` | Primary normal/resale OTP |
| `new_development` | `otp_new_development_v1` | Primary new-development OTP |

## Launch Lock

No OTP template can be treated as a live launch candidate unless all Phase 0 launch-lock requirements are satisfied:

| Requirement | Rule |
| --- | --- |
| Route-specific template key | The template key must be one of the frozen route keys. `otp_default_v1` is blocked. |
| Canonical packet-bound PDF | Render mode must be `native_structured` and the template must explicitly require canonical packet-bound PDF output. |
| Route metadata | The template must declare `otp_document_variant`. |
| Branded shell | The route template must carry branded-shell metadata for logo, organisation details, footer positions, page numbering and website placement. |
| Current OTP content scan | The content scan must be current and passing for the exact route wording. |
| Source-owner metadata | Field-bearing content must declare ownership so buyer, seller, property, conveyancer and legal facts remain separate. |
| Render validation | PDF render validation must be current and passing. |
| Signature geometry | Route-aware signer and initials geometry must be present. |
| Counsel approval | Counsel-approved wording must be recorded before live publication. |

## Route Separation

Resale and new-development OTPs are separate legal products, not two skins over one generic template.

| Route | Required content families | Forbidden content families |
| --- | --- | --- |
| `resale_existing_property` | definitions, parties, property, purchase price, suspensive conditions, occupation/rent, fixtures/defects/disclosure, transfer/conveyancer, special conditions, offer acceptance | development unit, development defects, body corporate |
| `new_development` | definitions, parties, development unit, purchase price, suspensive conditions, development defects, body corporate, transfer/conveyancer, special conditions, offer acceptance | fixtures/defects/disclosure, occupation/rent |

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

Phase 0 does not publish live templates, mutate Supabase data, change runtime generation, or approve legal wording. It freezes the target and defines the launch lock so later phases have one enforceable source of truth.

## Verification

Run:

```bash
npm run test:otp-template-target-freeze-phase0
npm run verify:otp-template-vnext
```
