# Phase 4: Refresh Branches

Date: 2026-07-29

## Scope

Refresh the active pull request branches against `origin/main`, preserve active work, and record any branches that cannot be refreshed safely without manual conflict resolution.

## Current Clean Branch

- Branch: `codex/agency-public-intake-pr`
- PR: #7, `https://github.com/alexlandman1998-123/bridge/pull/7`
- Base: `main`
- Status: refreshed and current with `origin/main`
- Action taken: no merge required

Validation on this branch:

- `node server/tests/publicAgencyIntakeApi.test.js` passed
- `node server/tests/publicListingsService.test.js` passed
- `node src/services/__tests__/agencyPublicIntakeLinkService.test.js` passed
- `git diff --check origin/main..HEAD` passed
- `npm run build` passed

Build note:

- Vite reported existing large chunk warnings after minification. The build completed successfully.

## Branches Blocked By Conflicts

The following branches were tested by merging `origin/main` into the local branch. Each merge produced conflicts and was aborted with `git merge --abort`. No merge commits were created and no pushes were made for these branches.

### PR #6: `agent/document-generation-cleanup-final-closure`

Status: refresh blocked by conflicts.

Conflicted files:

- `the-it-guy/scripts/agency-lead-workspace-hydration-smoke.mjs`
- `the-it-guy/scripts/lead-lifecycle-presentation.test.mjs`
- `the-it-guy/src/core/documents/mandateDataMapper.js`
- `the-it-guy/src/lib/agencyCrmRepository.js`
- `the-it-guy/src/pages/agency/AgencyPipelinePage.jsx`
- `the-it-guy/src/services/leadLifecyclePresentationService.js`

### PR #2: `codex/simple-connected-attorney-dropdown`

Status: refresh blocked by conflicts.

Conflicted files:

- `docs/supabase-migration-phase-5-module-drift-report.md`
- `docs/supabase-migration-phase-6-split-ledger-investigation-report.md`
- `docs/supabase-phase-5-application-manifest.json`
- `supabase/migrations/20260719201000_mvp_atomic_transaction_creation_grant_hardening.sql`
- `the-it-guy/src/pages/AgentLeadsPage.jsx`
- `the-it-guy/src/pages/SellerOnboarding.jsx`
- `the-it-guy/src/services/privateListingService.js`

### PR #1: `codex/mvp-pilot-readiness`

Status: refresh blocked by major conflicts.

Conflicted files:

- `docs/database-release-runbook.md`
- `docs/supabase-migration-phase-5-module-drift-report.md`
- `docs/supabase-migration-phase-6-split-ledger-investigation-report.md`
- `docs/supabase-phase-5-application-manifest.json`
- `docs/supabase-phase-8-closeout-evidence.json`
- `docs/supabase-phase-8-closeout-report.md`
- `package.json`
- `scripts/supabase-phase5-module-drift-audit.mjs`
- `scripts/supabase-phase6-staging-execution.mjs`
- `scripts/supabase-phase6-staging-execution.test.mjs`
- `scripts/supabase-phase7-production-execution.mjs`
- `scripts/supabase-phase7-production-execution.test.mjs`
- `scripts/supabase-phase8-closeout.mjs`
- `scripts/supabase-phase8-closeout.test.mjs`
- `supabase/functions/generate-final-signed-document/index.ts`
- `supabase/functions/generate-mandate/index.ts`
- `supabase/functions/send-email/handlers/sellerMandateSent.ts`
- `supabase/functions/send-email/types.ts`
- `supabase/functions/signer-signing-action/index.ts`
- `supabase/migrations/20260719201000_mvp_atomic_transaction_creation_grant_hardening.sql`
- `the-it-guy/package.json`
- `the-it-guy/scripts/conditional-clause-packs-phase6.test.mjs`
- `the-it-guy/scripts/document-generator-phase-g2-browser-usability.mjs`
- `the-it-guy/scripts/document-generator-phase-i3-backpressure.test.mjs`
- `the-it-guy/scripts/document-generator-phase-i5-renderer-fence.test.mjs`
- `the-it-guy/scripts/legal-document-phase3-launch-readiness.mjs`
- `the-it-guy/scripts/legal-template-source-of-truth.test.mjs`
- `the-it-guy/scripts/mandate-signing-send-responsiveness.test.mjs`
- `the-it-guy/scripts/mvp-pilot-creation-freeze.test.mjs`
- `the-it-guy/scripts/release-integrity-contract.test.mjs`
- `the-it-guy/scripts/seller-onboarding-phase5.test.mjs`
- `the-it-guy/src/components/documents/LegalDocumentWorkspace.jsx`
- `the-it-guy/src/config/productionValidation.js`
- `the-it-guy/src/core/documents/documentPartyClassification.js`
- `the-it-guy/src/core/documents/legalDocumentGenerationRecovery.js`
- `the-it-guy/src/core/documents/mandateDataMapper.js`
- `the-it-guy/src/core/documents/mandateTemplateContentScanner.js`
- `the-it-guy/src/core/documents/packetService.js`
- `the-it-guy/src/core/documents/packetStatusResolver.js`
- `the-it-guy/src/core/documents/signingOperationalStatus.js`
- `the-it-guy/src/lib/authBoot.js`
- `the-it-guy/src/lib/envValidation.js`
- `the-it-guy/src/lib/mvpPilotCreationFreeze.js`
- `the-it-guy/src/pages/AgentLeadsPage.jsx`
- `the-it-guy/src/pages/AgentListingDetail.jsx`
- `the-it-guy/src/pages/AgentListings.jsx`
- `the-it-guy/src/pages/AttorneyMattersPage.jsx`
- `the-it-guy/src/pages/AttorneyTransactionDetail.jsx`
- `the-it-guy/src/pages/LegalDocumentWorkspacePage.jsx`
- `the-it-guy/src/pages/PrincipalDashboard.jsx`
- `the-it-guy/src/pages/SellerOnboarding.jsx`
- `the-it-guy/src/pages/SignerPortal.jsx`
- `the-it-guy/src/pages/settings/SettingsSigningTemplatesPage.jsx`
- `the-it-guy/src/services/__tests__/attorneyIncomingMatterQueue.test.js`
- `the-it-guy/src/services/attorneyIncomingMatterQueue.js`
- `the-it-guy/src/services/principalDashboardService.js`
- `the-it-guy/src/services/privateListingService.js`

## Final Repository State

- Returned to branch: `codex/agency-public-intake-pr`
- Working tree state: clean except for local untracked phase reports
- Local reports present:
  - `the-it-guy/docs/git-inventory-phase1-20260729.md`
  - `the-it-guy/docs/git-protection-phase2-20260729.md`
  - `the-it-guy/docs/git-prs-phase3-20260729.md`
  - `the-it-guy/docs/git-refresh-phase4-20260729.md`

## Recommended Next Phase

Move forward with the clean public intake PR first. The older draft PRs should be handled separately: either resolve conflicts manually in dedicated refresh branches or close/supersede them if their useful work has already landed elsewhere.
