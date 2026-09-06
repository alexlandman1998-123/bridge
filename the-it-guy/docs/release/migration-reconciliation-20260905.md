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

## Phase 3 main-sync reconciliation — 6 September 2026

The migration files recovered in commit `4b39917d8` have now been reconciled against the checked-in ledgers and a fresh read-only migration listing from the linked production project `isdowlnollckzvltkasn`.

### Property24 migration identity

- Version `202608200002` is the existing `202608200002_whatsapp_template_seed.sql` migration and must remain unchanged.
- The Property24 agent-catalog migration was therefore correctly moved to the unique version `20260831140736`.
- Both the captured staging ledger and the fresh linked-production listing show `20260831140736` as local-only. There is no evidence that the Property24 migration was applied under its former colliding version.
- Tests and documentation now reference only `20260831140736_property24_agent_catalog_mappings.sql`.

### Recovered batch status

The following recovered groups already match the linked production migration history and are retained as immutable historical files:

- `20260827173544` through `20260827173753`
- `20260827211317` through `20260827211341`
- `20260828134501` and `20260828144545`
- `20260830092946` through `20260830100759`

The following release-candidate migrations are local-only in the linked production ledger and must not be applied until the wider ledger divergence is resolved and staging verification passes:

- `20260831140736_property24_agent_catalog_mappings.sql`
- `20260906065759_agent_phase2_rls_acceptance.sql`
- `20260906070515_attorney_coordination_nomination_phase2.sql`
- `20260906070938_attorney_lane_delegation_phase3.sql`
- `20260906071644_attorney_coordination_propagation_phase4.sql`
- `20260906130000_meta_lead_ads_integration.sql`

### Ledger and security gates

- Migration filenames are syntactically valid and their version prefixes are unique.
- The linked production comparison reports 113 local-only and 81 remote-only versions across the full historical ledger. No `db push`, migration-history repair, or direct production apply is authorised from this checkout.
- Linked production database linting also reports pre-existing function errors (including missing columns/relations, invalid `ON CONFLICT` targets, ambiguous PL/pgSQL references, and unresolved crypto helpers). These errors are an additional production-promotion blocker and must be reconciled to their owning migrations before applying the local-only candidate.
- The recovered migrations enable RLS on newly exposed tables. Privileged functions in the reviewed batch use explicit search paths and restrict execution from `PUBLIC`/`anon`; service-only functions also revoke `authenticated` execution.
- The July 2026 Supabase changes affecting the `realtime` schema and extension-version pinning do not require edits to this recovered batch: none of these migrations modify the `realtime` schema or depend on a pinned extension upgrade.
- Local database-level migration listing and linting remain unavailable because Docker is not installed on this host. Contract, ledger, Property24, agent-RLS, and attorney coordination migration tests pass without changing remote state.

### Authoritative decision

Preserve the recovered migration filenames and SQL as committed. Treat the six local-only migrations above as an ordered release candidate, not as an apply plan. First reconcile the 81 remote-only production versions into source control, repeat the clean-database migration run on a Docker-capable host, and verify the candidate against Arch9 Staging before scheduling production promotion.
