# Supabase Phase 1 — Document and Mandate Foundation

## Outcome

Phase 1 has been implemented and verified on the dedicated Supabase staging project `vaszuxjeoajeuhlcnzzf`.

- Target: staging only
- Production project `isdowlnollckzvltkasn`: not changed
- Phase 1 migration actions: 44
- Staging ledger entries confirmed: 44/44
- Migration evidence files: 44/44
- Document-domain tests: 252 passed, 0 failed
- Staging execution safety tests: passed

The original mandate-generation failure is resolved on staging. The following columns now exist on `public.document_packet_versions`:

- `rendered_file_bucket`
- `rendered_file_path`
- `rendered_file_name`

## Applied scope

The staging implementation covered all Phase 1 streams:

- Legal review foundation: 8 actions
- Legal runtime foundation: 25 actions, including the manually reviewed native starter migration
- Document-generation foundation: 11 actions

Each action was applied in dependency order, verified before its migration-ledger entry was recorded, and given an evidence file under `migration-evidence/2026-07-20-staging-phase1/`.

## Native legal starter result

The database-native global starters are published, active, structured, and do not depend on a DOCX file as their authoritative definition.

| Starter | Sections | Result |
| --- | ---: | --- |
| General Addendum | 6 | Valid; signature section is last |
| Seller Mandate | 10 | Valid; signature section is last |
| Offer to Purchase | 12 | Valid; signature section is last |

All starter sections contain substantive wording and none match the scaffold-text checks used by the migration.

## Migration corrections made during staging rehearsal

Staging exposed four defects that were corrected in the canonical migration files before production promotion:

1. `202607180002_canonical_document_lifecycle_persistence_a3.sql`
   - Corrected a PostgreSQL `CASE` type mismatch by serialising the lifecycle timestamp as JSONB.
2. `202607180003_canonical_editable_template_definition_b1.sql`
   - Scoped suspension of the template audit trigger to the deterministic definition backfill, then restored it in the same transaction.
3. `202607180004_native_legal_starter_templates_b2.sql`
   - Made the migration self-contained for databases carrying the older 8-section mandate and 7-section OTP seed shapes.
   - Added the missing canonical sections idempotently and normalised signature ordering.
4. `202607180005_immutable_template_revisioning_b4.sql`
   - Scoped suspension of the same audit trigger to the revision-family backfill, then restored it in the same transaction.

The `document_packet_templates_audit` trigger is enabled after the migration sequence.

## Preserved historical data issue

Four historical `document_packet_templates` rows contain `organisation_id` values whose organisation records no longer exist. These rows pre-date Phase 1. They were preserved; Phase 1 did not delete or rewrite them merely to satisfy the audit foreign key.

This should be handled as a separate, reviewed data-cleanup action after ownership and retention requirements are confirmed.

## Production promotion requirements

Phase 1 is ready for a controlled production rehearsal/promotion, but has not been promoted by this implementation.

Before production:

1. Confirm a recoverable production backup and rollback owner.
2. Use the patched, self-contained `202607180004` migration; do not replay `202607120001` as a production workaround.
3. Re-run the same preflight catalogue and data checks against production.
4. Apply in the same dependency order, one verified batch at a time.
5. Record each ledger entry only after its SQL, catalogue, behaviour, and residue checks pass.
6. Re-run mandate and OTP generation plus the final-PDF access path before opening traffic.

Existing RLS advisories outside the Phase 1 document scope remain separate work and were not changed automatically.
