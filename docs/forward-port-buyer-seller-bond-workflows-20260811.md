# Buyer, Seller, And Bond Workflow Forward-Port

Date: 2026-08-11

Integration branch:

`codex/forward-port-buyer-seller-bond-workflows-20260811`

Baseline:

`3227d045f6900cfe24c844a79585d312b74190fb`

## Phase 0 Scope Lock

This branch exists to forward-port missing buyer, seller, and bond-originator workflow work onto current `main`.

Do not raw-merge the source branches. They are behind current `main` and include broad diffs that can remove or overwrite newer production work.

### Active Freeze Label

As of `2026-08-11 19:30:19 SAST`, PR #16 is the single active reconciliation PR for buyer, seller, and bond-originator workflow catch-up.

New feature work in these workflow areas is paused until the reconciliation PR is green, reviewed, merged, and production has been verified against the buyer, seller, and bond-originator surfaces.

During the freeze:

- route buyer, seller, and bond-originator recovery work through PR #16
- keep PR #16 in draft while parity patches or verification gaps remain
- treat older feature branches and draft lineages as inspection sources only
- avoid merging stale or high-risk branches directly into `main`
- avoid deployment until merged checks are green and production smoke checks pass

Allowed methods:

- inspect each source branch before applying changes
- cherry-pick only named commits after a dry run
- manually forward-port focused file ranges
- keep Supabase migrations in a separate gated pass unless a runtime phase explicitly requires them
- run verification after every batch

## Source Branches

Primary sources:

- `origin/codex/seller-first-contact-reload`
- `origin/codex/kingston-seller-process-release`
- `origin/codex/seller-process-next-action-fix`
- `origin/agent/legal-document-notification-sequence-phase1`
- `origin/agent/document-generation-cleanup-final-closure`

Comparison-only sources:

- `origin/codex/reconcile-unmerged-branches-20260811`
- `origin/codex/reconciliation-phase10-closeout-20260811`
- `origin/codex/supabase-preview-ledger-followup-20260811`

## Phase Queues

### Phase 1: Menu And Shell

Forward-port only navigation and shell behavior:

- `the-it-guy/src/components/Sidebar.jsx`
- `the-it-guy/scripts/sidebar-parent-navigation.test.mjs`
- focused shell ranges in `the-it-guy/src/pages/agency/AgencyPipelinePage.jsx`

### Phase 2: Buyer Offer / Onboarding / OTP

Forward-port buyer lead workflow, offer, onboarding, and OTP routing:

- `the-it-guy/src/pages/AgentLeadsPage.jsx`
- `the-it-guy/src/pages/BuyerOfferSubmission.jsx`
- `the-it-guy/src/lib/buyerLifecycleService.js`
- `the-it-guy/src/lib/listingOffersService.js`
- `the-it-guy/src/lib/offerBuyerOnboardingBridge.js`
- `the-it-guy/src/services/buyerProcessDefinitionService.js`
- `the-it-guy/src/services/buyerProcessMigrationService.js`
- `the-it-guy/src/lib/workflowEngine.js`

### Phase 3: Seller First-Contact / Seller Workspace

Forward-port seller lead and portal workspace behavior:

- `the-it-guy/src/pages/AgentLeadsPage.jsx`
- `the-it-guy/src/pages/SellerOnboarding.jsx`
- `the-it-guy/src/pages/ClientPortal.jsx`
- `the-it-guy/src/components/client-portal/seller/TransactionStageWorkspace.jsx`
- `the-it-guy/src/services/privateListingService.js`
- `the-it-guy/src/services/sellerDocumentRequirementsService.js`
- `the-it-guy/src/services/documents/sellerOnboardingFactTransformer.js`

### Phase 4: Kingstons Seller Process

Forward-port only missing Kingstons seller process runtime pieces:

- `the-it-guy/src/components/appointments/KingstonsSellerAppointmentsWorkspace.jsx`
- `the-it-guy/src/services/sellerProcessActionModelService.js`
- `the-it-guy/src/services/sellerProcessDefinitionService.js`
- `the-it-guy/src/services/sellerProcessEvaluationService.js`
- `the-it-guy/src/services/sellerProcessEvidenceMappingService.js`
- `the-it-guy/src/services/sellerProcessProfileService.js`
- `the-it-guy/src/services/sellerProcessRailModelService.js`
- `the-it-guy/src/services/sellerProcessShadowIntegrationService.js`
- `the-it-guy/src/services/sellerProcessWorkspaceIntegrationService.js`
- `the-it-guy/src/services/sellerProcessWorkspacePanelService.js`
- focused wiring in `the-it-guy/src/pages/AgentLeadsPage.jsx`
- focused wiring in `the-it-guy/src/pages/agency/AgencyPipelinePage.jsx`

### Phase 5: Bond Originator UI / Service

Forward-port bond-originator app/runtime deltas:

- `the-it-guy/src/components/bond/BondOriginatorAgentProgressView.jsx`
- `the-it-guy/src/components/bond/BondOriginatorAttorneyHandoffView.jsx`
- `the-it-guy/src/pages/bond/BondPartnerProfilePage.jsx`
- `the-it-guy/src/services/bondIntakeNotificationService.js`
- `the-it-guy/src/services/bondIntakeWorkflowService.js`
- `the-it-guy/src/services/bondPartnerCollaborationService.js`
- `the-it-guy/src/services/bondPartnerPortalService.js`
- `the-it-guy/src/services/bondPartnerProfileService.js`
- `the-it-guy/src/services/__tests__/bondOriginatorBankService.test.js`

### Phase 6: Bond Originator Emails

Forward-port Edge Function/email handler changes:

- `supabase/functions/send-email/handlers/bondOriginatorBuyerIntro.ts`
- `supabase/functions/send-email/handlers/bondIntakeNotification.ts`
- `supabase/functions/send-email/handlers/bondAttorneyLegalNotification.ts`

### Phase 7: Supabase Migration Review

Review separately and do not bundle into UI/runtime phases by default:

- `supabase/migrations/202608050011_agent_bond_originator_progress_detail_view.sql`
- guided bond migrations `202607280003` through `202607280015`
- originator rollout migrations `202607280016` through `202607280024`

Use the `database-reconciliation` label for any PR that restores or adds migration history.

## Phase 0 Verification

Branch created from clean `main` at `3227d045f6900cfe24c844a79585d312b74190fb`.

No runtime changes are included in Phase 0.

## Phase 1 Verification

Forward-ported the Sidebar parent navigation fix from `origin/codex/seller-first-contact-reload`.

Changed:

- `the-it-guy/src/components/Sidebar.jsx`
- `the-it-guy/scripts/sidebar-parent-navigation.test.mjs`

Inspected but not changed:

- `the-it-guy/src/pages/agency/AgencyPipelinePage.jsx`

Reason: current `main` already keeps the agent Pipeline parent landing on `/pipeline/leads`, while the source branch diff for `AgencyPipelinePage.jsx` mixes shell changes with broad buyer, seller, and OTP workflow rewrites reserved for later phases.

Verification:

- `node the-it-guy/scripts/sidebar-parent-navigation.test.mjs`
- `npm run build` from `the-it-guy/`

## Phase 2 Verification

Forward-ported the agency pipeline buyer offer workspace changes from `origin/codex/seller-first-contact-reload`.

Changed:

- `the-it-guy/src/pages/agency/AgencyPipelinePage.jsx`
- `the-it-guy/scripts/agency-pipeline-buyer-offer-workspace-phase2.test.mjs`
- buyer-process/show-day contract scripts that referenced the retired agency-pipeline OTP copy
- `the-it-guy/package.json`

Already current against source and not changed:

- `the-it-guy/src/pages/AgentLeadsPage.jsx`
- `the-it-guy/src/pages/BuyerOfferSubmission.jsx`
- `the-it-guy/src/lib/buyerLifecycleService.js`
- `the-it-guy/src/lib/listingOffersService.js`
- `the-it-guy/src/lib/offerBuyerOnboardingBridge.js`
- `the-it-guy/src/services/buyerProcessDefinitionService.js`
- `the-it-guy/src/services/buyerProcessMigrationService.js`
- `the-it-guy/src/lib/workflowEngine.js`

Behavior restored:

- legacy buyer workspace aliases such as `onboarding_otp` now route to the `offers` workspace
- buyer lead tabs expose `Documents` and `Offers`
- signed OTP upload stores a canonical `buyer_offer` document labelled `Signed OTP`
- signed OTP upload creates an accepted canonical offer instead of directly creating a transaction from the lead

Verification:

- `npm run test:agency-pipeline-buyer-offer-workspace-phase2`
- `npm run test:buyer-process-onboarding-offer-upload-phase4`
- `npm run test:buyer-process-migration-otp-deprecation-phase6`
- `npm run test:show-day-phase5`
- `npm run build` from `the-it-guy/`

Additional diagnostic:

- `npm run test:buyer-process-global-diagnostic` was attempted after the Phase 2 patch. It passed through the updated agency pipeline buyer checks and failed later in `test:offer-to-transaction-scenario-matrix` because `BuyerOfferSubmission.jsx` does not contain `Submit Revised Offer`. That gap is also absent from `origin/codex/seller-first-contact-reload`, so it is recorded as out-of-scope for this agency-pipeline forward-port batch.

## Phase 3 Verification

Forward-port check for seller first-contact and seller workspace behavior.

Changed:

- `the-it-guy/src/pages/agency/AgencyPipelinePage.jsx`
- `the-it-guy/scripts/forward-port-seller-workspace-phase3.test.mjs`
- `the-it-guy/scripts/seller-onboarding-facts.test.mjs`
- `the-it-guy/package.json`

Already current against the checked source branches and not changed:

- `the-it-guy/src/pages/AgentLeadsPage.jsx`
- `the-it-guy/src/pages/SellerOnboarding.jsx`
- `the-it-guy/src/pages/ClientPortal.jsx`
- `the-it-guy/src/components/client-portal/seller/TransactionStageWorkspace.jsx`
- `the-it-guy/src/services/privateListingService.js`
- `the-it-guy/src/services/sellerDocumentRequirementsService.js`
- `the-it-guy/src/services/documents/sellerOnboardingFactTransformer.js`

Inspected but not raw-replaced:

- broad historical diffs for `the-it-guy/src/pages/agency/AgencyPipelinePage.jsx`

Reason: the source branches still contain broad, stale diffs for the agency pipeline page, while the current integration branch already contains the seller first-contact primary action, seller profile workspace content, seller document workspace, seller-first viewing request telemetry, and first-contact logging workspace. Phase 3 applies only the missing visible agency seller workspace tab for the existing Listing Journey panel and adds a focused regression gate for those surfaces instead of replaying the broad stale page diff.

Behavior restored:

- agency seller leads now expose the existing `Listing Journey` workspace as a visible tab
- seller onboarding fact tests now use the current final-submit requirements for tax residency, POPI consent, natural-person identity metadata, and Property Disclosure declaration acceptance

Verification:

- compared the seven named Phase 3 files against `origin/codex/seller-first-contact-reload`, `origin/codex/kingston-seller-process-release`, `origin/codex/seller-process-next-action-fix`, `origin/codex/reconcile-unmerged-branches-20260811`, and `origin/codex/reconciliation-phase10-closeout-20260811`
- `npm run test:forward-port-seller-workspace-phase3`
- `node scripts/seller-lead-display-fallback.test.mjs`
- `npm run test:lead-next-action`
- `node scripts/seller-onboarding-deadlock.test.mjs`
- `npm run test:seller-onboarding-facts`
- `npm run build` from `the-it-guy/`

Additional diagnostic:

- `npm run test:lead-ingestion` was attempted during Phase 3 verification and failed on stale buyer workspace copy assertions expecting `Property Match` and `Onboarding / OTP` in `AgentLeadsPage.jsx`. That is a buyer-workspace diagnostic mismatch outside the seller first-contact runtime patch.

## Phase 4 Verification

Forward-ported the missing Kingstons seller process runtime/model pieces.

Changed:

- `the-it-guy/src/services/sellerProcessActionModelService.js`
- `the-it-guy/src/services/sellerProcessEvidenceMappingService.js`
- `the-it-guy/src/services/sellerProcessRailModelService.js`
- `the-it-guy/src/services/sellerProcessDefinitionService.js`
- `the-it-guy/scripts/forward-port-kingstons-seller-process-phase4.test.mjs`
- `the-it-guy/scripts/seller-process-evaluator-phase3.test.mjs`
- `the-it-guy/scripts/seller-process-panel-model-phase7.test.mjs`
- `the-it-guy/package.json`

Already current against the checked source branches and not changed:

- `the-it-guy/src/components/appointments/KingstonsSellerAppointmentsWorkspace.jsx`
- `the-it-guy/src/services/sellerProcessEvaluationService.js`
- `the-it-guy/src/services/sellerProcessProfileService.js`
- `the-it-guy/src/services/sellerProcessProjectionService.js`
- `the-it-guy/src/services/sellerProcessShadowIntegrationService.js`
- `the-it-guy/src/services/sellerProcessWorkspaceIntegrationService.js`
- `the-it-guy/src/services/sellerProcessWorkspacePanelService.js`
- `the-it-guy/src/pages/AgentLeadsPage.jsx`
- focused Kingstons wiring in `the-it-guy/src/pages/agency/AgencyPipelinePage.jsx`

Behavior restored:

- restored the split Kingstons seller process action, rail, and evidence mapping service APIs from `origin/codex/kingston-seller-process-release`
- restored the explicit `valuation_presented` Kingstons stage and evidence gate so scheduled presentation and completed presentation are separate stops
- kept the newer consolidated projection/workspace panel runtime intact
- partner projections still hide internal Kingstons process stage keys

Verification:

- compared the Phase 4 runtime queue against `origin/codex/seller-first-contact-reload`, `origin/codex/kingston-seller-process-release`, `origin/codex/seller-process-next-action-fix`, `origin/codex/reconcile-unmerged-branches-20260811`, and `origin/codex/reconciliation-phase10-closeout-20260811`
- `npm run test:forward-port-kingstons-seller-process-phase4`
- `npm run test:seller-process-evaluator-phase3`
- `npm run test:seller-process-projection-phase4`
- `npm run test:seller-process-global-smoke-phase1`
- `npm run test:seller-process-shadow-integration-phase5`
- `npm run test:seller-process-panel-model-phase7`
- `npm run test:seller-process-workspace-panel-phase8`
- `npm run test:seller-process-panel-action-routing-phase9`
- `npm run test:kingstons-seller-pack-phase4-operational-handoff`
- `npm run test:kingstons-seller-pack-phase5-transaction-readiness`
- `npm run build` from `the-it-guy/`

## Phase 5 Verification

Forward-port check for bond-originator UI and service surfaces.

Changed:

- `the-it-guy/scripts/forward-port-bond-originator-phase5.test.mjs`
- `the-it-guy/package.json`

Already current against the checked source branches and not changed:

- `the-it-guy/src/components/bond/BondOriginatorAgentProgressView.jsx`
- `the-it-guy/src/components/bond/BondOriginatorAttorneyHandoffView.jsx`
- `the-it-guy/src/pages/bond/BondPartnerProfilePage.jsx`
- `the-it-guy/src/services/bondIntakeNotificationService.js`
- `the-it-guy/src/services/bondIntakeWorkflowService.js`
- `the-it-guy/src/services/bondPartnerCollaborationService.js`
- `the-it-guy/src/services/bondPartnerPortalService.js`
- `the-it-guy/src/services/bondPartnerProfileService.js`
- `the-it-guy/src/services/__tests__/bondOriginatorBankService.test.js`

Inspected source branches:

- `origin/codex/seller-first-contact-reload`
- `origin/codex/kingston-seller-process-release`
- `origin/codex/seller-process-next-action-fix`
- `origin/codex/reconcile-unmerged-branches-20260811`
- `origin/codex/reconciliation-phase10-closeout-20260811`
- `origin/agent/legal-document-notification-sequence-phase1`
- `origin/agent/document-generation-cleanup-final-closure`
- `origin/codex/bond-demo-applications-seed-20260728`
- `origin/codex/agency-public-intake-phase8`
- `origin/codex/agency-public-intake-pr`

Behavior guarded:

- bond-originator agent progress remains a read-only originator package feed
- attorney handoff remains read-only and uses captured grant evidence without mutating bank decisions
- bond intake notifications keep the buyer intro and originator-managed finance gates
- bond intake workflow keeps assign, accept, and decline controls plus assigned originator fields
- partner portal, collaboration, and partner profile surfaces keep their current portal events, tables, request handling, and finance campaign hooks
- bond originator bank tests keep active bank options, commission terms, and captured agreement references covered

Verification:

- compared the Phase 5 runtime queue against the inspected source branches listed above
- `npm run test:forward-port-bond-originator-phase5`
- `npm run test:bond-originator-banks`
- `node scripts/bond-partner-profile.test.mjs`
- `npm run test:bond-intake-notifications`
- `npm run test:bond-partner-portal`
- `npm run test:bond-partner-collaboration`

## Phase 6 Verification

Forward-port check for bond-originator Edge Function email handlers.

Changed:

- `the-it-guy/scripts/forward-port-bond-originator-emails-phase6.test.mjs`
- `the-it-guy/package.json`

Already current against the checked source branches and not changed:

- `supabase/functions/send-email/handlers/bondOriginatorBuyerIntro.ts`
- `supabase/functions/send-email/handlers/bondIntakeNotification.ts`
- `supabase/functions/send-email/handlers/bondAttorneyLegalNotification.ts`

Inspected but not changed:

- `supabase/functions/send-email/index.ts`
- `supabase/functions/send-email/types.ts`
- `supabase/functions/send-email/handlers/emailBrandingHandlers.test.ts`
- `supabase/functions/send-email/content/brandedTemplates.test.ts`

Reason: the seller source branches match the current handler queue, while the legal-document, bond-demo, and agency-public-intake source branches are behind the current branded email handler implementation. Current already includes the branded buyer-intro and intake handlers, the bond/attorney/legal notification handler, the router entries, and the expanded payload type contracts.

Behavior guarded:

- bond originator buyer intro emails keep shared branding, branded sender formatting, consultant reply-to, and the originator detail summary
- bond intake notifications keep the email enablement gate, branded layout, intake summary, and application CTA
- bond attorney/legal notifications keep direct and queued dispatch support, service-role dispatch authorization, notification queue controls, notification event claiming, communication delivery logging, idempotent Resend dispatch, and branded workflow summaries
- `send-email` router and payload types keep the bond intake, buyer intro, and bond/attorney/legal route contracts

Verification:

- compared the Phase 6 handler queue against the source and comparison branches listed above
- `npm run test:forward-port-bond-originator-emails-phase6`
- `deno test --allow-read --no-check supabase/functions/send-email/handlers/emailBrandingHandlers.test.ts`
- `deno test --no-check supabase/functions/send-email/content/brandedTemplates.test.ts`
- `npm run test:bond-intake-notifications`
- `npm run build` from `the-it-guy/`

## Phase 7 Verification

Forward-port review for the Supabase migration queue.

Changed:

- `the-it-guy/scripts/forward-port-supabase-migrations-phase7.test.mjs`
- `the-it-guy/package.json`

Already current and not changed:

- `supabase/migrations/202608050011_agent_bond_originator_progress_detail_view.sql`
- guided bond migrations `202607280003` through `202607280015`
- originator rollout migrations `202607280016` through `202607280024`

Reason: all Phase 7 migration files are already present locally. Several source branches are missing this migration history entirely, while `origin/codex/agency-public-intake-phase8` has an older `202607280005` shape that gates multiple column additions behind a single first-column existence check. Current keeps the safer per-column `add column if not exists` form, so no SQL was replaced.

Behavior guarded:

- the complete timestamped guided bond and originator rollout migration queue remains present and ordered
- surety/revision migration keeps idempotent `add column if not exists` additions for submission supersession fields
- guided bond submission, participant, export, originator intake, progress, offer/grant, buyer decision, agent view, attorney handoff, recipient format and governance migrations remain present
- rollout phases R1 through R9 keep readiness, workspace, document request, progress, offer/grant capture, pilot, hardening, multi-originator and optional formal integration history
- originator migration history keeps read-only/no-live-delivery/no-bank-workflow-mutation safety flags
- detailed agent progress view keeps document request, offer capture and grant capture detail output

Verification:

- compared the Phase 7 migration queue against the source and comparison branches listed above
- `npm run test:forward-port-supabase-migrations-phase7`
- `npm run test:guided-bond-application-phase7`
- `npm run test:forward-port-bond-originator-phase5`
- `npm run test:bond-originator-banks`
- `npm run build` from `the-it-guy/`

## Phase 8 Verification

Reconciliation closeout and draft PR readiness gate.

Changed:

- `the-it-guy/scripts/forward-port-reconciliation-closeout-phase8.test.mjs`
- `the-it-guy/package.json`

Behavior guarded:

- Phase 0 through Phase 7 verification sections remain recorded in this reconciliation document
- targeted phase verification scripts remain wired in `package.json`
- branch scope stays on `codex/forward-port-buyer-seller-bond-workflows-20260811`
- reconciliation remains a draft PR/checks-first workflow
- production deployment remains blocked from this branch

Verification:

- `npm run test:forward-port-reconciliation-closeout-phase8`
- `git grep -n -E '^(<<<<<<<|=======|>>>>>>>)' -- .`
- `npm test`
- `npm run build` from `the-it-guy/`

Deployment decision:

No production deployment is authorized from Phase 8. Open the reconciliation PR as a draft, wait for GitHub and Vercel checks to go green, mark ready only after review, and deploy only from the merged `main` commit after the deployment gate passes.

Draft reconciliation PR:

- https://github.com/alexlandman1998-123/bridge/pull/16
