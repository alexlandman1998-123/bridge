# Branch reconciliation — 5 September 2026

## Scope and baseline

This register reconciles the repository against `origin/main` at
`2c0d8b4154bbd307965fdfd67964a04e3c347a42`. Remote references were refreshed
with `git fetch --prune origin` before this assessment.

The outcome is deliberately conservative: an old divergent branch is not a
safe merge candidate merely because it contains commits not on `main`.

## Decisions

### 1. Already-integrated remote branches — candidate prune list

The following 14 remote branches are already contained in `origin/main`.
They are eligible for remote deletion only after the release owner confirms the
exact list; none were deleted during this phase.

- `agent/dashboard-domain-api-phase2`
- `codex/agency-public-intake-pr`
- `codex/arch9-attorney-access-permission-bootstrap`
- `codex/hq-owner-dashboard`
- `codex/main-reconciliation-20260728`
- `codex/migration-reconciliation-20260730`
- `codex/reconcile-unmerged-branches-20260811`
- `codex/reconciliation-phase10-closeout-20260811`
- `codex/recover-buyer-onboarding-projection-20260801`
- `codex/reminder-health-controls`
- `codex/seller-portal-activation-prod`
- `codex/supabase-preview-ledger-followup-20260811`
- `debie_dejager_branch`
- `ops/production-evidence-202607310006`

### 2. Unmerged divergent branches — no direct merge

There are 30 remote branches not merged into the baseline. Every one is
materially behind `main` (171–906 commits), so no branch should be merged
wholesale. A release owner should choose one of: **selectively salvage**,
**assign an active owner and target release**, or **archive**.

#### Selective-salvage review first

These contain recent or relatively concentrated work and should be compared by
feature/file before any cherry-pick or reimplementation:

| Branch | Behind / ahead | Recommended disposition |
| --- | ---: | --- |
| `release/production-stabilization-20260830` | 171 / 15 | Review against current production baseline; salvage only verified fixes. |
| `release/client-portal-mobile-launch` | 171 / 10 | Review mobile portal changes as individual features. |
| `codex/forward-port-buyer-seller-bond-workflows-20260811` | 421 / 23 | Extract still-missing workflow fixes into new focused branches. |
| `codex/kingston-seller-process-release` | 513 / 14 | Compare seller-process behaviour before porting selected changes. |
| `codex/seller-first-contact-reload` | 447 / 14 | Review only the first-contact reload fix and its tests. |
| `codex/navigation-query-phase6` | 186 / 6 | Assess as a small, isolated navigation fix. |
| `codex/buyer-portal-phase7-cutover` | 186 / 2 | Assess the portal cutover changes individually. |

#### Archive after owner review

These are clearly labelled as old experiments, WIP, archival, demo, or
superseded MVP/release work. Preserve their refs until an owner confirms that
there is no unique change worth extracting, then archive/delete rather than
merge:

- `codex/wip-arch9-migration-reconciliation-20260723`
- `codex/wip-shared-worktree-20260723`
- `codex/demo-launch-wip-slice`
- `codex/archive-dashboard-performance-20260723`
- `codex/archive-phase39-baseline-20260723`
- `codex/mvp-pilot-readiness`
- `codex/arch9-mvp-release`
- `codex/archline-attorney-workspace`
- `codex/simple-connected-attorney-dropdown`
- `codex/db-phase0-reconciliation`
- `codex-document-access-permissions-phase7`

#### Retain pending owner/target decision

The remaining divergent branches need a named owner and release target before
they can be reconciled. Their divergence makes automatic cleanup or merging
unsafe.

- `agent/buyer-viewing-email-polish`
- `agent/document-generation-cleanup-final-closure`
- `agent/legal-document-notification-sequence-phase1`
- `codex/agency-public-intake-phase8`
- `codex/auth-bridge-bootstrap-timeout`
- `codex/bond-demo-applications-seed-20260728`
- `codex/fix-seller-portal-token`
- `codex/integrate-production-evidence-catchup-20260801`
- `codex/phase0-closeout-evidence`
- `codex/produktive-agent-provisioning`
- `codex/reconcile-migration-drift-20260731`
- `codex/seller-process-next-action-fix`

## Local safety branches

Keep `codex/phase1-workspace-snapshot-20260905` through the current release:
it is the complete pre-reconciliation safety snapshot. The following local-only
branches should also be explicitly reviewed before removal: the two
`backup/main-before-*` refs, `codex/forward-port-production-stabilization`,
`codex/private-property-isolation-20260831`,
`codex/property24-draft-quota-production`, `codex/release-amended-5b031241`,
`codex/storage-quota-recovery`, and `codex/tuckers-access-hotfix`.

## Worktree hygiene performed

`git worktree prune` removed seven stale Git metadata entries whose gitdir
targets no longer existed. It did not delete a worktree directory or repository
files. The valid rental, bond, document-trust, and user-owned worktrees remain
registered.

## Next action

Obtain confirmation for the 14 already-integrated remote branches, then delete
only that approved list. Schedule selective feature comparison for the seven
priority branches before deciding whether their remaining changes should be
ported to fresh, production-based branches.

## Phase 4 main-sync audit — 6 September 2026

The priority branches were re-audited against `codex/release-validation-tooling`
after the working tree was converted into focused commits. The comparison used
commit patch equivalence plus branch-introduced path/blob coverage; differing
tip blobs were treated conservatively because later release work can legitimately
supersede an older implementation.

| Branch | Audit evidence | Disposition |
| --- | --- | --- |
| `codex/phase1-workspace-snapshot-20260905` | The snapshot commit is now an ancestor of the release branch. Of its 182 introduced paths, 171 still match its tip exactly and 11 have deliberate later edits or retirements. | **Represented / retain as safety history.** Do not merge or cherry-pick. |
| `codex/private-property-isolation-20260831` | 35 graph-unique commits; all 182 introduced paths exist in the release tree, but only 19 match the old tip exactly and the stream contains operational evidence plus mutation tooling. | **Partially represented / selective review required.** Do not merge wholesale; Phase 5 must separate durable code from environment-specific execution evidence. |
| `release/production-stabilization-20260830` | 15 divergent commits, four patch-equivalent; all 228 introduced paths exist, with 39 exact tip matches and 189 subsequently evolved files. | **Partially represented / selective review required.** Validate auth shell, route-loading, performance-gate and promotion behavior individually in Phase 5. |
| `release/client-portal-mobile-launch` | 10 graph-unique commits; all 212 introduced paths exist, with 25 exact tip matches and 187 evolved files. | **Partially represented / selective review required.** Audit mobile behavior and each certification gate independently; no direct merge. |
| `codex/tuckers-access-hotfix` | Its sole commit is patch-equivalent to release history. All five paths exist and four have later edits. | **Already represented.** No merge or cherry-pick. |
| `codex/storage-quota-recovery` | Its four paths all exist. The release tree retains the quota-error boundary, local-draft cleanup, unstorable image filtering and guarded storage writes. Both branch-specific tests pass. | **Superseded by evolved implementation.** No merge or cherry-pick. |
| `codex/property24-draft-quota-production` | Its two paths exist and its draft-storage guard is included in the evolved storage-quota implementation above. | **Superseded.** No merge or cherry-pick. |
| `codex/navigation-query-phase6` | Six graph-unique commits; all 304 introduced paths exist, but only eight match the old tip exactly and 296 have subsequently evolved. | **Partially represented / selective review required.** Phase 5 must test navigation-query and digital-card behavior against the current implementation. |
| `codex/buyer-portal-phase7-cutover` | Two graph-unique commits; all 231 introduced paths exist, with six exact tip matches and 225 evolved files. | **Partially represented / selective review required.** Validate buyer portal cutover behavior against current portal routes and contracts. |
| `codex/public-websites-phase7-pilot` | All 15 divergent commits are patch-equivalent to the rewritten website sequence on the release branch; 122 of 124 branch paths match exactly and the remaining config/env files contain later additions. | **Already represented by rewritten history.** No merge or cherry-pick. |

### Phase 4 gate

- Direct merges from all audited branches are prohibited.
- No priority branch remains unclassified.
- Closed without porting: workspace snapshot, Tuckers hotfix, storage-quota branches, and public websites pilot.
- Advance to Phase 5 selective review: Private Property isolation, production stabilization, client-portal mobile launch, navigation-query phase 6, and buyer-portal phase 7.
- No branch, tag, worktree, migration, or remote reference was changed by this audit.
