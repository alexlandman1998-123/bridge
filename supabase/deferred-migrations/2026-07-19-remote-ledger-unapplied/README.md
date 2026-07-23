# Remote-ledger reconciliation quarantine

Captured against Supabase project `isdowlnollckzvltkasn` on 2026-07-19.

## Result

- Remote migration ledger: 431 applied versions, latest `20260719130913`.
- Active deployment directory: the same 431 migration versions.
- This directory: 63 legacy local migrations which are absent from the remote
  ledger.

The files are preserved verbatim for investigation, but are intentionally
outside `supabase/migrations` so the Supabase CLI cannot replay them against
the live project.

On 2026-07-19, the 17 legacy 12-digit ledger versions that collided with
14-digit timestamps in the same minute were normalized in place to the
equivalent `…00` 14-digit identifiers. This was an atomic ledger-only repair:
no migration SQL ran, and no schema or application data changed. The matching
active local filenames were normalized at the same time.

Run `node supabase/scripts/verify-remote-migration-ledger.mjs` before every
deployment. It verifies the active files against the remote ledger using exact
version strings. `supabase migration list` is now also a valid pairing check.

## Rules

1. Do not move these files back into `supabase/migrations` for a production
   deployment.
2. Do not use `supabase migration repair` to mark them applied without a
   migration-by-migration schema review.
3. If a capability is required, implement a newly versioned, append-only
   migration after `20260719130913`, then validate it against the live schema
   before deployment.
4. The historic `202607180046_mvp_atomic_transaction_creation_phase2a.sql` is
   in this quarantine. It must not be applied directly; use the separately
   reconciled append-only atomic-creation migration instead.
