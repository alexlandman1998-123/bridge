# Supabase Phase 1 Freeze and Snapshot

Generated: 2026-09-14

## Scope

This checkpoint is read-only. The production schema freeze remains active and no production or staging SQL was applied by this checkpoint.

## Targets

| Environment | Project ref | Ledger rows | Matched | Local-only | Remote-only |
| --- | --- | ---: | ---: | ---: | ---: |
| Production | `isdowlnollckzvltkasn` | 1163 | 1135 | 24 | 4 |
| Staging | `vaszuxjeoajeuhlcnzzf` | 1159 | 882 | 277 | 0 |

## Schema Fingerprints

The fingerprints below are deterministic hashes of public-schema relation, column, and function catalog metadata. They do not include application data or object definitions.

| Environment | Catalog objects | Fingerprint |
| --- | ---: | --- |
| Production | 15012 | `ff7482655cde34ada01974006da98ef9` |
| Staging | 12608 | `62d61a0ca24e893452fbb6c054705909` |

The different counts and fingerprints confirm that staging is not a suitable baseline for the pending rental migration sequence until its missing prerequisites are restored.

## Recovery Evidence

- Production recovery method: equivalent managed backup.
- Physical backup evidence count: 8.
- Recovery test: passed against the recorded preview-branch restore target.
- Staging target is configured with the repository's required recovery confirmation.

## Tooling Note

`supabase db dump` could not be used for schema-only dumps because the local Docker daemon is unavailable. The catalog fingerprint query in [supabase-phase1-catalog-fingerprint.sql](../sql/supabase-phase1-catalog-fingerprint.sql) is the active schema snapshot for this checkpoint. Re-run it and capture a full schema dump before the first production mutation when Docker or an equivalent approved `pg_dump` runner is available.

## Freeze Decision

Keep the broad migration freeze in place. Continue with staging-baseline restoration and one-version validation only; do not run a broad `supabase db push`, `db reset`, or ledger-repair batch.
