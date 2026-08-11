# Supabase Preview Ledger Follow-Up

Date: 2026-08-11

## Trigger

The external Supabase Preview check reported remote migration versions that were not present in the local migrations directory after the reconciliation closeout landed on `main`.

## Action

Restored the exact local migration files for the remote-only versions from historical commit `5fb63229`:

- `202608100003_viewing_seller_rsvp_buyer_handoff.sql`
- `202608100004_viewing_buyer_rsvp_completion.sql`

## Verification

Ran:

```sh
npm run supabase:resolve-ledger-drift -- --json
```

Result:

- Pure remote-only rows: `0`
- Divergent rows: `0`
- Reviewed split rows: `17`
- Remaining blockers: `202607310007` and `202607310008`

The remaining blockers are pure local-only reconciliation migrations that still need a production promotion plan. They are separate from the Supabase Preview failure mode that prompted this follow-up.

Because this branch restores reviewed migration history while the freeze remains active, the PR must carry the `database-reconciliation` label before merge.
