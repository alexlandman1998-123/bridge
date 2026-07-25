# Staging Evidence Completion Packet

Version: `202607240001`
Stream: `workspace_profile_management`
Route: `apply_original`
File: `202607240001_agent_profile_management_rpc.sql`
Evidence: `docs/staging-evidence/202607240001-workspace_profile_management.json`
Status: Complete

## Commands

```bash
node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202607240001 --confirm APPLY_TO_STAGING_ONLY
```

```bash
node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607240001 --evidence docs/staging-evidence/202607240001-workspace_profile_management.json --confirm APPLY_TO_STAGING_ONLY
```

## Required Evidence

- Real staging project ref in `targetProjectRef` and `stagingProjectRef`
- `sqlApplied: true`
- `stagingLedgerRecorded: true`
- `catalogChecks: "pass"`
- `behaviorChecks: "pass"`
- `rollbackOrNoResidue: "pass"`
- `reviewedBy`, `approvedBy`, and `capturedAt`


## Blockers

- None
