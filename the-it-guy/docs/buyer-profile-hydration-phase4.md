# Buyer Profile Hydration - Phase 4

## Objective

The Buyer Profile workspace should hydrate from the true buyer onboarding data model, not from the offer flow. It should combine all available buyer onboarding sources so partial records do not hide useful lead or transaction context.

## Hydration Priority

Buyer profile form data now merges sources in this order:

1. Raw lead payload buyer onboarding fallback
2. Lead-level buyer onboarding fallback
3. Transaction onboarding prefill
4. Submitted transaction onboarding

Later sources win when they contain a value. Empty submitted fields do not erase useful fallback values during hydration, but saved agent edits can intentionally clear fields.

## Persistence Boundary

Saving Buyer Profile now writes to both:

- CRM lead `rawEnquiryPayload.buyerOnboarding`, so the lead workspace reloads with the latest profile snapshot.
- Supabase `onboarding_form_data` by `transaction_id`, so downstream buyer profile, OTP, document, finance, and attorney flows read the same canonical transaction-backed form data.

If Supabase or the optional `onboarding_form_data` table is unavailable, the lead save still keeps the CRM payload current. Real Supabase errors from an existing table still surface to the agent.

## Flow Separation

This phase does not change the offer send path. Offer links remain separate from buyer onboarding links, and Buyer Profile hydration reads buyer onboarding/profile payloads only.
