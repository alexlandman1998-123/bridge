# Supabase Migration History Repair

## 2026-07-27 timestamp collision cleanup

Several June 2026 migrations were originally created with minute-level timestamps
that collided with later same-minute migrations. Production had already applied
the migrations in the intended order, but the local filenames sorted differently
from the remote migration ledger, which caused `npx supabase db push` to stop
with "Remote migration versions not found in local migrations directory."

The fix was bookkeeping-only:

- Rename the earlier same-minute local migration files from `YYYYMMDDHHMM_...`
  to `YYYYMMDDHHMM00_...`.
- Keep the later migrations as `YYYYMMDDHHMM01_...` or `YYYYMMDDHHMM02_...`.
- Mark the new `...00` versions as applied in production migration history.
- Mark the old ambiguous minute-level versions as reverted.

No production schema SQL was rerun as part of this repair. The `...00` versions
represent the same migrations that production had already applied under the old
ambiguous version numbers.
