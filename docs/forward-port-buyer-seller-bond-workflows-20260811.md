# Buyer, Seller, And Bond Workflow Forward-Port

Date: 2026-08-11

Integration branch:

`codex/forward-port-buyer-seller-bond-workflows-20260811`

Baseline:

`3227d045f6900cfe24c844a79585d312b74190fb`

## Phase 0 Scope Lock

This branch exists to forward-port missing buyer, seller, and bond-originator workflow work onto current `main`.

Do not raw-merge the source branches. They are behind current `main` and include broad diffs that can remove or overwrite newer production work.

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
