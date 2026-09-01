# Commercial canonical backfill

Phase 6 prepares existing commercial records for the canonical category fields
introduced in Phase 3.

The migration is intentionally conservative:

- It never overwrites a populated canonical column.
- For a linked property, it uses only the most recently updated listing's legacy
  metadata as a source.
- It copies listing-level market terms to `commercial_listings` first.
- It copies physical-property facts to `commercial_properties` before removing
  the matching legacy listing-metadata keys.
- A malformed legacy numeric value is ignored rather than causing a cast error
  or being replaced with zero.
- Rows without a candidate legacy value are not updated.

Apply [the Phase 3 schema migration](/Users/alexanderlandman/the-it-guy/supabase/migrations/20260901143358_property24_category_listing_facts.sql) first, then apply
[the Phase 6 backfill](/Users/alexanderlandman/the-it-guy/supabase/migrations/20260901145225_property24_commercial_canonical_backfill.sql).

This is an Arch9 data-normalisation step only. It neither calls Property24 nor
unblocks publishing for non-residential categories.
