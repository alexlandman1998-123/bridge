# Transaction Journey Alignment: Phase 4

Phase 4 migrates the production seller transaction journey to the canonical snapshot and shared tracker introduced in Phase 3.

## Seller boundaries

The seller portal contains two legitimate workflows:

- Listing progress covers onboarding, mandate, listing activation, and listing documents.
- Sale progress covers the transaction from signed OTP through registration.

Listing progress remains unchanged. Once a seller has a linked transaction, Sale Progress uses `transactionJourneySnapshot`, projected with the seller audience role, and renders `TransactionJourneyTracker`.

## Detailed progress

The seller Progress page now shows the shared six-stage tracker and current workflow item. Its existing educational panels, FAQs, participant details, and seller actions remain available. The selected educational stage is seeded from the canonical milestone; the former eleven-stage rail is only rendered as a legacy fallback when a canonical presentation model is unavailable.

## Compatibility

Transactions that cannot return a snapshot continue through the existing seller sale model. Seller leads without a linked transaction continue to see listing progress and do not receive a synthetic transaction journey.

