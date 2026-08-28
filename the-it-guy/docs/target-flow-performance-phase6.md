# Target flow performance — Phase 6

Phase 6 turns the transaction, listing, listing-detail, and lead-detail improvements into a release gate.

Each completed route trace is evaluated against an explicit first-useful-content, request-count, duplicate-request, schema-error, and slow-request budget. Listing-summary and in-memory lead handoffs use a stricter fast-path budget: useful content must render within 500 ms and before any data request completes.

The verdict is attached to the existing `arch9:route-performance` event and the bounded `arch9:route-performance-history` session history. It does not add a Supabase write, polling timer, realtime channel, or schema object.

The aggregate gate requires at least three samples for every target flow and fails closed when coverage is missing. Any failed sample blocks the gate.

Run `npm run verify:target-flow-performance-phase6` to verify the complete Phase 0–6 contract.
