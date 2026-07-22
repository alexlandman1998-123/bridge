# Tomorrow Morning Phase 2 - Transfer Attorney Configuration

Generated: 2026-07-20

## Objective

Unblock the seller-onboarding path by ensuring Kingstons Real Estate can select and resolve an active connected transfer attorney before sending seller onboarding links.

## Implementation

Added `the-it-guy/scripts/repair-launch-transfer-attorney.mjs` and package script:

```bash
npm --prefix the-it-guy run repair:launch-transfer-attorney
```

The repair is intentionally scoped to the approved staging Supabase project `isdowlnollckzvltkasn`. It does not print secrets.

The script:

- signs in with the configured agency runtime actor;
- ensures Kingstons Real Estate is connected to Young Law Inc through `organisation_partners`;
- resolves the seller-onboarding transfer-attorney compatibility identity through `bridge_resolve_seller_connected_transfer_attorney`;
- marks the resulting `organisation_preferred_partners` row active/default for `transfer_attorney`;
- links the canonical `organisation_partner_roles` row to both the accepted relationship and preferred-partner identity;
- verifies `bridge_list_organisation_partner_assignment_options` returns the attorney as an active option.

## Result

Status: `LAUNCH_TRANSFER_ATTORNEY_READY`

Configured launch attorney:

- Organisation: Kingstons Real Estate (`ec19d0a6-bcba-4eef-aa72-9972de88204d`)
- Attorney firm: Young Law Inc (`c44ec08e-dc04-4f7b-9bdd-db5252f62f25`)
- Relationship: `282cd441-1d9e-4b48-90bd-8c75de5230b1`
- Preferred partner: `c4bbeb1e-68fe-47df-b2ec-8eca34479921`
- Role configuration: `bc5054e9-039e-45b1-be48-5cf873c9d32c`
- Assignment option count: `1`

## Verification

```bash
npm --prefix the-it-guy run repair:launch-transfer-attorney
npm --prefix the-it-guy run test:lead-pilot-environment
```

Readiness result:

- Status: `READY`
- Passes: `10`
- Warnings: `0`
- Blockers: `0`
- Critical: `0`

Runtime readiness remained green:

- Status: `READY`
- Passes: `29`
- Warnings: `0`
- Blockers: `0`
- Critical: `0`
