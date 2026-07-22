# Tomorrow Morning Phase 4 - Seller Onboarding Completion

Generated: 2026-07-20

## Objective

Prove the seller onboarding link can be completed and that accepting the agency's preferred transfer attorney creates the pre-instruction transfer-attorney allocation needed for the mandate and offer workflow.

## Implementation

Added `the-it-guy/scripts/verify-launch-seller-onboarding-completion.mjs` and package script:

```bash
npm --prefix the-it-guy run verify:launch-seller-onboarding-completion
```

The script is scoped to the approved staging Supabase project `isdowlnollckzvltkasn`. It does not print secrets.

The script:

- signs in as the agency runtime actor;
- confirms Young Law Inc is the active transfer-attorney assignment option for Kingstons;
- loads the Phase 3 launch verification listing and onboarding record;
- resets that onboarding record to `sent` so the completion trigger can be exercised repeatedly;
- submits seller onboarding through `bridge_complete_private_listing_seller_onboarding`;
- verifies the listing and onboarding row are `completed`;
- verifies the database created or updated one active `private_listing_role_players` transfer-attorney allocation;
- verifies the allocation points to the preferred partner, attorney organisation, and canonical role configuration.

## Result

Status: `SELLER_ONBOARDING_COMPLETION_READY`

Launch verification record:

- Organisation: Kingstons Real Estate (`ec19d0a6-bcba-4eef-aa72-9972de88204d`)
- Listing: `PHASE3-LAUNCH-SELLER-ONBOARDING`
- Listing ID: `0091d90c-83d9-41f2-b458-e55b4878184f`
- Listing status: `onboarding_completed`
- Seller onboarding status: `completed`
- Onboarding ID: `7fba4c66-4944-498b-b65a-e63f935b288d`
- Seller email: `seller.phase3.launch@example.test`

Accepted transfer attorney:

- Attorney firm: Young Law Inc (`c44ec08e-dc04-4f7b-9bdd-db5252f62f25`)
- Preferred partner: `c4bbeb1e-68fe-47df-b2ec-8eca34479921`
- Role configuration: `bc5054e9-039e-45b1-be48-5cf873c9d32c`

Created allocation:

- Allocation ID: `c2360bb4-a936-466b-a44d-4ddb47b78958`
- Status: `awaiting_buyer`
- Selection source: `agency_recommended`
- Metadata source: `seller_onboarding_acceptance`
- Active transfer-attorney allocations for listing: `1`

## Verification

```bash
npm --prefix the-it-guy run verify:launch-seller-onboarding
npm --prefix the-it-guy run verify:launch-seller-onboarding-completion
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
