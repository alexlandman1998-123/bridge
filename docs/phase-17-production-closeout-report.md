# Phase 17 — Production Closeout

## Decision

**Status: PRODUCTION_CLOSEOUT_BLOCKED**

Production is operational: Vercel deployment `dpl_5cGZ8ii4g7KVJtSSjCMB4s5siiD7` is READY at `https://app.arch9.co.za`, browser smoke checks pass, and the first-hour scan contains zero runtime errors and zero HTTP 500 responses. Supabase is `ACTIVE_HEALTHY`; short-lived linked access succeeds and the live ledger count of 469 exactly matches the Phase 12 baseline plus 36 reviewed promotions.

Final closeout remains blocked by five release-governance conditions:

1. Production migration evidence is 36/64; 28 manifest migrations remain.
2. Local migration version `202607200002` has two files.
3. The deployed application included uncommitted source changes and cannot be reconstructed from a single commit.
4. The release branch is 14 commits ahead of its remote tracking branch.
5. The document-experience rollout defaults to shadow mode and has no production control/cohort configured.

## Subsequent remediation

Phase 19 resolved the duplicate migration version. Phase 20 then proved that the former uncommitted application changes were captured in commit `785b7ef1`, pushed to the tracked branch, and automatically deployed by Vercel as production deployment `dpl_441tuc5PAD2vPGj6r2CCusmmPqnX`. The live release marker, committed runtime-source fingerprint, clean build inputs, guarded rebuild, and all 428 deployed critical assets pass. The Phase 17 evidence remains an immutable point-in-time record; these two blockers are now superseded by their later evidence.

## Exit criteria

Closeout may be rerun after all 64 migration rows have reviewed evidence, the duplicate version is resolved, the application working tree is reviewed and committed, the release branch is pushed through the normal review path, and an explicit production rollout decision is recorded. Until then, retain the Phase 0 migration guard and do not label the release fully closed.

## Maintenance correction

The Phase 13 access verifier previously expected the historical 433-row recovery baseline forever. It now derives the expected live ledger from that approved baseline plus unique reviewed production-promotion evidence. The corrected check passes at 469/469 without weakening project, credential, recovery, or linked-target validation.
