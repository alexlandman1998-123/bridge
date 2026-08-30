# Rentals Phase 15 — Controlled internal marketing pilot

Release 1 is gated by `rentalInternalMarketingEnabled` and an explicit `pilotVacancyIds` cohort. The pilot covers internal draft, review, approval, pause and archive only.

It has no portal, feed, listing or provider calls. The dry-run classifier emits `review_link`, `do_not_convert`, and reasons for legacy rental data; it never mutates a legacy listing.
