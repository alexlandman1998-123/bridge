# Arch9 MVP — 3C staging apply preflight

3C joins the staging-only environment check, 3B change evidence, migration freeze, captured ledger, and approved canonical plan. It is a hard stop: it does not apply a migration.

Run it only in the clean release worktree:

```bash
MVP_TARGET_ENV=staging \
MVP_STAGING_PROJECT_REF=<staging-project-ref> \
SUPABASE_URL=https://<staging-project-ref>.supabase.co \
VITE_SUPABASE_URL=https://<staging-project-ref>.supabase.co \
SUPABASE_ANON_KEY=<staging-anon-key> \
VITE_SUPABASE_ANON_KEY=<staging-anon-key> \
npm run mvp:staging:apply-preflight -- \
  --ledger=docs/staging-migration-ledger.json \
  --change-evidence=docs/staging-change-evidence.json \
  --canonical-plan=docs/staging-canonical-migration-plan.json
```

It must return `ready_for_human_approved_staging_apply`. The current release deliberately returns `no_go` until every timestamp collision has a separately reviewed forward-only reconciliation migration. Do not bypass it with `supabase db push`, `db reset`, or migration repair.

Once it is ready, the named database owner must execute the separately reviewed forward-only staging change and capture the applied migration list and deployment result. This repository deliberately has no automatic database-apply command.
