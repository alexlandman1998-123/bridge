# Phase 33 — Lock the Pull-Request Scope

## Decision

**Status: PULL_REQUEST_SCOPE_LOCKED**

Pull request #1 is limited to the controlled pilot release already certified in production, its 78 governed migrations through `202607200013`, and the evidence required to make that release reproducible and reviewable.

The production application boundary is commit `333c08eb420742a95330b07483d3c373f4978d6a`. Phase 32 governance closes at `3d4888d8941a7cd9f214086f0a7db13f284c6757`.

## Concurrent work isolation

Commit `ae47263888191e8178c7f7ebb7c0824eca628135` added attorney-module, attorney-workflow, legal-document-editor, email-layout, and onboarding changes after Phase 32. It also added migrations `202607200014` and `202607209904`.

Phase 33 excludes that commit from the release through the normal revert commit `670419e866e0b02cc6e1ff327d6c8735416b83f2`. History was not rewritten and the work was not destroyed: it remains available at `ae472638` for a later feature branch and its own staging and production governance.

Phase 34 detected a second post-lock runtime change at `21c158375da84a47113bab7046bde34f63640a6d`. Revert commit `94cf6383cf544c8a11902b505ba36999328d5eb8` preserves that change in history while restoring the locked runtime tree.

## Allowed follow-up work

Until PR #1 is ready, further commits may only:

- refresh release evidence for the existing production runtime;
- correct CI tests or workflows that contain stale release counts or fingerprints;
- diagnose and repair the Supabase Preview environment without broadening application scope;
- document or verify the controlled pilot release.
- maintain release gates by deriving migration totals from the governed inventory rather than stale historical constants.

New runtime capability, new migrations, and unrelated UI or email work require an explicit scope amendment and separate certification.

## Phase 39 scope amendment

Phase 39 explicitly admits eight mandate-generation correction paths introduced through runtime commit `b7b9760f`. These changes repair conditional-master verification and prevent route/control text from being mistaken for mandate body content. They are certified as a release candidate, not represented as already deployed production source.

The production baseline remains commit `333c08eb`. All other runtime work remains denied by default, and promoting the Phase 39 candidate remains a separate operator-controlled action after review and merge.

Phase 39 also admits one database-history repair: `202605090000_production_schema_baseline.sql`. It derives from the schema snapshot at commit `4ee5387b`, immediately before the repository's first incremental migration; its forward transaction foreign keys are deferred until `public.transactions` exists so the same schema can be built from empty. It exists only to make a fresh Supabase Preview reconstructible; it does not authorize any new product schema or a production database mutation. Before merge, production must attest this baseline version as already represented by its existing schema so the historical snapshot is not replayed there.

## Safety outcome

- Production was not redeployed.
- Production data and migration history were not changed.
- The Phase 0 migration freeze remains active.
- The excluded work is recoverable from its original commit.
- A machine-readable scope contract and CI gate now prevent the excluded migrations or runtime work from silently re-entering this pull request.
