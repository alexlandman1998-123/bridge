# Tomorrow Morning Phase 3 - Seller Onboarding Link

Generated: 2026-07-20

## Objective

Prove Kingstons Real Estate can generate a seller onboarding link that resolves through the public seller portal and carries the configured transfer attorney from Phase 2.

## Implementation

Added `the-it-guy/scripts/verify-launch-seller-onboarding-link.mjs` and package script:

```bash
npm --prefix the-it-guy run verify:launch-seller-onboarding
```

The script is scoped to the approved staging Supabase project `isdowlnollckzvltkasn`. It does not send outbound email and does not print secrets.

The script:

- signs in as the agency runtime actor;
- verifies Young Law Inc is the active transfer-attorney assignment option for Kingstons;
- creates or reuses one launch verification private listing;
- writes a `sent` seller onboarding row with a real onboarding token;
- marks the listing as `onboarding_sent`;
- verifies the public seller portal RPC resolves the token, listing, onboarding record, and preferred attorney payload.

## Result

Status: `SELLER_ONBOARDING_LINK_READY`

Launch verification record:

- Organisation: Kingstons Real Estate (`ec19d0a6-bcba-4eef-aa72-9972de88204d`)
- Listing: `PHASE3-LAUNCH-SELLER-ONBOARDING`
- Listing ID: `0091d90c-83d9-41f2-b458-e55b4878184f`
- Listing status: `onboarding_sent`
- Seller onboarding status: `sent`
- Onboarding ID: `7fba4c66-4944-498b-b65a-e63f935b288d`
- Test seller email: `seller.phase3.launch@example.test`
- Transfer attorney: Young Law Inc (`c44ec08e-dc04-4f7b-9bdd-db5252f62f25`)
- Preferred partner: `c4bbeb1e-68fe-47df-b2ec-8eca34479921`
- Role configuration: `bc5054e9-039e-45b1-be48-5cf873c9d32c`

Generated onboarding link:

```text
https://app.arch9.co.za/seller/onboarding/seller-phase3-6n56cej2mrtpxjpy
```

Portal verification:

- Access state accepted token: `true`
- Listing resolved: `true`
- Onboarding resolved: `true`
- Attorney resolved: `true`

## Verification

```bash
npm --prefix the-it-guy run verify:launch-seller-onboarding
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
