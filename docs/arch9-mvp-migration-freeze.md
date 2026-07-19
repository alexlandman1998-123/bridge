# Arch9 MVP migration freeze

Until the staging ledger is reconciled, migration work is frozen outside `codex/arch9-mvp-release`.

- Do not create, rename, delete, or edit files under `supabase/migrations` from another branch or worktree.
- Do not use `supabase db push`, `db reset`, or `migration repair` against staging or production while the ledger is unresolved.
- Any necessary forward-only MVP migration must first be added to `docs/arch9-mvp-release-manifest.json` and reviewed in the dedicated release branch.

Run this check before any migration-related commit or deployment preparation:

```bash
npm run mvp:freeze:migrations
```

This freeze does not delete or alter existing migration work. It is a guardrail while the real staging ledger is classified and reconciled.
