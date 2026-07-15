# OTP simplification — Phase 7 recovery

Phase 7 adds a deliberately small operational safety layer to the canonical OTP. It does not add another document editor or another kind of template.

## Runtime rule

New OTP generation resolves the exact published version referenced by `document_packet_templates.live_version_id`. If that pointer, registry row, status, or stored DOCX is invalid, generation stops. It never silently falls back to a legacy template.

Each generated document records the canonical template-version ID, version label, and content hash in its render provenance. Existing generated documents remain immutable when the live pointer changes.

## Recovery rule

The parent template retains `previous_live_version_id` after controlled activation. An authorised organisation administrator may restore it only with an operational reason of at least 12 characters.

The database function performs one atomic transaction:

1. Lock the parent template and both version rows.
2. Verify that the current version is published and the retained version is superseded and has a stored DOCX.
3. Supersede the current live version.
4. Publish the retained version.
5. Swap `live_version_id` and `previous_live_version_id`, making recovery reversible.
6. Copy the restored asset route to the parent and write a security audit event.

There is no automatic rollback. The UI explains the target and requires explicit confirmation. A failed database check preserves the current live version.

## Delivery boundary

The migration is included in the repository but is not deployed or executed by this phase. Controlled activation and rollback remain unavailable until the Phase 2, Phase 6, and Phase 7 migrations have been applied in order.
