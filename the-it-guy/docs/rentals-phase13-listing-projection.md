# Rentals Phase 13 — Internal marketing record

Each Vacancy owns one versioned `rental_vacancy_marketing` record. It contains internal title, copy and features, plus a preview assembled from the canonical Vacancy, Property and Unit.

It does not read, create or update `private_listings`; no Sales listing is created and no portal payload is generated. Marketing can only become ready for review when the Vacancy is in a suitable lifecycle state, title/copy are complete and media exists.
