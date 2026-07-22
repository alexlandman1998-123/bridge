# Phase 21 — Push and Review the Release Branch

## Decision

**Status: RELEASE_BRANCH_PUSHED_REVIEWED_DRAFT**

`codex/mvp-pilot-readiness` is pushed to GitHub and pull request [#1](https://github.com/alexlandman1998-123/bridge/pull/1) has been updated to describe the complete controlled Arch9 pilot release. The branch is mergeable, carries the required `database-reconciliation` label, and remains a draft.

## Reviewed scope

- Phase 18 controlled-pilot scope lock.
- Phase 19 unique migration inventory and conditional-master chain allocation.
- Phase 20 committed production-source traceability.
- Phase 21 GitHub Action corrections and clean-install lockfile synchronization.

The working tree was clean and the branch matched its remote after the reviewed code push.

## Check result

| Check class | Result |
| --- | --- |
| Repository-owned checks | 12 passed, 0 failed |
| Intentionally skipped | 1 |
| Pending | 0 |
| Vercel previews | passed |
| External Supabase Preview | failed; no actionable GitHub Actions log |

The push also triggered Vercel's Git integration for the production target. The resulting deployment was READY, while the live release marker remained the already-certified `785b7ef1` runtime source with 428 critical assets. Phase 21 did not manually promote a preview, but future branch pushes must be treated as production-affecting until the Vercel production-branch configuration is reviewed.

The Supabase Preview failure links only to Supabase project `ybvgipeppmpfsrjwvwvw`. In accordance with the review boundary, Phase 21 records it as an external blocker and does not guess at or mutate that integration.

## CI repairs

The review found and fixed three repository-owned issues:

1. Phase 6 now installs the already-declared root dependencies before importing `pg`.
2. Its stale manifest assertion now expects the certified 64 rows instead of 63.
3. The Phase 7 recovery-attestation test reaches the same fail-closed result in CI without requiring a linked production workspace.

The root lockfile was also synchronized with npm 10 so Node 22 clean installs succeed.

## Safety boundary

Phase 21 pushed commits and updated pull-request metadata. It did not merge the pull request, manually promote a preview, mutate a database, or retire the Phase 0 migration freeze. Vercel did automatically create a READY production deployment from the Git push; the certified runtime source remained unchanged.

## Remaining review actions

1. Review why this branch triggers automatic Vercel production deployments.
2. Investigate or explicitly waive the external Supabase Preview failure.
3. Obtain human pull-request approval.
4. Keep the PR in draft until the controlled release sequence authorizes merge.
