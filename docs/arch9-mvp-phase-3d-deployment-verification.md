# Arch9 MVP — 3D staging deployment verification

3D is performed only after 3C returns `ready_for_human_approved_staging_apply` and the named database owner has applied the separately reviewed forward-only staging migration. It proves the intended migration versions and atomic-creation RPC are deployed to the same staging project.

First capture fresh non-secret outputs:

```bash
supabase migration list --linked --output json > /secure-local-path/staging-post-apply-migration-list.json
SUPABASE_URL=https://<staging-project-ref>.supabase.co \
SUPABASE_ANON_KEY=<staging-anon-key> \
node the-it-guy/scripts/mvp-deployment-contract-check.mjs > /secure-local-path/staging-rpc-check.json
```

Then create a local, non-secret evidence file. Do not commit contact data, credentials, or raw migration output that is not required for release evidence.

```json
{
  "environment": "staging",
  "projectRef": "staging-project-ref",
  "deployedAt": "2026-07-19T00:00:00.000Z",
  "verifiedBy": "release.owner@arch9.example",
  "productionCredentialsUsed": false,
  "preflight": {
    "decision": "ready_for_human_approved_staging_apply",
    "projectRef": "staging-project-ref",
    "migrationOrder": ["202607180046", "202607190001"]
  },
  "postApplyLedger": {
    "projectRef": "staging-project-ref",
    "appliedVersions": ["202607180046", "202607190001"]
  },
  "rpcCheck": {
    "rpc": "bridge_create_mvp_transaction",
    "passed": true,
    "result": "deployed",
    "httpStatus": 401
  }
}
```

Validate it before starting Phase 4:

```bash
npm run mvp:staging:deployment-evidence -- --evidence=/secure-local-path/staging-deployment-evidence.json
```

An anonymous RPC request may return a non-2xx status; the expected proof is that the protected RPC is deployed rather than missing. A missing migration, project-reference mismatch, or missing RPC is a stop condition.
