# Supabase Production Recovery Test Packet

Generated: 2026-07-25T18:57:28.964Z
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

1. Restore production from a physical backup or equivalent managed backup into a temporary non-production target.
2. Confirm the restored database starts and can answer read-only smoke queries.
3. Confirm the restore target is isolated from production traffic.
4. Record the restore target name/ref, tester, approver, timestamp, and ticket/reference.
5. Do not copy database URLs, passwords, backup secrets, or exported production rows into this repository.

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
  "testedAt": "<ISO-8601 timestamp>",
  "testedBy": "<person or team>",
  "acceptedBy": "<release owner>",
  "restoreTarget": "Supabase preview branch codex-prod-recovery-20260725, project ref jhxihynofflyyycwdttw, branch id 34d01c00-a842-4f2b-a782-7bd9da3025e5",
  "evidenceUrlOrTicket": "docs/supabase-production-recovery-restore-test-report.md",
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
