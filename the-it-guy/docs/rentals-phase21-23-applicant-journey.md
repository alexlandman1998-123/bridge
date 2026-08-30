# Rentals Phases 21–23 — Applications and applicant journey

`rental_applications` is the internal source of truth. Drafts are versioned and only rental staff with property access can create or update them through RLS.

Applicant links contain a random token, but only its SHA-256 hash is stored. The public route sends the token in an Authorization header to a narrow server endpoint; the endpoint exposes only the draft application and accepts only version-checked draft updates. There is no public Supabase table access and no Sales dependency.
