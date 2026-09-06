# API-split Phase 0: release scope

Phase 0 defines one reproducible release candidate. It does not deploy anything.

1. Copy `release/api-split-production-baseline.example.json` to a new, dated release manifest.
2. Fill in the exact production base commit, candidate commit, staging project ref, allowed paths, migration hashes, release owner, and rollback plan.
3. Check out the candidate commit in a clean worktree.
4. Validate the scope:

```sh
node scripts/validate-api-split-release-scope.mjs --manifest release/<candidate>.json
node scripts/api-split-production-baseline.mjs --strict --linked --advisors
```

The first command validates that the manifest exactly describes the candidate diff and its migrations. The second validates release containment and the linked Supabase baseline.

Do not replace placeholders with “all current changes”. The manifest must identify an intentionally reviewed release candidate.
