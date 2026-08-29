# Phase 5: Downloadable originator application pack

Phase 5 turns the canonical application into a versioned, downloadable originator pack.

## Guarantees

- The submission snapshot includes the purchaser entity, all co-applicants, and all sureties.
- Company and trust authority details appear in the PDF application pack.
- The assigned originator name and logo are resolved explicitly and embedded in the export.
- Missing custom branding never falls back to another originator's logo or wordmark.
- Draft packs remain downloadable for operational review and are visibly marked as drafts.
- An `originator_ready` pack fails closed when the transaction identity, participant snapshot, originator name, originator logo, or Phase 4 completeness contract is missing.
- Every pack has a stable contract version and deterministic manifest fingerprint.

No database migration is required. Phase 5 consumes the existing application snapshot, originator assignment, and branding fields.

Run `npm run test:bond-originator-downloadable-pack-phase5`.
