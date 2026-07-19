# Arch9 MVP — Phase 3 staging migration plan

Phase 3 is a controlled staging database change. It is blocked until the migration ledger is reconciled; it is not safe to use a broad push against a directory with duplicate migration timestamps.

## Required evidence

1. Link a clean release worktree to the confirmed staging project only.
2. Run `supabase migration list --linked` and save the reviewed applied-version list as a JSON evidence file:

```json
{ "projectRef": "staging-project-ref", "appliedVersions": ["202607180046"] }
```

3. Run the local gate:

```bash
npm run mvp:phase3:plan -- --ledger=docs/staging-migration-ledger.json
```

The gate must report `ready_for_human_approved_staging_apply`. It refuses to proceed when a timestamp is duplicated locally, an MVP migration is missing, or no reviewed ledger evidence is provided.

## Approved MVP migration order

1. `202607180046_mvp_atomic_transaction_creation_phase2a.sql`
2. `202607190001_mvp_seller_acceptance_canonical_creation_phase1.sql`

Do not edit either file after it has been applied. Any later correction must be a new forward-only migration.

## Human-approved staging apply

Only after the gate, 3A environment confirmation, 3B change evidence, and 3C preflight all pass, the named database owner may apply the separately reviewed forward-only change to staging. A broad `supabase db push` is prohibited while the directory contains duplicate timestamps.

```bash
MVP_TARGET_ENV=staging MVP_STAGING_PROJECT_REF=<staging-project-ref> \
SUPABASE_URL=<staging-url> VITE_SUPABASE_URL=<staging-url> \
SUPABASE_ANON_KEY=<staging-anon-key> VITE_SUPABASE_ANON_KEY=<staging-anon-key> \
npm run mvp:staging:apply-preflight -- \
  --ledger=docs/staging-migration-ledger.json \
  --change-evidence=docs/staging-change-evidence.json \
  --canonical-plan=docs/staging-canonical-migration-plan.json
SUPABASE_URL=<staging-url> SUPABASE_ANON_KEY=<staging-anon-key> \
  node the-it-guy/scripts/mvp-deployment-contract-check.mjs
```

Capture the migration-list output, deployment timestamp, project reference, and RPC-check result in the release evidence. Do not use production credentials, `db reset`, or migration repair.
