# Seller Onboarding Source Of Truth - Phase 1

## Purpose

Confirm the current seller onboarding/profile data boundaries before adding two-way profile synchronization.

## Canonical Seller Onboarding Store

The canonical seller onboarding row is `public.private_listing_seller_onboarding`.

- Keyed by `private_listing_id`.
- Token-addressable through `token`.
- Stores submitted/draft answers in `form_data`.
- Has one row per private listing through `private_listing_seller_onboarding_listing_unique_idx`.

Reference:

- `sql/20260509_private_listing_foundation.sql` defines `private_listing_seller_onboarding` with `private_listing_id`, `token`, `form_data`, `status`, and `submitted_at`.

This is intentionally different from buyer onboarding, which uses `public.onboarding_form_data` keyed by `transaction_id`.

## Current Write Paths

### Seller onboarding progress save

`updatePrivateListingSellerOnboardingProgress` writes draft/progress data through `bridge_update_private_listing_seller_onboarding_progress`.

Fallback behavior, when the RPC is unavailable, directly updates:

- `private_listing_seller_onboarding.status`
- `private_listing_seller_onboarding.form_data`
- `seller_type`
- `ownership_structure`
- `marital_regime`

Reference:

- `src/services/privateListingService.js`
- RPC call: `bridge_update_private_listing_seller_onboarding_progress`
- Fallback update: `.from('private_listing_seller_onboarding').update({ form_data: nextFormData })`

### Seller onboarding submit

`completePrivateListingSellerOnboarding` calls `bridge_complete_private_listing_seller_onboarding`.

The RPC:

- resolves the onboarding row by token
- marks the row `completed`
- merges submitted answers into `private_listing_seller_onboarding.form_data`
- updates `private_listings.seller_onboarding_status`
- patches the matching lead to `Seller Onboarding Submitted`

Reference:

- `src/services/privateListingService.js`
- `sql/20260511_seller_portal_token_rpc.sql`

## Current Read/Hydration Paths

### Public seller onboarding page

The seller onboarding page hydrates form data from the listing/onboarding payload:

- `listing.sellerOnboarding.formData`
- `listing.seller_onboarding.form_data`

Reference:

- `src/pages/SellerOnboarding.jsx`

### Private listing services

Private listing service helpers fetch seller onboarding rows by token/listing id and merge persisted `form_data` into listing payloads.

Reference:

- `getSellerOnboardingFormData`
- `fetchSellerPortalOnboardingRowByToken`
- `mergeSellerPortalOnboardingFormData`
- `fetchOnboardingRowsForListings`

### Agency pipeline seller lead/profile view

The agency pipeline reconciles completed seller onboarding by token or linked listing id.

It reads:

- `private_listing_seller_onboarding.form_data`

Then patches the selected lead snapshot:

- `selectedLead.sellerOnboarding.formData`
- `sellerOnboardingStatus`
- `listingId`
- lead `stage` / `status`

Reference:

- `src/pages/agency/AgencyPipelinePage.jsx`
- `reconcileSellerOnboardingCompletion`

## Current Divergence

Seller onboarding submission flows into the seller profile/lead snapshot.

However, seller profile edits currently update:

- lead `rawEnquiryPayload.sellerOnboarding`
- lead `sellerOnboarding`
- lead top-level seller/contact fields
- CRM contact fields

The profile edit handler does not currently persist the merged profile form data back into `private_listing_seller_onboarding.form_data`.

Reference:

- `src/pages/agency/AgencyPipelinePage.jsx`
- `handleSaveSellerLeadEditDetails`

## Phase 1 Conclusion

The Phase 2 target should be:

Add a canonical seller profile persistence helper that updates `private_listing_seller_onboarding.form_data` by linked listing id or seller onboarding token, then updates the lead snapshot from the merged canonical form data.

This keeps the current submit-to-profile behavior intact and closes the weaker reverse direction: profile edit to canonical seller onboarding row.
