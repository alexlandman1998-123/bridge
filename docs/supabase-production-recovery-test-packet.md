# Supabase Production Recovery Test Packet

Generated: 2026-11-08T14:58:55.028Z
Production project: `isdowlnollckzvltkasn`
Current lock status: `RECOVERY_LOCKED`

## Purpose

Use this packet to complete the production recovery lock without storing secrets or exported production data in git. The restore test must prove that production can be recovered from the recorded mechanism before any production migration promotion runs.

## Current Recovery State

| Field | Value |
| --- | --- |
| Recorded method | `equivalent_managed_backup` |
| Recorded PITR enabled | No |
| Recorded physical backups | 8 |
| Live check performed | Yes |
| Live PITR enabled | No |
| Live physical backups | 8 |

## Required Restore Test

1. Restore an identified production physical/PITR/logical backup into a temporary isolated target. Creating a copy of the current live database is not a backup restore test. Do not use production or the active staging project as the target.
2. Confirm the restored database starts and can answer read-only smoke queries.
3. Confirm the restore target is isolated from production traffic.
4. Record the restore target name/ref, tester, approver, timestamp, and ticket/reference.
5. Do not copy database URLs, passwords, backup secrets, or exported production rows into this repository.
6. Test encrypted Storage file recovery independently; database backups contain file metadata, not file bytes. See `docs/security/api-key-and-backup-coverage.md`.

## Evidence To Record

After the restore test has genuinely passed, update `docs/supabase-production-recovery-evidence.json` like this:

```json
{
  "productionProjectRef": "isdowlnollckzvltkasn",
  "recoveryMethod": "equivalent_managed_backup",
  "pitrEnabled": false,
  "physicalBackupCount": 8,
  "equivalentManagedBackupAccepted": true,
  "recoveryTested": true,
  "backupRestoreTest": {
    "method": "physical_backup_restore",
    "sourceProjectRef": "isdowlnollckzvltkasn",
    "sourceBackupId": "<backup-id-or-PITR-timestamp>",
    "targetProjectRef": "<isolated-restore-project-ref>",
    "smokeChecksPassed": true
  },
  "testedAt": "<ISO-8601 timestamp>",
  "testedBy": "<person or team>",
  "acceptedBy": "<release owner>",
  "restoreTarget": "local-docker-arch9-recovery-20261027",
  "evidenceUrlOrTicket": "output/campaign-catchup-production-20261027/recovery-restore-verification.json",
  "notes": [
    "Restore test completed against an isolated non-production target. No secrets or exported production data are stored here."
  ]
}
```

## Current Blockers

- None

## Final Check

Run:

```bash
npm run supabase:push:lock-recovery
```

The lock is complete only when the report says `RECOVERY_LOCKED`.
