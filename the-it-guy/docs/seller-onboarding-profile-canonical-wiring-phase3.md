# Seller Onboarding Profile Canonical Wiring - Phase 3

## Purpose

Wire seller profile saves to the Phase 2 canonical persistence helper so profile edits update the seller onboarding source row before the lead snapshot is refreshed.

## Implemented Flow

`handleSaveSellerLeadEditDetails` now:

1. Builds the seller profile form data from the edit modal.
2. Resolves the linked private listing id from `selectedLeadLinkedListing` or the selected lead.
3. Resolves the seller onboarding token from the selected lead, existing onboarding snapshot, raw payload, or linked listing.
4. Calls `persistSellerProfileOnboardingFormData` when Supabase is configured and a listing id or token is available.
5. Uses returned canonical `private_listing_seller_onboarding.form_data` as the seller onboarding snapshot source.
6. Falls back to the previous local merge when canonical persistence is unavailable, preserving local/mock behavior.
7. Persists the refreshed seller onboarding snapshot back to the lead and raw enquiry payload.

## Result

Seller profile edits now flow back into:

- `private_listing_seller_onboarding.form_data`

Then the lead snapshot mirrors that canonical form data:

- `lead.sellerOnboarding.formData`
- `lead.seller_onboarding.form_data`
- `rawEnquiryPayload.sellerOnboarding`
- `rawEnquiryPayload.seller_onboarding`

## Remaining Follow-Up

Phase 4 should harden the field-level guardrails, especially explicit clearing behavior and any seller profile fields that should never overwrite disclosure/onboarding sections.
