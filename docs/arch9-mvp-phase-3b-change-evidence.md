# Arch9 MVP — 3B staging change evidence

Before applying a staging migration, create non-secret change evidence that records:

- Confirmed staging project reference and captured migration-list time
- Path to the 1B staging-ledger evidence
- Release, database, and rollback owners
- Confirmed backup or recovery plan
- Explicit forward-fix/feature-disable rollback policy
- Confirmation that production credentials were not used
- Explicit approval to apply to staging

Example:

```json
{
  "projectRef": "staging-project-ref",
  "migrationListCapturedAt": "2026-07-19T00:00:00.000Z",
  "ledgerEvidencePath": "docs/staging-migration-ledger.json",
  "releaseOwner": "release.owner@arch9.example",
  "databaseOwner": "database.owner@arch9.example",
  "rollbackOwner": "rollback.owner@arch9.example",
  "backupDecision": "backup_or_recovery_plan_confirmed",
  "rollbackDecision": "forward_fix_or_feature_disable_only",
  "productionCredentialsUsed": false,
  "approvedForStagingApply": true
}
```

Validate it before 3C:

```bash
npm run mvp:staging:change-evidence -- --evidence=docs/staging-change-evidence.json
```

This evidence documents a decision; it does not create a backup, modify Supabase, or authorise production access.
