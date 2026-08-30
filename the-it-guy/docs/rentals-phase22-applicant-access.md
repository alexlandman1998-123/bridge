# Rentals Phase 22 — Applicant access

Public application access uses opaque 256-bit tokens represented by a SHA-256 hash at rest, expiry, revocation and one-application scope. Raw tokens are issuance-only and never persisted. The public endpoint validates the token server-side and accepts only version-checked draft saves.
