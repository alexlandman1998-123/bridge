# Supabase Phase 15 — Production Batch 1

Generated: 2026-07-20

## Outcome

**Status: PRODUCTION_BATCH_1_COMPLETE**

The three `settings_governance` migrations were promoted to production project `isdowlnollckzvltkasn` one at a time through the Phase 7 gate:

1. `202607170026` — job-title governance
2. `202607170027` — role and permission governance
3. `202607170028` — ownership transfer governance

Each migration was applied without changing its ledger entry, verified independently, and only then recorded as applied. The production ledger increased from 433 to 436 rows.

## Verification

- All three canonical ledger versions and names are present.
- The existing 58 organisation memberships were preserved.
- 50 recognised job titles were backfilled; 8 unmapped memberships remain null by design.
- There are zero invalid non-null job titles.
- Job-title, role, and ownership-transfer functions are live.
- Anonymous execution of privileged setters is revoked; authenticated execution is granted.
- Unauthenticated setter/transfer probes, changed-value direct writes, and self-role/self-transfer probes were denied with their expected SQL states.
- Behavior probes used caught exceptions or transaction-local state and left no residue.

The migration intentionally preserves two organisations with multiple owner-role memberships and two with multiple primary-owner flags for separate reviewed cleanup. It does not silently rewrite ownership.

## Release state

Production closeout evidence is now 3/64. The Phase 0 freeze remains active, and the unrelated duplicate local migration version `202607200002` must still be resolved before final closeout.

Detailed production evidence is stored in `migration-evidence/2026-07-20-production-phase15-batch1/`.
