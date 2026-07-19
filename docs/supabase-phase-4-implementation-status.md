# Supabase Phase 4 Implementation Status

Generated: 2026-07-18
Linked project: `isdowlnollckzvltkasn` (`Arch9 SaaS`)

## Decision

**Status: SPLIT_BASELINE_READY**

Phase 4 resolved the operational treatment of all 17 historical split comparison rows. They remain visible in raw Supabase CLI output because of mixed minute/second filename ordering, but they are confirmed remote-recorded migrations and are no longer treated as missing or repairable rows.

No migration file was renamed, no SQL was executed, and no remote migration-history row was changed.

## Baseline Evidence

| Check | Result |
| --- | ---: |
| Historical split versions | 17 |
| Remote migration names matched | 17/17 |
| Unreviewed split versions | 0 |
| Versions with all extracted static objects live | 15 |
| Reviewed evidence exceptions | 2 |
| Duplicate local timestamps | 0 |
| Matched comparison rows | 407 |
| Pure remote-only rows | 0 |
| Pure local-only rows | 63 |

## Reviewed Exceptions

### `202606050001_bond_bank_relationship_profiles.sql`

The migration is a single `ALTER TABLE` statement, so the generic static-object extractor reports no objects. Direct catalog verification confirms all five intended `bond_banks` columns are live:

- `contact_name`
- `contact_email`
- `contact_phone`
- `next_review_date`
- `relationship_notes`

### `202606090010_created_by_access_remediation.sql`

Twenty-seven of its thirty extracted functions and policies remain live. The three absent historical policies are:

- `private_listings_delete_member_owner`
- `private_listings_support_role_select`
- `private_listings_support_role_update`

They were superseded by the currently live scoped policies `private_listings_delete_owner_or_admin`, `private_listings_select_scoped`, and `private_listings_update_scoped`. Their source migrations `202607090006_private_listing_external_isolation` and `202607130005_private_listing_inline_select_policy` are both recorded remotely.

## Guardrails

- Keep all 17 minute-level files and their neighboring second-level files at their original versions.
- Do not run `migration repair` for a reviewed split row.
- A split version not present in the reviewed baseline remains blocking.
- Phase 5 now reports reviewed and unreviewed split counts separately.
- Phase 6 only accepts the two exceptions when their expected object-status signatures still match.

## Handoff

The historical split baseline no longer blocks module planning. The next phase should classify the 63 pure local-only migrations into already-live, absent, partial, data-only, or obsolete decisions before any staging application.
