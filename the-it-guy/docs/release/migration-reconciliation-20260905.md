# Migration reconciliation — 5 September 2026

## Release-candidate migration inventory

| Scope | Managed migration state | Release action |
| --- | --- | --- |
| Document Trust | Three managed migrations dated `20260905090353` through `20260905095152` | Pending staging ledger comparison and apply. |
| Bond application portal | Seven managed migrations dated `20260905100612` through `20260905102934` | Pending staging ledger comparison and apply. |
| Rental tenant and landlord portals | `20260905120250_rental_portal_foundation.sql` | New managed migration; pending staging ledger comparison and apply. |
| Earlier Rental foundations | Baseline SQL remains under `the-it-guy/sql/20260829_rental_*.sql`; it is not a managed migration history | Audit separately before a clean-environment Rental rebuild. |

## Rental portal migration controls

- The former tenant and landlord portal SQL files are retired; their schema is represented only by the canonical migration.
- All four portal tables have RLS enabled and no anon/authenticated table privileges.
- Public portal requests continue to go through server endpoints that validate hashed, expiring access tokens before using the service-role client.
- `rental_set_updated_at()` is declared by the managed portal migration because its original definition exists only in the unmanaged Rental foundation SQL.

## Environment ledger status

| Environment | Status | Required next action |
| --- | --- | --- |
| Local Supabase | Not running (`127.0.0.1:54322` refused connection) | Start the local stack, then run `supabase migration list --local` and apply/test the release candidate. |
| Staging | Verified 5 September against `vaszuxjeoajeuhlcnzzf` (Arch9 Staging) | Blocked: its ledger has remote-only versions absent locally and it has no Rental foundation tables. Reconcile the full history before any Rental migration apply. |
| Production | Not verified | Capture the production migration ledger separately; do not infer it from git or deployment timestamps. |

## Apply order

1. Confirm the staging ledger and back up its migration-history view.
2. Apply the already-approved managed migrations in timestamp order, ending with `20260905120250_rental_portal_foundation.sql`.
3. Verify the four Rental portal tables, indexes, RLS state, and update triggers.
4. Run tenant and landlord portal smoke tests using non-production access tokens.
5. Repeat the ledger comparison against production before scheduling promotion.

## Phase 4 staging evidence

- `supabase db push --dry-run --project-ref vaszuxjeoajeuhlcnzzf` refused to plan an apply because the staging history includes remote migration versions missing from this checkout.
- A read-only probe confirmed that `rental_properties`, `rental_tenancies`, `rental_set_updated_at()`, and all four Rental portal tables are absent from Arch9 Staging.
- The portal migration cannot be applied in isolation because its foreign keys require those Rental foundations. Do **not** repair migration history or apply the unmanaged `the-it-guy/sql/20260829_rental_*.sql` files directly to staging; first create an approved managed-foundation reconciliation plan.
