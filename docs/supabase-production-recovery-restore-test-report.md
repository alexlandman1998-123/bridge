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


## Identified logical backup restore — 27 October 2026

A new logical backup `arch9-logical-20261027-e247ea692bb82b70` was restored successfully into
`local-docker-arch9-recovery-20261027`, using the production PostgreSQL 17.6.1.063 image.
The target had no network interfaces beyond loopback, no published ports, cron
launching disabled and the HTTP worker pointed at an empty separate database.
All 17 recorded core table counts matched the consistent source snapshot. The
function, index, trigger and logical-column definitions matched production; all
1,962 access policies were equivalent, including a 27-case check of one
associative OR grouping difference introduced by SQL re-parsing. The original
Supabase bootstrap role was preserved so membership grantors restored correctly.

The completed backup SHA-256 is `e247ea692bb82b70ed5d5581e27854fced92b14441f95b8f3e2c312c3d54df94`. The verified backup,
schema and password-free role files are retained with private permissions under
`~/.codex/recovery/arch9/20261027-e247ea692bb82b70/`, outside Git. Task-owned temporary
connection settings and rejected incomplete exports were removed after release. The retention hashes
are recorded in `output/campaign-catchup-production-20261027/recovery-retention.json`;
non-secret restore evidence is recorded in
`output/campaign-catchup-production-20261027/recovery-restore-verification.json`.
Earlier interrupted exports were rejected and do not establish recovery.

This is a database recovery test. It does not restore Storage object bytes, custom
role passwords, provider credentials or the provider root encryption key. No
production/staging restore, new paid project or customer communication occurred.
The preserved legacy leads policy returned shared rows to an actor probe and
needs a separate access review; the campaign-specific isolation probes passed.
