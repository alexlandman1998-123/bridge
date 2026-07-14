# Supabase Phase 5 — Canonical Legal Documents

Applied: 2026-07-14
Linked project: `isdowlnollckzvltkasn`
Branch: `codex/db-phase0-reconciliation`

## Outcome

Phase 5 deployed a live-schema-aware canonical legal-template registry, version history, audit trail, private template storage and trusted platform-admin bridge. The historical migrations were not replayed unchanged because production contained orphaned template ownership and the old admin helper trusted generic developer roles and user-editable metadata.

| Metric | Before | After |
| --- | ---: | ---: |
| Local migration files | 359 | 361 |
| Matched versions | 321 | 326 |
| Pure local-only versions | 38 | 35 |
| Pure remote-only versions | 0 | 0 |
| Split versions | 0 | 0 |

The canonical-documents module now has no remaining local-only migration.

## Applied migrations

- `202607140021` — reconciled registry columns, constraints, version/audit tables, RLS, storage and the platform-admin bridge.
- `202607140022` — corrected audit delete foreign keys and supported trusted Auth administrators without a matching profile while retaining their Auth identity in the audit payload.

The outcomes of historical migrations `202606210001`, `202606210002` and `202606210003` were then recorded as applied.

## Data reconciliation

Production contained 13 packet templates:

- 9 global or valid-organisation templates were snapshot into the version registry.
- 4 agency templates reference organisations that no longer exist.
- None of the four orphaned templates could be safely reassigned from active creator memberships.
- The four rows were preserved in place but excluded from the version registry.
- They were not converted to global templates, which would have broadened their visibility.
- No orphaned organisation id exists in the new version table.

## Security corrections

The historical platform-admin helper would have trusted 53 generic `developer` profiles and user-editable `user_metadata`. Phase 5 instead authorizes only server-controlled `app_metadata.role` or `app_metadata.system_role` values in the reviewed HQ role set.

It also:

- Prevents anonymous execution of storage and platform-admin helpers.
- Keeps the trigger-only audit function owner-only.
- Restricts global template reads to active published templates.
- Restricts global version reads to published versions.
- Leaves global audit records available only through the platform-admin policy.
- Keeps the `legal-templates` bucket private.

## Live verification

| Check | Result |
| --- | ---: |
| New registry columns | 10/10 |
| Registry tables with RLS | 2/2 |
| Registry indexes | 7/7 |
| Registry triggers | 3/3 |
| Registry policies | 12/12 |
| Storage policies | 8/8 |
| Private storage bucket | yes |
| Template rows | 13 |
| Version snapshot rows | 9 |
| Orphan version rows | 0 |
| Generic developer platform-admin elevation | denied |
| User-metadata platform-admin elevation | denied |
| Trusted executive platform-admin access | allowed |

## Verification gates

Passed:

- Full migration and verification transaction ending in rollback
- Trusted platform-admin create/update/delete RLS smoke with no residue
- Template create/update/delete audit events
- Deleted template/version audit foreign-key handling
- Canonical legal-template reconciliation regression test
- Canonical document workspace
- Canonical document lifecycle
- Canonical document upload path
- Canonical document packet fixture
- Canonical document primary pilot
- Canonical document consolidation
- Live canonical-document RLS/grants audit
- Supabase migration safety check

## Evidence

- Reconciliation migration: `supabase/migrations/202607140021_canonical_legal_template_registry_reconciliation.sql`
- Audit corrective: `supabase/migrations/202607140022_canonical_template_audit_delete_fix.sql`
- Verification query: `sql/supabase-phase5-canonical-legal-template-verification.sql`
- Current baseline: `docs/supabase-migration-phase-0-evidence.md`
- Remaining backlog: `docs/supabase-migration-phase-5-module-drift-report.md`
