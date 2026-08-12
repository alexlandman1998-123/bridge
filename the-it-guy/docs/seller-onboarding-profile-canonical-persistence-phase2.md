# Seller Onboarding Profile Canonical Persistence - Phase 2

## Purpose

Add the write-back primitive needed to keep seller profile edits synchronized with the seller onboarding source of truth.

## Added Helper

`persistSellerProfileOnboardingFormData` now lives in `src/services/privateListingService.js`.

It accepts:

- `listingId`
- `token`
- `formData`
- optional status/entity metadata
- `allowEmptyOverride`

It resolves the seller onboarding row by seller onboarding token or linked `private_listing_id`, then writes the merged result into:

- `private_listing_seller_onboarding.form_data`

## Merge Behavior

The helper preserves existing onboarding answers by default.

- Blank strings are skipped.
- Empty arrays are skipped.
- Empty objects are skipped.
- Nested objects are merged instead of replaced.
- `allowEmptyOverride: true` can be used later for explicit clearing behavior.

## Insert Behavior

If a seller onboarding row does not exist but a linked private listing id is available, the helper creates one with:

- generated seller onboarding token
- `in_progress` default status
- merged profile form data

It does not create a row from token alone when no listing id can be resolved.

## Phase 3 Wiring Target

`handleSaveSellerLeadEditDetails` should call this helper before updating the lead snapshot, then use the returned canonical `form_data` as the source for:

- `lead.sellerOnboarding.formData`
- `lead.seller_onboarding.form_data`
- `rawEnquiryPayload.sellerOnboarding`
- `rawEnquiryPayload.seller_onboarding`
