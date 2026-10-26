# Supabase Production Recovery Lock Report

Generated: 2026-10-26T08:21:30.139Z
Production project: `isdowlnollckzvltkasn`

## Decision

**Status: RECOVERY_LOCK_BLOCKED**

Production promotion remains blocked until this report says `RECOVERY_LOCKED`. This is a database-only recovery gate: Supabase database backups do not include Storage file bytes. A locked database gate does not prove full application recovery. This report does not enable PITR, restore data, apply SQL, repair ledgers, or modify production.

## Summary

| Field | Value |
| --- | --- |
| Evidence file | `docs/supabase-production-recovery-evidence.json` |
| Evidence file state | Existing |
| Recovery method | `equivalent_managed_backup` |
| Recorded PITR enabled | No |
| Recorded physical backups | 8 |
| Recovery tested | No |
| Live check performed | No |
| Live PITR enabled | Not available |
| Live physical backups | Not available |
| Recovery locked | No |

## Blockers

- `recovery_test_not_recorded`
- `backup_restore_not_proven`

## Evidence Rule

The lock requires a matching production project, a recorded recoverable mechanism, a completed restore from an identified backup into an isolated target, successful smoke checks, a named tester, a named approver, and a durable evidence reference. A live database clone is insufficient. If live verification is requested, a failed provider check blocks the lock. The evidence file must not contain secrets or exported production data.

## Recovery Test Packet

Complete `docs/supabase-production-recovery-test-packet.md`, perform the restore test outside this repository, then update `docs/supabase-production-recovery-evidence.json` with the non-secret test reference. This lock gate will remain blocked until that evidence is recorded.
