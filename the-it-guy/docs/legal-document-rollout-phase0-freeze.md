# Legal Document Rollout - Phase 0 Release Freeze

Phase 0 is a local, fail-closed repository freeze before any staging or production rollout work. It is deliberately a `FROZEN`/`HOLD` control, never a release approval or a claim that production is healthy.

It binds a single clean Git commit, the package lockfile, the self-validated B1 review-manifest digest and its evidence project, the disabled repository pilot posture, scale-up disabled, and every known initial or expansion release-authority record in an inert state. The Phase 4 pilot-activation receipt placeholder, `config/legal-document-rollout-phase4-pilot-activation.json`, must already exist in that frozen source alongside the earlier receipt placeholders; a later receipt may modify that regular file but may never add it. `productionProjectRef` and the B1 evidence project are separate and must differ: evidence from one environment must never be silently treated as production. It also makes two safe exceptions explicit: already-issued signer journeys may finish and already-finalised PDFs remain downloadable through their existing resolver.

## What it does not certify

Phase 0 does not verify deployed Edge Functions, database migrations, the Vercel artifact, runtime secrets, live pilot state, template/storage drift, or current legal approval. Those are verified later by the staging, Phase 4, and Phase 5 controls.

## Create the proposed freeze

Run this only from a clean release commit. It performs no writes and never contacts Supabase or Vercel.

```bash
npm run freeze:legal-documents:rollout-phase0 -- \
  --environment=production \
  --project-ref=<exact-production-project-ref> \
  --frozen-by=<accountable-person> \
  --release-owner=<accountable-person> \
  --legal-owner=<accountable-person> \
  --operations-owner=<accountable-person> \
  --reference=<change-ticket>
```

Only when the result is `FROZEN`, review the emitted `proposedFreeze` and make a **receipt-only commit** containing `config/legal-document-rollout-phase0-freeze.json`. The frozen source commit is the clean parent commit that the proposal bound; the receipt commit must not change source, migrations, functions, package files, or deployment configuration.

The verifier allows a descendant of the frozen source only when every intervening commit changes exclusively one allowlisted rollout receipt: Phase 0 once, Phase 1 once as pending and once as evidence-recorded, Phase 2 once, Phase 3 once, Phase 4 once, and—only if Phase 4 is followed—the Phase 5 pilot-observation receipt once. Phase 4 is the sole permitted successor to Phase 3; Phase 5 is the sole permitted successor to Phase 4 and is terminal. The frozen source must already contain both inert Phase 4 and Phase 5 receipt placeholders; no receipt commit may introduce either. This avoids a circular “the receipt must be in the commit it hashes” requirement while still rejecting every runtime/source change. The manifest digest covers every meaningful field, including people, timestamp, reference, commit, lockfile, and authority state.

## Verify the freeze

```bash
npm run verify:legal-documents:rollout-phase0
```

`HOLD` is the expected result for an incomplete manifest, a dirty workspace, a changed commit or lockfile, an enabled/non-empty pilot, enabled scale-up, B1 binding drift, or any issued/claimed/staged expansion authority.

Do not use this control to mutate a live pilot. If an emergency hold is required, use the existing guarded A3 deactivation operator; it changes the runtime kill switch only after explicit project confirmation and leaves signed artifacts intact.
