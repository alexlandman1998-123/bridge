# Supabase Phase 12 — Production Database Recovery Proof

Generated: 2026-07-20T12:35:32Z

## Outcome

**Status: PRODUCTION_DATABASE_RECOVERY_PROVEN**

The production database recovery path was proven using the completed physical backup restored into the independent `Arch9 Staging` project. Alexander Landman explicitly attested the result through the Phase 12 instruction. Production remained online and was queried read-only; no in-place restore or production mutation was performed.

## Recovery evidence

| Check | Result |
| --- | --- |
| Production project | `isdowlnollckzvltkasn` — healthy |
| Restored project | `vaszuxjeoajeuhlcnzzf` — healthy |
| Organization and region | Match |
| Backup mechanism | Physical WAL-G backups |
| Completed backups available | 8 |
| Rehearsal source backup | `1159413531`, completed `2026-07-20T03:09:30.071Z` |
| Restored project created | `2026-07-20T08:30:16.693529Z` |
| Production migration baseline restored | 433/433 ledger versions |
| Core relation fingerprints | 5/5 exact matches |
| Restored row identities compared | 671 |
| Restored database connectivity | Pass |
| Production mutations | None |

The five comparisons cover `auth.users`, `public.profiles`, `public.organisations`, `public.transactions`, and `public.transaction_attorney_assignments`. Only counts and one-way identity-set fingerprints are stored; no customer row values are included in the evidence.

## Scope boundary

This proves **database** recovery for the migration release. Supabase physical database backups contain database records and Storage metadata, but they do not restore deleted Storage objects themselves. Edge Functions, Auth configuration, API keys, Realtime settings, webhooks, network controls, and other platform configuration also require separate continuity procedures.

Accordingly:

- `storageObjectRecoveryTested` remains `false`.
- `platformConfigurationRecoveryTested` remains `false`.
- The Phase 7 database migration runner may accept this evidence.
- This evidence must not be described as a complete whole-platform disaster-recovery test.

Supabase documentation: [Database backups](https://supabase.com/docs/guides/platform/backups) and [Restore to a new project](https://supabase.com/blog/restore-to-a-new-project).

## Phase 23 re-verification

The recovery verifier now derives the live production expectation from the signed 433-row restore baseline plus unique reviewed promotions. After Phase 23 it passed at 481/481 production versions, normalized the 17 reviewed minute/second precision ledger pairs, reconfirmed all five identity fingerprints, and found 501 total rows on the forward-migrated staging ledger.

## Phase 24 re-verification

After Phase 24, the same baseline-plus-reviewed-promotions rule expects and finds 489/489 production ledger rows. The restored recovery baseline remains unchanged; the eight Phase 24 production entries are represented by reviewed closeout evidence, and the forward-migrated staging ledger contains 503 rows.

## Phase 25 re-verification

After Phase 25, the rule expects and finds 492/492 production ledger rows. The three reviewed Phase 25 entries are additive to the signed recovery baseline, and the forward-migrated staging ledger contains 504 rows.

## Phase 29 re-verification

After Phase 29, the baseline-plus-reviewed-promotions rule expects 500 production ledger rows: the signed 433-row recovery baseline plus 67 unique reviewed promotions. The eight attorney-accounting versions are represented by per-version production evidence; canonical prerequisite `202607180025` retained its existing historical ledger entry.

## Phase 30 re-verification

After Phase 30, the baseline-plus-reviewed-promotions rule expects 501 production ledger rows: the signed 433-row recovery baseline plus 68 unique reviewed promotions. Attorney-calendar version `202607180047` was repair-only because its target state was already live and passed the production behavior suite.

## Phase 31 re-verification

After Phase 31, the baseline-plus-reviewed-promotions rule expects 504 production ledger rows: the signed 433-row recovery baseline plus all 71 unique reviewed governed promotions. The final conditional legal-master chain was applied and verified without activating an organisation rollout.

After Phase 32, the same rule expects 511 rows: the signed 433-row recovery baseline plus 78 unique reviewed governed promotions. The verifier passes at 511/511. Recovery remains proven; the separate migration freeze remains held for local-only `202607200014`.
