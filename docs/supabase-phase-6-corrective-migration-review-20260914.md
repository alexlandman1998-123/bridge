# Supabase migration reconciliation — Phase 6 corrective-migration review

Date: 2026-09-14  
Target inspected: production (`isdowlnollckzvltkasn`) and the configured staging project  
Reviewer/approver: Alex

## Outcome

No corrective migration was created and no database was changed in this phase.

The four rows previously labelled `corrective_migration_required` are not
partially-applied migrations. Each source file is explicitly enclosed in a
single `BEGIN … COMMIT` transaction, remains absent from the remote migration
ledger, and its unique intended schema changes are absent from both inspected
catalogs. The small amount of live-object overlap comes from older migrations
that use the same object names.

Creating a second "corrective" migration would therefore duplicate changes
that have never landed and would make the ledger harder to reconcile. The safe
route is the original migration file, in dependency order, after the staging
baseline is repaired.

## Evidence

| Local migration | Earlier object responsible for overlap | Unique changes present in production | Correct route |
| --- | --- | ---: | --- |
| `20260913182014_fica_access_controls_phase6` | FICA read/insert/update policies from `20260909200653_knowledge_factory_phase4_fica_kyc_cases` | No | Apply original after dependency checks |
| `20260913182312_website_blog_structured_blocks_phase1` | Existing blog workflow surface; the structured column, constraint, and replacement routine signature are absent | No | Apply original after dependency checks |
| `20260913185826_website_blog_release2_media_operations` | Existing `website_publish_revision` is unrelated; no media bucket, media policies, or release-2 routines exist | No | Apply original after dependency checks |
| `20260913193410_website_blog_release3_publishing_polish` | `website_publish_revision` was introduced by `20260913113900_website_blog_revision_workflow` | No | Apply original after dependency checks |

The read-only catalog probe is retained at
`sql/supabase-phase6-partial-migration-live-audit.sql`. It queries only catalog
metadata and function-definition hashes, never FICA records or provider data.

## Reconciliation guard added

`scripts/supabase-phase5-module-drift-audit.mjs` now identifies migration
files that explicitly start with `BEGIN` and finish with `COMMIT`. When such a
local-only file has only partial static-object overlap, the application
manifest routes it to `apply_original_after_dependency_check`, rather than
assuming a corrective migration is needed. The manifest retains the raw
`partial_live` observation and adds `transactional: true`, so the evidence is
not hidden.

## What remains

The pending stream still needs to be established in staging first. In this
particular run, staging does not yet contain the website-blog foundation and
its dependent media/listing tables, so testing these original files there is
not safe yet. No production SQL or migration-history repair should occur until
that ordered staging execution, catalog validation, and behavior/RLS checks
have passed.
