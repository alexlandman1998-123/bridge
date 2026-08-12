# Seller Onboarding Profile Merge Guardrails - Phase 4

## Purpose

Protect completed seller onboarding/disclosure data when an agent saves partial seller profile edits.

## Implemented Guardrails

`persistSellerProfileOnboardingFormData` now merges profile edits with these defaults:

- Blank strings do not overwrite existing values.
- Empty arrays do not overwrite existing values.
- Empty objects do not overwrite existing values.
- Nested objects merge by path, preserving untouched nested fields.
- Protected onboarding/document/disclosure sections are ignored by default.

## Protected Sections

Seller profile edits do not overwrite these canonical form-data areas unless a future caller intentionally opts in:

- `property_disclosure`
- `property_condition_disclosure`
- `mandatory_disclosure`
- `seller_disclosure`
- generated/signed disclosure sections
- required/document sections
- canonical seller fact sections

This protects the seller onboarding answers and generated disclosure/document state from accidental profile modal saves.

## Explicit Clearing

The helper now supports `explicitClearFields`.

That gives Phase 5+ a safe way to clear a specific field without turning every blank profile field into a destructive overwrite. Example intent:

```js
persistSellerProfileOnboardingFormData({
  listingId,
  formData: { alternativeNumber: '' },
  explicitClearFields: ['alternativeNumber'],
})
```

Global `allowEmptyOverride` still exists, but the seller profile save handler does not use it.

## Current Seller Profile Save Behavior

`handleSaveSellerLeadEditDetails` uses the default guarded merge:

- no protected-section override
- no global empty override
- profile edits write through to canonical seller onboarding
- lead snapshot is refreshed from the canonical returned `form_data`
