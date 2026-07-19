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

Only after the gate passes and the staging project reference is verified:

```bash
supabase link --project-ref <staging-project-ref>
supabase migration list --linked
supabase db push --linked
SUPABASE_URL=<staging-url> SUPABASE_ANON_KEY=<staging-anon-key> \
  node the-it-guy/scripts/mvp-deployment-contract-check.mjs
```

Capture the migration-list output, deployment timestamp, project reference, and RPC-check result in the release evidence. Do not use production credentials or run `db reset`.
