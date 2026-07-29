# Supabase Phase 23: Production One-Row Promotion

Generated: `2026-07-29T19:45:20Z`

## Scope

Phase 23 promotes production one migration version at a time through the existing production wrapper. It does not use broad `supabase db push`, does not bypass staging evidence, and does not mutate production unless Phase 5 marks the selected row ready.

## Result

Status: `BLOCKED_STAGING_EVIDENCE_MISSING`

| Field | Value |
| --- | ---: |
| Rows considered | 32 |
| Ready for production | 0 |
| Blocked rows | 32 |
| SQL promotion rows | 26 |
| Repair-only ledger rows | 6 |
| Production env configured | No |
| Production recovery locked | Yes |
| Production mutation attempted | No |

## Production Promotion Gate

The production promotion planning gate was regenerated:

```bash
node scripts/supabase-push-phase5-production-promotion.mjs
```

It produced:

- `docs/supabase-push-phase-5-production-promotion-report.md`
- `docs/supabase-push-phase-5-production-promotion.json`

The gate reports `0/32` rows ready for production because every current runner row is missing reviewed staging evidence.

## One-Row Promotion Probe

The one-version production wrapper was run in plan mode for the first queued row:

```bash
node scripts/supabase-push-promote-production-one-version.mjs --version 202607270013 --plan --json
```

It produced:

- `docs/supabase-push-production-one-version-report.md`
- `docs/supabase-push-production-one-version.json`

Selected row:

| Field | Value |
| --- | --- |
| Version | `202607270013` |
| Stream | `legal_document_runtime` |
| Route | `production_no_sql_record_after_smoke` |
| Status | `PROMOTION_BLOCKED` |
| Mutation attempted | No |

Blockers:

- `phase5_production_promotion_not_ready`
- `phase5_staging_evidence_missing`

## Required Before Real Production Promotion

Phase 23 can only promote rows after Phase 21 and Phase 22 complete against a real non-production staging target.

For each row:

1. Apply or smoke the row in staging using `scripts/supabase-phase6-staging-execution.mjs`.
2. Record reviewed staging evidence under `docs/staging-evidence/<version>-<stream>.json`.
3. Rerun `node scripts/supabase-push-complete-staging-evidence.mjs`.
4. Rerun `node scripts/supabase-push-phase5-production-promotion.mjs`.
5. Promote exactly one ready version:

```bash
node scripts/supabase-push-promote-production-one-version.mjs --version <version> --apply-sql --confirm APPLY_TO_PRODUCTION
node scripts/supabase-push-promote-production-one-version.mjs --version <version> --record-applied --confirm APPLY_TO_PRODUCTION
```

For `production_no_sql_record_after_smoke` rows, skip `--apply-sql` and use only `--record-applied` after production smoke evidence exists.

## Validation Commands

```bash
node scripts/supabase-push-promote-production-one-version.test.mjs
node scripts/supabase-phase7-production-execution.test.mjs
node scripts/supabase-push-phase6-record-production-evidence.test.mjs
node scripts/supabase-phase8-closeout.test.mjs
node scripts/supabase-resolve-ledger-drift.test.mjs
node scripts/supabase-phase0-guard.test.mjs
node scripts/supabase-push-complete-staging-evidence.test.mjs
git diff --check
```

All commands passed.

## Closeout Alignment

Phase 23 also refreshed closeout accounting:

- `docs/supabase-phase-8-closeout-report.md` now reports `0/32` production evidence rows complete.
- `docs/supabase-ledger-drift-resolution-report.md` still reports `LEDGER_DRIFT_BLOCKED`.
- The Phase 8 closeout scope now keeps all 32 production-promotion rows visible, even when none are ready for production yet.

## Phase 23 Outcome

Production promotion is intentionally blocked. The one-row promotion tooling is in place and verified, but there is no eligible production row until staging evidence exists for the current 32-row train.
