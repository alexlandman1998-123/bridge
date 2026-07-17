# Outstanding migrations — Phase 4 schema-drift resolution

Generated: 2026-07-17

## Outcome

`202606090010_created_by_access_remediation.sql` is resolved as **historically applied and intentionally superseded**. No forward schema migration was created because doing so would have recreated obsolete policies alongside the newer canonical isolation model.

Phase 4 changed migration-history metadata only. It did not execute the historical migration or change application schema/data.

## Supersession evidence

The historical migration declared three `private_listings` policies:

- `private_listings_support_role_select`
- `private_listings_support_role_update`
- `private_listings_delete_member_owner`

`202607090006_private_listing_external_isolation.sql` subsequently dropped every policy on `public.private_listings` and installed a canonical four-policy model. `202607130001` and `202607130005` then refined insert, select, and update access.

The live table has RLS enabled and exactly these current policies:

| Policy | Command | Current contract |
| --- | --- | --- |
| `private_listings_select_scoped` | SELECT | Active member, administrator, assigned agent, or scoped support access |
| `private_listings_insert_member` | INSERT | Active organisation member |
| `private_listings_update_scoped` | UPDATE | Same scoped access on both `using` and `with check` |
| `private_listings_delete_owner_or_admin` | DELETE | Active member who is an administrator, assigned agent, or creator |

All three historical helper functions are live with their expected signatures. The missing historical policy names are therefore evidence of legitimate supersession, not incomplete deployment.

## Verification

- Agency RLS/manual intervention audit: passed.
- Private-listing returning RLS policy tests: passed.
- Raw remote ledger row:
  - version: `202606090010`
  - name: `created_by_access_remediation`
- Public-schema fingerprints before and after repair were identical:
  - columns: `73052c826fabc9222d23fc1bf74d54ad`
  - constraints: `9628ebcc5e5aa5fcf707df5f0dbf6133`
  - functions: `1d6d2ccad42c3f892735867ce6964550`
  - indexes: `71fa6fddfaac1d28e1ada0354d56bc2c`
  - policies: `c0e3c898dcfb4216d06684b2a050decd`

## CLI timestamp collision

The Supabase CLI renders the repaired 12-digit `202606090010` row as a split local/remote pair because `20260609001001` shares its prefix. The raw ledger contains the correct version/name pair. Do not execute `202606090010` again.

## Remaining migration

The only genuine unresolved migration is:

- `202607070001_drop_demo_all_rls_grants.sql`

It remains a standalone security migration with 506 live grant findings across 46 legacy tables. It must not be combined with timestamp-collision ledger work.

## Current gate

**Status: PHASE_4_COMPLETE_SUPERSEDED_POLICY_MODEL_VERIFIED**

Broad `supabase db push --include-all` remains prohibited. Phase 5 should confirm that no non-security partial migration remains; the grant cleanup stays reserved for the dedicated security phase with an explicit rollback grant plan and end-to-end access tests.
