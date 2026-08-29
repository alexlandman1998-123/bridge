# Rentals Phase 11 — Shared documents and activity

Rental evidence now uses a small adapter boundary rather than a second file or activity product.

- `rental_entity_documents` attaches a canonical Arch9 `document_id` to a property, unit, landlord relationship, or mandate. No file content, storage path, or document lifecycle is duplicated.
- `rental_activity_projections` is append-only, keyed by its source event, and enforces an 8 KB payload limit. Browser clients can read it but cannot manufacture or edit audit history.
- Evidence scope is resolved from the typed Rental entity to its parent property before either row can be inserted.
- The property Documents & activity panel lazy-loads only after it is opened.

Replacement/removal is represented by a new typed document link/state, leaving prior relationship evidence available for audit. The reviewed migration has not been applied from this workspace.
