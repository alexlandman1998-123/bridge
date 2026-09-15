# Supabase Phase 2 History Reconciliation

Generated: 2026-09-14

## Scope

This phase is read-only. It identifies the four production-only migration-ledger records and establishes the canonical local-history mapping needed for a later, reviewed ledger repair. No database schema, application data, or migration ledger was changed.

## Finding

Each production-only record has the same migration name as a local migration, but a different timestamp. The relevant objects are live in production and the local files passed the Phase 5 catalog audit. This is timestamp-only ledger drift, not four independent remote schema changes.

| Remote ledger version | Canonical local version | Migration name | Local SHA-256 | Live evidence |
| --- | --- | --- | --- | --- |
| `20260914073732` | `20260914073546` | `email_sending_domains_phase1` | `1a2b6b1aee07ddf422ca074ac40b18b6d2df57349c0407e8887b51b48271c456` | Sending-domain table, guard function, and trigger exist; Phase 5: 8/8 objects live. |
| `20260914073827` | `20260914073806` | `email_sending_domain_guard_fix_phase1` | `33be1e41a3cc00a679f1e0bca9b07687d56d5d1c4854c23254efdce95ba56ab9` | Guard function exists; Phase 5: 1/1 object live. |
| `20260914080521` | `20260914080412` | `email_sending_approval_phase5` | `6bf33c4b5475611c9822728753bd6d853dff8a293604c184db8dbc385f79d18e` | Approval column and guard exist; Phase 5: 4/4 objects live. |
| `20260914080747` | `20260914080640` | `email_sending_operator_console_phase6` | `a0538376bb1681aadf157a3e7e0a978c011f7dc810d7c1f5ae79ce1369ce3f4d` | Operator RPC exists; Phase 5: 2/2 objects live. |

## Remote Metadata Evidence

The production ledger stores one SQL statement for each of the four records. The names match the local migration names exactly. Their remote statement hashes, retained for audit comparison, are:

| Remote version | Statement hash |
| --- | --- |
| `20260914073732` | `b9484eb76b6549dbb93c8be71382a2eb` |
| `20260914073827` | `1e0d63f00c807c201f27f3d103a26193` |
| `20260914080521` | `3552aa1888b70f4d75074539f2a9496d` |
| `20260914080747` | `0cd3b594cd57c42d3f91ebab6b98250a` |

## Approved Repair Shape for a Later Maintenance Window

1. Re-run the Phase 1 snapshot and Phase 5 audit; stop if either mapping or any live-object result changes.
2. Run the relevant email-domain smoke checks against staging, then production in a no-write mode.
3. Add the four canonical local versions to the production migration ledger as `applied`; do not replay their SQL.
4. Verify that all four canonical local versions appear in the remote ledger.
5. Remove the four superseded remote timestamps from the ledger as `reverted` only after step 4 is verified.
6. Re-run `supabase migration list --linked` and the Phase 5 audit. The expected result is zero remote-only rows for this group and zero local-only rows for the four canonical versions.

The repair must be recorded as eight ledger mutations with before-and-after evidence. It must not use a broad `db push` or apply any of these migrations' SQL again.

## Phase Gate

The mapping is ready for a later approved production ledger-repair window. It is intentionally not applied in Phase 2; the current production freeze remains active.
