# OTP Template vNext Phase 2 Route Split

Generated: 2026-08-03T00:00:00.000Z
Version: otp_template_route_split_phase2_v1
Status: OTP_TEMPLATE_ROUTE_SPLIT_READY_FOR_RUNTIME_WIRING
Mutated data: false

## Decision

OTP routing is now split into two deterministic generation targets:

| Route | Selected template key | Use case |
| --- | --- | --- |
| `resale_existing_property` | `otp_resale_existing_property_v1` | Normal existing-property / resale transactions |
| `new_development` | `otp_new_development_v1` | Developer, off-plan or new-development transactions |

The transition template `otp_default_v1` remains a starter/fallback only and is not selected by the Phase 2 route splitter.

## Routing Rules

Explicit route metadata wins when it is clean:

- `otp_document_variant: resale_existing_property`
- `otp_document_variant: new_development`
- aliases such as `normal_sale`, `off_plan`, `development_sale`

New-development is inferred when the input contains development signals:

- `is_new_development`
- `development_id`
- `property.title_type: new_development_unit`

If no route signal is present, the route defaults to `resale_existing_property`.

## Conflict Rule

If an input explicitly asks for a resale OTP but also contains development identity/unit signals, the decision is blocked. That prevents a new-development transaction from silently receiving normal resale wording.

## Routing Scorer

The shared legal template router now treats OTP document variant metadata as a first-class route dimension. A resale route cannot score a new-development template as compatible, and a new-development route cannot score a resale template as compatible.

## Verification

Run:

```bash
npm run test:otp-template-route-split-phase2
npm run verify:otp-template-vnext
```
