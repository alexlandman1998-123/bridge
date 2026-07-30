# Phase 10: Deployment Check

Date: 2026-07-29

## Scope

Check deployment readiness for the remaining public intake PR and verify the current production deployment state. No deployment, rollback, promotion, branch deletion, or PR merge was performed in this phase.

## Current PR

PR #7 remains the only open PR:

- URL: `https://github.com/alexlandman1998-123/bridge/pull/7`
- Branch: `codex/agency-public-intake-pr`
- Head commit: `19c9e85da4f9b14f78bbb18f409185be9baec4b3`
- Base: `main`
- Draft: yes
- Git mergeability: mergeable
- GitHub merge state: blocked

## GitHub Check State

Passing:

- `Vercel Preview Comments`
- `Vercel - bridge`
- `Vercel - bridge-admin`

Failing:

- `Supabase Phase 0 Guard / Verify broad migration commands remain blocked`
- `Supabase Phase 8 Closeout Gate / Verify reconciliation closeout remains fail-closed`

Skipped:

- `Supabase Preview`

## Vercel Preview State

### `bridge`

- Project: `bridge`
- Project ID: `prj_rbfXykMU6mU1eECbc0lJS9sPspmp`
- Latest PR #7 deployment ID: `dpl_GnNRjmQfmn4Wcr41V6HNnjNCcdfq`
- Deployment URL: `https://bridge-lzs50xpqt-alexs-projects-f5496a21.vercel.app`
- Branch alias: `https://bridge-git-codex-agency-public-i-3a540f-alexs-projects-f5496a21.vercel.app`
- State: `READY`
- Source branch: `codex/agency-public-intake-pr`
- Source commit: `19c9e85da4f9b14f78bbb18f409185be9baec4b3`
- Source commit message: `Expose public intake settings entry`

HTTP probe:

- Direct preview URL returned `302` to Vercel SSO.
- Branch alias returned `302` to Vercel SSO.

Interpretation:

The preview deployment exists and is ready, but it is protected by Vercel Authentication, so the rendered page could not be publicly inspected via an unauthenticated HTTP fetch.

### `bridge-admin`

- Project: `bridge-admin`
- Project ID: `prj_UBUboNzbfFH5vNfaWgKE6heEgrK7`
- GitHub status: success
- Vercel deployment list via connector: `403 Forbidden`

Interpretation:

GitHub reports the `bridge-admin` deployment as green, but the Vercel connector did not have permission to list this project's deployment records.

## Production Deployment Finding

The current `bridge` production aliases appear to be serving a deployment promoted from the old unclean branch:

- Production deployment ID: `dpl_8WuaGPQT5QDCmubpPosA8yFBiarT`
- Deployment URL: `https://bridge-b39tec4dx-alexs-projects-f5496a21.vercel.app`
- Target: `production`
- State: `READY`
- Source branch: `codex/agency-public-intake-phase8`
- Source commit: `3441fee1e318aaa5be3ad1cd327a825f29f9a932`
- Source commit message: `ag2g`
- Source: `redeploy`
- Action: `promote`
- Production aliases:
  - `https://app.arch9.co.za`
  - `https://bridgenine.co.za`
  - `https://app.bridgenine.co.za`
  - `https://bridge-alexs-projects-f5496a21.vercel.app`
  - `https://bridge-git-codex-agency-public-i-247ad5-alexs-projects-f5496a21.vercel.app`

Production HTTP probes:

- `https://app.arch9.co.za/` returned `200`.
- `https://app.bridgenine.co.za/` returned `200`.
- `https://app.arch9.co.za/intake/test-agency` returned `200` with the SPA shell.

Both production HTML responses included:

```html
<meta name="arch9-release" content="3441fee1e318aaa5be3ad1cd327a825f29f9a932" />
```

Interpretation:

Production is not currently serving `origin/main` commit `37ab3322c68cce6ed6808d064e62009ca5505ca0`. It appears to be serving the old `codex/agency-public-intake-phase8` middle commit that Phase 3 explicitly excluded from the clean PR because it mixed unrelated work into the public intake branch.

This should be treated as a production drift finding. No rollback or promotion was performed in this phase.

## Local Deployment Readiness

Commands run on `codex/agency-public-intake-pr`:

```bash
node server/tests/publicAgencyIntakeApi.test.js
node server/tests/publicListingsService.test.js
node src/services/__tests__/agencyPublicIntakeLinkService.test.js
git diff --check origin/main..HEAD
npm run build
```

Results:

- Public agency intake API tests passed.
- Public listings service tests passed.
- Public intake link service tests passed.
- Diff whitespace check passed.
- Production build passed.

Build note:

- Vite reported existing large chunk warnings after minification.
- The build completed successfully.
- Built artifact includes `dist/assets/PublicAgencyIntakePage-C2e-Duf-.js`.

## Supabase Gate Findings

### Phase 0 Guard

Local test:

```bash
node scripts/supabase-phase0-guard.test.mjs
```

Result: passed.

PR #7 adds these migration files:

- `supabase/migrations/202607290002_agency_public_intake_links_phase1.sql`
- `supabase/migrations/202607290003_agency_public_intake_submissions_phase2.sql`
- `supabase/migrations/202607290004_agency_public_intake_phase8_automation.sql`

PR #7 currently has no labels.

Interpretation:

The GitHub Phase 0 workflow includes a PR-only migration freeze step. Because PR #7 adds migration files and does not have the `database-reconciliation` label, the workflow is expected to fail even though the guard unit test passes.

### Phase 8 Closeout Gate

Local test:

```bash
node scripts/supabase-phase8-closeout.test.mjs
```

Result: failed.

Underlying plan command:

```bash
node scripts/supabase-phase8-closeout.mjs --plan --json
```

Result highlights:

- `status`: `LOCAL_CLOSEOUT_NOT_READY`
- `readyForFreezeRetirement`: `false`
- `missingManifestFiles`: `202607250001_seller_portal_payload_optional_enrichment_guard.sql`
- `ledgerDriftResolution.status`: `LEDGER_DRIFT_BLOCKED`
- `ledgerDriftResolution.counts.blockers`: `128`

Interpretation:

The closeout gate is a real blocker, not just a Vercel/deployment flake.

## Deployment Readiness Decision

PR #7 is not ready for production merge/deploy yet.

Reasons:

- PR #7 is still draft.
- Supabase Phase 0 Guard is failing because the PR adds migrations without the required reconciliation path/label.
- Supabase Phase 8 Closeout Gate is failing locally and in GitHub.
- Current production appears to be serving a promoted deployment from the old unclean `codex/agency-public-intake-phase8` branch commit `3441fee1`, not `origin/main`.

## Recommended Next Actions

1. Decide whether to roll production back or promote the latest clean `main` deployment, because production currently appears drifted from `origin/main`.
2. Resolve the Supabase Phase 8 closeout blocker before merging public intake migrations.
3. Decide whether PR #7 should use the `database-reconciliation` label or whether the public intake migrations should be held until the migration freeze is lifted.
4. Once checks are green, convert PR #7 from draft to ready and rerun merge readiness.
