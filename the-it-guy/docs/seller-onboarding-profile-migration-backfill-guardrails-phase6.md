# Seller Onboarding Profile Migration / Backfill Guardrails - Phase 6

## Objective

Historical seller leads can contain a mix of true seller onboarding submissions and link/portal/invite metadata. Backfill must not promote link-only artifacts into the canonical `private_listing_seller_onboarding.form_data` row or the Seller Profile snapshot.

## Guardrail Rules

1. Treat `private_listing_seller_onboarding.form_data`, submitted seller onboarding rows, and raw/lead snapshots with actual `formData` or `form_data` as seller onboarding data.
2. Treat seller onboarding links, seller portal links, portal invite tokens, portal session ids, and email delivery metadata as transport artifacts when they do not include onboarding form data.
3. Never backfill Seller Profile fields from seller portal invite/session metadata.
4. Use raw/lead `sellerOnboarding` only as a legacy fallback after filtering link-only artifacts.
5. Do not overwrite submitted seller onboarding/disclosure/document sections during migration. Phase 4 protected-section merge rules still apply.

## Implementation Notes

- `AgencyPipelinePage.jsx` now uses `getMigrationGuardedSellerOnboardingSnapshot`.
- Seller Profile hydration filters raw and lead seller onboarding snapshots before reading `formData`.
- Seller Profile save filters preserved seller onboarding snapshots before writing the refreshed lead/raw payload.
- Token discovery may still read legacy link metadata so an existing canonical row can be found, but the link-only snapshot is not merged as onboarding form data.

## Backfill Operating Mode

Initial migration/backfill should run in audit-first mode:

1. Count legacy seller leads with raw `sellerOnboarding` / `seller_onboarding` snapshots.
2. Split candidates into already canonical, true seller onboarding, link-only artifact, and ambiguous buckets.
3. Backfill only true seller onboarding candidates.
4. Leave link-only artifacts untouched.
5. Export ambiguous rows for manual review before any write.

Read-only audit companion:

- `scripts/sql/seller-onboarding-profile-phase6-backfill-audit.sql`

## Acceptance Criteria

- Seller Profile displays submitted/canonical onboarding first, filtered raw/lead form data second, and profile modal edits last.
- Link-only seller onboarding or portal artifacts do not become canonical `form_data`.
- No seller portal invite/session token is copied into Seller Profile form fields.
- Any live backfill is preceded by a reviewed read-only audit result.
