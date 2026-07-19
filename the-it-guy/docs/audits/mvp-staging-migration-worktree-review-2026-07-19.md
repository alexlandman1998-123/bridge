# Migration worktree review — 19 July 2026

## Repository result

The repository migration source is clean and internally ordered at commit `cf710f8e5141f9884d9a8e2140c70e769e20e0d2`.

- 494 SQL migration files are tracked
- no migration file is modified, staged, deleted, or untracked
- no filename is malformed
- no migration version ID is duplicated
- Git tree for `supabase/migrations`: `ab2e480169845a8b315fc1c4b56a2942721a1b1d`

The untracked files in the nested application folder are investigation reports and local validation scripts only; they do not alter the migration chain.

## Staging implication

The clean repository does **not** make the staging ledger safe. Staging still lacks 63 historical versions while recording later `202607190001–006` and `20260719130913` migrations. Its ledger gives version IDs only, so it cannot establish that historical SQL content matches the database schema.

## Rule before deployment

Freeze the current migration tree. Do not edit, delete, rename, or individually push historical gaps. The only safe route is one newly versioned, additive and idempotent reconciliation migration after `20260719130913`, preceded by schema preflight checks and followed by deployed-RPC verification.
