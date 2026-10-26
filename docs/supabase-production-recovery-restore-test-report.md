# Supabase Production Recovery Restore Test Report

Generated: 2026-07-25T18:55:39.570Z

## Scope

This was a real production recovery exercise against an isolated Supabase restore target. It did not restore over production and did not use the active Arch9 staging project.

## Source

| Field | Value |
| --- | --- |
| Production project | `isdowlnollckzvltkasn` |
| Production project name | `Arch9 SaaS` |
| Region | `eu-west-1` |
| PITR enabled | No |
| Physical backups available | 8 |
| Latest observed physical backup | `1201640968`, inserted `2026-07-25T03:07:51.123Z` |

## Restore Target

| Field | Value |
| --- | --- |
| Mechanism | Supabase preview branch created with production data |
| Command class | `supabase branches create --with-data` |
| Branch name | `codex-prod-recovery-20260725` |
| Branch id | `34d01c00-a842-4f2b-a782-7bd9da3025e5` |
| Restore project ref | `jhxihynofflyyycwdttw` |
| Parent project ref | `isdowlnollckzvltkasn` |
| Persistent | No |
| Final observed status | `FUNCTIONS_DEPLOYED` |
| Final observed preview status | `ACTIVE_HEALTHY` |

## Smoke Checks

The smoke checks used the restored branch API with service credentials returned by Supabase. Requests used `limit=0` and `Prefer: count=exact`, so no production rows were printed or stored.

| Check | Result |
| --- | --- |
| `organisations` count query | Passed, count `24` |
| `profiles` count query | Passed, count `164` |
| `leads` count query | Passed, count `39` |
| `document_templates` count query | Passed, count `0` |
| `legal_document_master_migrations` count query | Passed, count `0` |

## Isolation Notes

- Restore target project ref differs from production: `jhxihynofflyyycwdttw` vs `isdowlnollckzvltkasn`.
- The branch is non-persistent and separate from the active staging project `vaszuxjeoajeuhlcnzzf`.
- The temporary restore branch was deleted after evidence capture.
- No database URLs, passwords, API keys, JWT secrets, backup secrets, or exported production rows are stored in this report.

## Outcome

Recovery test passed for the platform-managed isolated restore target. The production recovery evidence can be considered locked for migration promotion gating.

## Coverage correction — 21 October 2026

The historical exercise above used a branch created from the current live database with `--with-data`. It proved an isolated database copy could start and return aggregate counts. It did **not** identify and restore one of the physical backups, so it is insufficient proof of backup recovery. The corresponding evidence now records `recoveryTested: false` and `recordedExerciseType: live_database_clone` until an actual identified-backup restore passes. Production and the active staging project must not be used as restore targets.

Live review found eight completed daily physical backups, latest `2024466958` from `2026-10-21T03:10:55.758Z`, with PITR disabled. Storage contains 5,514 objects totaling 5,877,106,235 bytes; these file bytes are excluded from database backups. The full app recovery gap and proposed encrypted off-site file-backup setup are recorded in [the coverage review](security/api-key-and-backup-coverage.md). No backup restore, paid recovery service, or copied production file archive was created during this review.
