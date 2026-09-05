# Staging release record — 5 September 2026

## Deployment

| Field | Value |
| --- | --- |
| Environment | Vercel Preview (designated staging lane) |
| Deployment | `dpl_FmhoS2dptHyW4avDK6nJ8vhKKo6E` |
| Staging URL | `https://bridge-ndl75xu5l-alexs-projects-f5496a21.vercel.app` |
| Deployed source commit | `695cb3c61` — Rental portal migration reconciliation |
| Production impact | None |

## Environment checks

- The Preview `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` values were verified as different from Production without exposing either value.
- Vercel built the release candidate successfully, including the bundle budget and schema-compatibility checks.
- `GET /tenant/staging-smoke` returned `200` through the SPA rewrite.
- Both token-protected portal APIs correctly returned `401` without a token:
  - `/api/public/rental-tenant-portal`
  - `/api/public/rental-landlord-portal`

## Release gate still open

The Preview Supabase migration ledger has not yet been authenticated or reconciled. Do not issue tenant or landlord access links in staging until the managed migration batch, including `20260905120250_rental_portal_foundation.sql`, has been applied and verified there.

Use this exact preview as the Phase 4 application-validation target. A permanent custom staging domain was not assigned; the immutable Vercel deployment URL is the release identifier for this candidate.
