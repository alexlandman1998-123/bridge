# Rentals Phase 19 — Pipeline contract

Rental leads use the existing CRM classification from Phase 18 and move through `new → contacted → viewing → application`. The model exposes transition validation, next-action copy and summary counts without altering default Sales pipelines. Persist the classification through the confirmed CRM extension point before enabling live pipeline writes.
