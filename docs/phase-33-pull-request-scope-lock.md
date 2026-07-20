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

New runtime capability, new migrations, and unrelated UI or email work require an explicit scope amendment and separate certification.

## Safety outcome

- Production was not redeployed.
- Production data and migration history were not changed.
- The Phase 0 migration freeze remains active.
- The excluded work is recoverable from its original commit.
- A machine-readable scope contract and CI gate now prevent the excluded migrations or runtime work from silently re-entering this pull request.
