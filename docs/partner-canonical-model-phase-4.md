# Partner Canonical Model — Phase 4 Relationship Storage

Date: 2026-07-20

Status: Implemented in source; not deployed

## Outcome

`organisation_partners` is now the only relationship store used by the partner-network runtime contract.

The existing `bridge_phase4_*partner_connection*` RPC names remain temporarily available as compatibility APIs, but their implementations read and write `organisation_partners`. This avoids forcing an immediate coordinated rename across the workspace UI and routing consumers while removing the duplicate persistence path.

`partner_connections` is retained only as a read-only historical table. Migration `202607200010_canonical_partner_relationship_storage.sql` revokes authenticated writes and installs a database trigger that rejects inserts, updates, and deletes.

## Canonical lifecycle

The following lifecycle fields move onto `organisation_partners`:

- `accepted_by` / `accepted_at`
- `declined_by` / `declined_at`
- `blocked_by` / `blocked_at`
- `removed_by` / `removed_at`

The canonical stored statuses are:

- `pending`
- `accepted`
- `declined`
- `blocked`
- `removed`

Compatibility APIs continue returning `connected` for stored `accepted` relationships.

A synchronization trigger keeps the older `status` compatibility column and `relationship_status` aligned. Existing invitation-acceptance paths that write either column therefore continue producing canonical lifecycle state.

## Per-organisation preference

The mutual `preferred` interpretation is replaced by two owner-specific fields:

- `organisation_preferred`, owned by `organisation_id`;
- `partner_preferred`, owned by `partner_organisation_id`.

The old `preferred` column remains as a compatibility projection for the first side. The unified directory read function is upgraded during migration so each workspace sees only its own preference value.

## Legacy backfill and aliases

Any existing `partner_connections` row is matched by the canonical unordered organisation pair.

- If the pair already exists, lifecycle, audit metadata, and per-side preferences are merged into it.
- If the pair does not exist, a canonical `organisation_partners` row is created.
- The old ID is recorded in `partner_relationship_aliases`.
- Existing `transaction_partner_assignments.partner_connection_id` values are translated into the new `partner_relationship_id` foreign key.

Cached clients may continue sending a legacy connection ID during the rollout. Compatibility RPCs resolve it through `partner_relationship_aliases` before updating the canonical row.

The legacy rows are not deleted in Phase 4, providing a rollback and audit reference.

## Runtime cutover

The following operations now use `organisation_partners`:

- list and search partner relationships;
- request, accept, decline, prefer, and remove;
- partner transaction-usage logging;
- partner-portal activation and relationship creation;
- network-intelligence recommendation exclusion;
- transaction partner assignment persistence.

Application transaction options now expose the canonical `relationshipId` and persist `partner_relationship_id`. `connectionId` remains a response alias only for compatibility.

## Production baseline

A read-only aggregate check after implementation reported:

| Store | Rows |
| --- | ---: |
| `organisation_partners` | 2 |
| `partner_connections` | 0 |
| Pairs present in both | 0 |

This means production requires no legacy relationship-row merge today, but the migration remains safe for staging or future drift.

## Verification

- Phase 4 canonical-storage contract passed.
- Partner network and partner portal service tests passed.
- Phase 2 unified-directory compatibility and UI contracts passed.
- Phase 19 migration inventory passed with migration `202607200010` included.
- The migration compiled successfully against the linked production schema inside a transaction ending in `ROLLBACK`.
- Follow-up catalog checks confirmed that the new columns, alias table, and write guard did not persist.

## Deployment order

1. Deploy Phase 1 migration `202607200008` if it is not already present.
2. Deploy Phase 3 migration `202607200009`.
3. Apply Phase 4 migration `202607200010`.
4. Verify the relationship reconciliation query returns no unmapped legacy IDs.
5. Deploy the web application.
6. Exercise request, accept, decline, prefer, remove, routing selection, and partner-portal activation in staging.
7. Monitor rejected legacy writes. Any rejection identifies an unconverted caller and must block production promotion.
8. Retire compatibility RPC names and archive the legacy table in a later phase after the observation window.

No staging or production data was changed during Phase 4 implementation or verification.
