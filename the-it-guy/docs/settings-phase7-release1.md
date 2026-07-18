# Settings Phase 7 — Release 1

Release 1 is a maximum-five-organisation production cohort. It is deliberately disabled until the target project schema, clean 24-hour metrics, named approval, and explicit organisation IDs are attached.

## Required database order

1. `202607170026_settings_job_title_governance_phase3_1.sql`
2. `202607170027_settings_role_permission_governance_phase3_2.sql`
3. `202607170028_settings_ownership_transfer_phase3_3.sql`

Database migrations are additive and forward-only. Rollback disables the cohort and redeploys the previous frontend; it must not delete saved settings or audit history.

## Evidence file

Provide `SETTINGS_RELEASE1_SCHEMA_EVIDENCE` as a repository-relative JSON file:

Run [`scripts/settings-release1-schema-evidence.sql`](../scripts/settings-release1-schema-evidence.sql) read-only against the target project, save its JSON result, and replace the three `null` metrics with the verified 24-hour monitoring counts.

```json
{
  "schema": {
    "jobTitleColumn": true,
    "jobTitleRpc": true,
    "roleGovernanceRpc": true,
    "ownershipTransferRpc": true,
    "securityAuditEvents": true,
    "organizationEvents": true,
    "billingEvents": true
  },
  "metrics": {
    "settingsErrors24h": 0,
    "failedSaves24h": 0,
    "ownershipTransferFailures24h": 0
  }
}
```

## Release command

```sh
SETTINGS_RELEASE1_SCHEMA_EVIDENCE=<evidence.json> npm run verify:settings-release1
```

The command is read-only. It runs every Phase 1–6 contract, verifies globally unique Supabase migration versions, checks the production build, validates the live evidence, and exits non-zero until every release condition is satisfied.
