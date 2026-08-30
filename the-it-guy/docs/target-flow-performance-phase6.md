# Target flow performance — Phase 6

Phase 6 adds a client-only release gate for the routes most affected by the
cold-load work: Transactions, Listings, listing detail and lead detail.

Each completed route records first useful content, observable Supabase request
count, duplicate requests, slow requests, and route-chunk transfer data in a
bounded session history. It never sends telemetry, starts a poll, or changes
database state. A flow cannot pass the release gate without three passing
samples for every target route.

Use `node scripts/target-flow-performance-phase6.test.mjs` to verify the
contract. Runtime evidence is available in
`sessionStorage['arch9:route-performance-history']`.
