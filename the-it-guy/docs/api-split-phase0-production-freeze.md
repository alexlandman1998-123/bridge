# Phase 0 — Production Schema Freeze

Status: active as of 2026-09-06.

Production (`isdowlnollckzvltkasn`) is stable but its historical migration ledger is not a safe promotion source. The existing staging project is also not a valid promotion source because it has independently drifted.

## Rules

- Do not run `supabase db push`, `supabase db reset`, or `supabase migration repair` against production.
- Do not promote the existing staging database to production.
- Do not add ordinary migration files while the freeze is active.
- All production schema work is read-only diagnostics unless a confirmed user-facing incident requires a minimal emergency patch.
- An emergency patch requires: documented approval, a narrow SQL file, a live object check, and a rollback/no-residue check where applicable.

The local guard is intentionally fail-closed:

```bash
npm run supabase:phase0
npm run supabase:db-push
```

The second command must block. An override is not a release mechanism; it only makes an approved emergency action auditable:

```bash
BRIDGE_SUPABASE_PHASE0_OVERRIDE=I_UNDERSTAND_PRODUCTION_SCHEMA_FREEZE npm run supabase:db-push
```

## Current recovery path

The isolated `Arch9 Schema Baseline Rehearsal` project is the only environment allowed to receive schema-bootstrap experiments. The verified production `public`-schema capture is its input; production data, auth users, and application traffic are excluded.

Phase 0 exits only when the clean rehearsal baseline is reproducible and the release owner explicitly approves the replacement staging path.
