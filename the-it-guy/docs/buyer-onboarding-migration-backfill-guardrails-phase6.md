# Buyer Onboarding Migration / Backfill Guardrails - Phase 6

## Objective

Historical buyer records may contain a mix of true buyer onboarding state and offer-link/session artifacts. Backfill must restore the buyer onboarding profile without promoting offer data into the canonical buyer onboarding form.

## Guardrail Rules

1. Treat `/client/onboarding/:token`, `client_onboarding`, and explicit `buyer_onboarding` sources as true buyer onboarding.
2. Treat `/offers/...`, `buyer_offer_link`, `canonical_buyer_offer_link`, offer portal sessions, offer ids, and seller review links as offer-flow artifacts.
3. Never backfill Buyer Profile from offer `conditions`, offer portal metadata, seller review links, or offer session tokens.
4. Use lead/raw `buyerOnboarding` only as a legacy fallback after filtering offer artifacts.
5. Use transaction-backed `onboarding_form_data` and submitted `transaction_onboarding` rows as the trusted source of truth.
6. Do not overwrite submitted transaction onboarding data during migration. Submitted onboarding may fill gaps from lead/contact data, but backfill should not replace captured submitted fields.

## Implementation Notes

- Agency Buyer Profile hydration now passes raw/lead buyer onboarding fallbacks through `getMigrationGuardedBuyerOnboardingSnapshot`.
- The guard skips legacy snapshots that carry offer-link/session signals unless the same snapshot also has an explicit true buyer onboarding signal.
- Buyer Profile save applies the same guard before preserving existing buyer onboarding metadata, so old offer artifacts are not carried forward into the cleaned `buyerOnboarding` snapshot.

## Backfill Operating Mode

Initial migration/backfill should run in audit-first mode:

1. Count candidate buyer leads with raw/lead `buyerOnboarding` and no transaction `onboarding_form_data`.
2. Split candidates into true buyer onboarding, offer artifact, and ambiguous buckets.
3. Backfill only the true buyer onboarding bucket.
4. Leave offer artifacts untouched.
5. Export ambiguous rows for manual review before any write.

Read-only audit companion:

- `scripts/sql/buyer-onboarding-phase6-backfill-audit.sql`

## Acceptance Criteria

- Buyer profile displays true submitted onboarding first, transaction prefill second, and filtered lead/raw fallbacks last.
- Offer links remain visible only in explicit offer surfaces.
- No `/offers/...` URL is copied into `lastBuyerOnboardingLink`.
- No `buyer_offer_link` source is used as Buyer Profile form data.
