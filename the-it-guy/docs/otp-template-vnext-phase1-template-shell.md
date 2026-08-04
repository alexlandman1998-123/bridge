# OTP Template vNext Phase 1 Template Shell

Generated: 2026-08-03T00:00:00.000Z
Version: otp_template_shell_target_phase1_v1
Status: OTP_TEMPLATE_SHELL_TARGET_READY_FOR_PERSISTENCE
Mutated data: false

## Decision

The OTP template shell is now bound to the two frozen Phase 0 route defaults:

| Route | Target template key | Shell status |
| --- | --- | --- |
| `resale_existing_property` | `otp_resale_existing_property_v1` | Ready for persistence |
| `new_development` | `otp_new_development_v1` | Ready for persistence |

Each target shell uses the same branded document chrome expected from the mandate/disclosure standard:

- logo / brand header in the top-left
- document route, reference and version details in the top-right
- Offer to Purchase title band below the header
- route-specific transaction summary
- agency footer
- route-specific signing zone

## Route Differences

The resale shell is for normal existing-property sales. It includes seller, existing-property, purchase-price and seller-signature placeholders.

The new-development shell is for developer/off-plan transactions. It includes developer, development, unit, VAT-aware purchase-price and developer-signature placeholders.

## Publication Boundary

Phase 1 does not publish live defaults or mutate Supabase. It prepares persistence-ready shell records and keeps these publication gates required:

- route template persisted
- content scan current
- render validation current
- counsel approval recorded
- organisation default sync ready

## Verification

Run:

```bash
npm run test:otp-template-shell-target-phase1
npm run verify:otp-template-vnext
```
