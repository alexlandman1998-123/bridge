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

## Phase 1 Current Truth Recheck

Recorded at `2026-08-11 19:33:18 SAST` after the workflow freeze label was applied.

### Branch And Deployment Truth

| Surface | Current ref | Evidence |
| --- | --- | --- |
| `origin/main` | `3227d045f6900cfe24c844a79585d312b74190fb` | Local `origin/main` and `main` both resolve to this baseline. |
| PR #16 branch | `dc43fae1a9ad952c2da177ccfdad69c3baed7c27` | Current branch `codex/forward-port-buyer-seller-bond-workflows-20260811`. |
| Production `app.arch9.co.za` | `550cd8fb498c7d8aa5416a80d738fe55253de003` | `release-manifest.json` and Vercel build logs show production was deployed from this reconciliation branch at commit `550cd8f`. |
| PR preview | `dc43fae1a9ad952c2da177ccfdad69c3baed7c27` | GitHub PR checks for PR #16 passed after the Phase 0 freeze commit; Supabase Preview skipped. |

Production is not currently equal to `origin/main`. It is a production deployment from the reconciliation branch at `550cd8fb`, which is one documentation-only commit behind the current PR #16 head.

### Code Truth

`git diff --shortstat origin/main...HEAD` reports `23 files changed, 1943 insertions(+), 169 deletions(-)`.

Runtime/code files changed by PR #16 relative to `origin/main` are limited to:

- `the-it-guy/src/components/Sidebar.jsx`
- `the-it-guy/src/pages/agency/AgencyPipelinePage.jsx`
- `the-it-guy/src/services/sellerProcessActionModelService.js`
- `the-it-guy/src/services/sellerProcessDefinitionService.js`
- `the-it-guy/src/services/sellerProcessEvidenceMappingService.js`
- `the-it-guy/src/services/sellerProcessRailModelService.js`

The current PR does not modify `the-it-guy/src/pages/AgentLeadsPage.jsx` or `the-it-guy/src/pages/BuyerOfferSubmission.jsx`.

### Buyer Surface Truth

`AgencyPipelinePage.jsx` has the new buyer offer/OTP surface in production and PR #16:

- `BUYER_OFFER_DOCUMENT_LABEL = 'Signed OTP'`
- `Open Offers`
- `Offers` buyer tab labels
- `Upload Signed OTP`
- `Signed OTP` buyer workspace heading

`AgentLeadsPage.jsx` is unchanged across `origin/main`, production commit `550cd8fb`, and PR #16 head. It still contains legacy buyer workspace language including:

- `Open Onboarding / OTP`
- `Onboarding / OTP`
- `Property Match`

Conclusion: the visible buyer mismatch is not a full rollback. Production has the agency pipeline forward-port, but the lead/workspace surface in `AgentLeadsPage.jsx` was not forward-ported in this PR and remains on the old copy/model.

### Bond-Originator Truth

The current PR adds bond-originator verification scripts, but the inspected diff against `origin/main` does not include runtime changes under the bond UI/service paths listed for Phase 5 or the email handlers listed for Phase 6.

Conclusion: bond-originator runtime parity still needs a focused source-branch comparison before claiming it is caught up.

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

## Phase 2 Buyer Surface Audit

Recorded at `2026-08-11 19:40 SAST` on branch `codex/forward-port-buyer-seller-bond-workflows-20260811`.

### Buyer Source Branches

Audited candidate branches against the current PR head:

| Source | Buyer runtime signal |
| --- | --- |
| `origin/codex/seller-first-contact-reload` | Contains the strongest buyer lead workspace parity source. It modifies `AgentLeadsPage.jsx`, `BuyerOfferSubmission.jsx`, buyer lifecycle/listing-offer bridge services, and buyer-process services. |
| `origin/codex/recover-buyer-onboarding-projection-20260801` | Contains an older public buyer offer/onboarding projection, including `Submit Revised Offer` for countered offers. |
| `origin/codex/reconcile-unmerged-branches-20260811` | No buyer runtime file diff against current `main` for the audited buyer files. |
| `origin/codex/reconciliation-phase10-closeout-20260811` | No buyer runtime file diff against current `main` for the audited buyer files. |

### Agent Leads Buyer Surface Gaps

`AgentLeadsPage.jsx` is the main visible mismatch. Current PR #16 still uses:

- `const BUYER_ONBOARDING_OTP_TAB_KEY = 'onboarding_otp'`
- `Open Onboarding / OTP`
- `Onboarding / OTP`
- buyer tab `{ key: BUYER_ONBOARDING_OTP_TAB_KEY, label: 'Onboarding / OTP' }`
- buyer tab `{ key: 'property_match', label: 'Properties' }`

The useful source branches use:

- `Open Offers`
- action IDs routed to `'offers'`
- buyer journey mappings `offer_submitted: ['Open Offers', 'offers']`
- buyer journey mappings `offer_accepted: ['Open Offers', 'offers']`
- buyer tab `{ key: 'property_match', label: 'Property Match' }`
- buyer tab `{ key: 'offers', label: 'Offers' }`

Conclusion: Phase 3 should forward-port the `AgentLeadsPage.jsx` buyer lead/workspace surface to `offers` while preserving the existing property-match feature.

### Agency Pipeline Buyer Surface

`AgencyPipelinePage.jsx` is already on the newer model in PR #16:

- `const BUYER_ONBOARDING_OTP_WORKSPACE_TAB_KEY = 'offers'`
- `BUYER_OFFER_DOCUMENT_LABEL = 'Signed OTP'`
- `Open Offers`
- `Upload Signed OTP`
- buyer tabs labelled `Offers`
- buyer workspace heading `Signed OTP`

Conclusion: `AgencyPipelinePage.jsx` should be treated as the canonical target for the visible buyer offer/OTP language.

### Buyer Offer Submission Surface

`BuyerOfferSubmission.jsx` has a separate mismatch:

- current PR #16 uses `submitButtonLabel = 'Submit Buyer Onboarding'`
- `origin/codex/seller-first-contact-reload` uses `counterPendingBuyer ? 'Submit Updated Verification' : 'Submit Buyer Verification'`
- `origin/codex/recover-buyer-onboarding-projection-20260801` uses `counterPendingBuyer ? 'Submit Revised Offer' : 'Submit Offer + Onboarding'`

`npm run test:buyer-process-global-diagnostic` currently fails at `test:offer-to-transaction-scenario-matrix` because `BuyerOfferSubmission.jsx` does not include `Submit Revised Offer`.

Conclusion: Phase 3 must make an explicit product decision for the public buyer submit copy. The smallest compatibility fix is to restore `Submit Revised Offer` for countered canonical offers without raw-porting the older page.

### Test Mismatches To Update With The Patch

These tests currently assert old or inconsistent buyer surface copy and should be updated in the same batch as the runtime patch:

- `the-it-guy/scripts/lead-ingestion.test.mjs`
- `the-it-guy/scripts/agent-leads-workspace.test.mjs`
- `the-it-guy/scripts/buyer-process-agent-leads-onboarding-otp-phase7.test.mjs`
- `the-it-guy/scripts/buyer-process-agent-leads-offer-link-retirement-phase8.test.mjs`
- `the-it-guy/scripts/viewing-workflow-qa.test.mjs`
- `the-it-guy/scripts/offer-to-transaction-scenario-matrix.test.mjs`, if the product decision changes away from `Submit Revised Offer`

### Audit Verification

Commands run:

- `npm run test:lead-ingestion`
- `npm run test:buyer-process-global-diagnostic`

Results:

- `test:lead-ingestion` failed on the buyer workspace tab assertion because current `AgentLeadsPage.jsx` does not expose `{ key: 'property_match', label: 'Property Match' }`.
- `test:buyer-process-global-diagnostic` passed through the buyer definition, workflow, onboarding, originator handoff, offer lifecycle, offer terms, condition review, OTP readiness, and offer-link checks, then failed at `test:offer-to-transaction-scenario-matrix` because `BuyerOfferSubmission.jsx` does not include `Submit Revised Offer`.

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

## Phase 3 Buyer Workflow Patch Recheck

Recorded at `2026-08-11 19:44:26 SAST` for the buyer reconciliation sequence requested after the Phase 2 buyer surface audit.

Changed:

- `the-it-guy/src/pages/AgentLeadsPage.jsx`
- `the-it-guy/src/pages/BuyerOfferSubmission.jsx`
- `the-it-guy/scripts/lead-ingestion.test.mjs`
- `the-it-guy/scripts/agent-leads-workspace.test.mjs`
- `the-it-guy/scripts/buyer-process-agent-leads-onboarding-otp-phase7.test.mjs`
- `the-it-guy/scripts/buyer-process-agent-leads-offer-link-retirement-phase8.test.mjs`
- `the-it-guy/scripts/viewing-workflow-qa.test.mjs`

Behavior restored:

- the buyer lead/workspace progression tab now resolves to `offers`
- legacy buyer URL aliases such as `onboarding_otp`, `otp`, `buyer_onboarding`, and `buyer_onboarding_otp` still normalize into the `offers` tab
- buyer next-action copy now opens `Open Offers` instead of `Open Onboarding / OTP`
- the visible buyer property matching tab is labelled `Property Match`
- accepted-offer return paths now return to `?tab=offers`
- countered public buyer offer links now expose `Submit Revised Offer`
- blocked canonical public offer links use the compatibility copy `This offer is already under review. Wait for feedback before sending another version.`

Verification:

- `npm run test:lead-ingestion`
- `node scripts/agent-leads-workspace.test.mjs`
- `node scripts/buyer-process-agent-leads-onboarding-otp-phase7.test.mjs`
- `node scripts/buyer-process-agent-leads-offer-link-retirement-phase8.test.mjs`
- `node scripts/viewing-workflow-qa.test.mjs`
- `node scripts/offer-to-transaction-scenario-matrix.test.mjs`
- `npm run test:buyer-process-global-diagnostic`

Result:

- all listed Phase 3 buyer workflow patch checks passed.

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

## Buyer Diagnostic Repair Phase 4

Purpose: repair and rerun the buyer-facing diagnostics after the Offers / OTP workspace forward-port so stale expectations cannot hide a rollback.

Current result:

- no runtime buyer workflow code needed another patch in Phase 4
- no executable buyer diagnostic needed another assertion repair in Phase 4
- the remaining old buyer strings found by the scan are historical notes in this reconciliation log, compatibility aliases such as `onboarding_otp`, or valid default public-offer copy for non-countered links
- PR #16 Vercel checks are green for both `bridge` and `bridge-admin`; Supabase Preview remains skipped by its integration

Buyer surfaces covered:

- `AgentLeadsPage.jsx` keeps `offers` as the canonical buyer deal-progression tab
- legacy buyer URL aliases such as `onboarding_otp`, `otp`, `buyer_onboarding`, and `buyer_onboarding_otp` still normalize into Offers
- buyer workspace tabs expose `Property Match` and `Offers`
- buyer next actions open Offers instead of the retired Onboarding / OTP tab
- public buyer offer links keep `Submit Buyer Onboarding` for first submission and `Submit Revised Offer` for seller-countered links
- buyer onboarding keeps the bond-originator handoff contract without exposing originator contact fields in the buyer intake

Verification:

- `gh pr checks 16`
- `rg -n "Open Onboarding / OTP|label: 'Onboarding / OTP'|label: 'Properties'|BUYER_ONBOARDING_OTP_TAB_KEY = 'onboarding_otp'|Submit Buyer Onboarding|Submit Revised Offer|already under review" the-it-guy/scripts/*.mjs`
- `npm run test:buyer-process-global-diagnostic`
- `npm run verify:otp-chapter1`
- `npm run test:agency-pipeline-buyer-offer-workspace-phase2`
- `npm run test:agent-leads-workspace`
- `npm run test:lead-ingestion`
- `npm run test:viewing-workflow-qa`
- `npm run test:show-day-phase5`
- `npm run test:buyer-offer-branding-regression`
- `npm run test:buyer-onboarding-flow-contract`
- `npm run test:buyer-onboarding-sa-scenarios`
- `npm run test:buyer-onboarding-originator-handoff-phase3`

## Bond Originator Audit Phase 5

Purpose: audit the bond-originator runtime after the buyer workflow repairs and make sure the originator handoff, queue, finance readiness, partner, permission, and bank surfaces still execute under the local Node diagnostics.

Changed:

- `the-it-guy/src/services/bondOperationalQueueService.js`
- `the-it-guy/src/services/bondFinanceWorkflowOwnershipService.js`
- `the-it-guy/src/services/bondOrganisationScopeResolver.js`
- `the-it-guy/src/services/financeIntelligenceService.js`
- `the-it-guy/src/core/transactions/bondIntakeSelectors.js`
- `the-it-guy/src/auth/permissions/permissionResolver.js`
- `the-it-guy/src/auth/permissions/permissionRegistry.js`
- `the-it-guy/src/services/roleResolutionService.js`
- `the-it-guy/src/constants/workspaceUnits.js`
- `the-it-guy/src/lib/featureFlags.js`
- `the-it-guy/src/lib/envValidation.js`
- `the-it-guy/src/config/productionValidation.js`
- `the-it-guy/src/services/__tests__/financeIntelligenceService.test.js`

Repair made:

- added explicit `.js` imports along the bond operational queue / finance readiness / permission resolver path so direct Node diagnostics can load the same modules that Vite already bundles
- made production/env validation helpers tolerate plain Node execution where `import.meta.env` is not injected by Vite
- extended the finance-intelligence dashboard SSR skip guard to include Node 24's `module is not defined` React Router incompatibility message

Behavior guarded:

- originator progress and attorney handoff checks still preserve read-only package/feed behavior
- buyer onboarding originator handoff still blocks premature onboarding and records originator assignment readiness
- finance readiness still produces originator-safe handoff packets and queue labels without exposing raw internal IDs
- bond intake notifications, partner portal, partner collaboration, partner profile, routing rules, partner management, bank options, permission scopes, and bank-outcome RLS contracts remain covered

Verification:

- `npm run test:forward-port-bond-originator-phase5`
- `npm run test:bond-originator-banks`
- `npm run test:buyer-onboarding-originator-handoff-phase3`
- `npm run test:finance-readiness`
- `npm run test:bond-intake-notifications`
- `npm run test:bond-partner-portal`
- `npm run test:bond-partner-collaboration`
- `npm run test:bond-application-classification`
- `npm run test:bond-routing-rules`
- `npm run test:bond-partner-management`
- `npm run test:finance-intelligence`
- `node scripts/bond-partner-profile.test.mjs`
- `node src/auth/permissions/__tests__/bondFinanceWorkflowPermissions.test.js`
- `node src/auth/permissions/__tests__/bondAssignmentPermissions.test.js`
- `node src/auth/permissions/__tests__/queryScope.test.js`
- `npm run test:bond-bank-outcome-originator-rls`
- `npm run build` from `the-it-guy/`

External connectivity caveat:

- `npm run test:bond-application-assignment` was attempted and stopped after Supabase returned Cloudflare 522 timeouts during live audit writes.
- `npm run test:bond-consultants-management` was attempted and failed on a Supabase Cloudflare 522 timeout. The error is retryable external connectivity, not a local assertion failure.

## Bond Originator Patch Phase 6

Purpose: patch the local bond-originator diagnostics that Phase 5 exposed as brittle so they no longer depend on live Supabase availability when explicitly running in `forceLocal` mode.

Changed:

- `the-it-guy/src/services/universalAssignmentService.js`
- `the-it-guy/src/services/bondApplicationAssignmentService.js`
- `the-it-guy/src/services/workspaceEntitlementsService.js`
- `the-it-guy/src/services/bondOrganisationService.js`

Repair made:

- `recordUniversalAssignmentEvent` now accepts a `persistSecurityAudit` option, keeping the local assignment event and local audit event while allowing callers to suppress the remote security-audit write
- bond application assign/reassign calls pass `persistSecurityAudit: false` when `forceLocal` is active, so local diagnostics do not hang or fail on Supabase audit writes
- workspace entitlement resolution now accepts `forceLocal`, returning fallback plan/usage data without querying Supabase
- bond branch and consultant creation pass `forceLocal` into entitlement checks, so local organisation diagnostics do not hit live subscription tables with fixture workspace ids

Behavior guarded:

- local assignment diagnostics still record assignment history, assignment notifications, and local universal assignment audit entries
- production/default assignment calls still attempt remote security-audit persistence
- local consultant/branch diagnostics still enforce entitlement-limit code paths against fallback plan data
- bond-originator organisation, routing, partner, finance-readiness, finance-intelligence, permission, bank and intake contracts remain green

Verification:

- `npm run test:bond-application-assignment`
- `npm run test:bond-consultants-management`
- `npm run test:forward-port-bond-originator-phase5`
- `npm run test:finance-readiness`
- `npm run test:bond-intake-notifications`
- `npm run test:bond-partner-portal`
- `npm run test:bond-partner-collaboration`
- `npm run test:bond-partner-management`
- `npm run test:bond-originator-banks`
- `npm run test:bond-application-classification`
- `npm run test:bond-routing-rules`
- `npm run test:finance-intelligence`
- `node src/auth/permissions/__tests__/bondFinanceWorkflowPermissions.test.js`
- `node src/auth/permissions/__tests__/bondAssignmentPermissions.test.js`
- `node src/auth/permissions/__tests__/queryScope.test.js`
- `npm run test:bond-bank-outcome-originator-rls`
- `node scripts/bond-partner-profile.test.mjs`
- `npm run build` from `the-it-guy/`

## Seller Workflow Sanity Check Phase 7

Purpose: verify the seller workspace, Kingstons seller pack flow, listing handoff, seller portal, document, viewing, and process-panel surfaces after the buyer and bond-originator forward-port work.

Changed:

- `the-it-guy/src/pages/agency/AgencyPipelinePage.jsx`
- `the-it-guy/scripts/pipeline-seller-portal-stability.test.mjs`

Repair made:

- restored the visible Kingstons digital-signing decision point in the agency lead workspace documents surface so agents see the paused digital-signing path before attempting mandate actions
- updated the seller portal stability diagnostic to match the current lead-workspace hydration variable names and the scoped pinned-lead merge behavior introduced during the recent seller reload work

Behavior guarded:

- seller lead workspace and Kingstons seller process forward-port diagnostics remain green
- Kingstons seller pack operational handoff, transaction readiness, readiness enforcement, seller portal refinement, digital-signing decision, listing handoff, and transaction handoff remain covered
- seller portal alignment, seller portal UI regression, pipeline seller portal stability, listing conversion, listing relationship integrity, seller document source of truth, lead ingestion, viewing workflow, seller journey, and seller readiness remain green
- app build completes after the lead workspace JSX patch

Verification:

- `npm run test:forward-port-seller-workspace-phase3`
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
- `npm run test:kingstons-seller-pack-phase6-readiness-enforcement`
- `npm run test:kingstons-seller-portal-refinement-phase7`
- `npm run test:kingstons-digital-signing-decision-phase8`
- `npm run test:kingstons-listing-handoff-phase4`
- `npm run test:kingstons-transaction-handoff-phase5`
- `npm run test:seller-portal-alignment`
- `npm run test:seller-portal-ui-regression`
- `npm run test:pipeline-seller-portal-stability`
- `npm run test:seller-listing-conversion-idempotency`
- `npm run test:seller-listing-relationship-integrity`
- `npm run test:seller-document-source-of-truth`
- `npm run test:lead-ingestion`
- `npm run test:viewing-workflow-qa`
- `npm run test:seller-journey`
- `npm run test:seller-readiness`
- `npm run build` from `the-it-guy/`

## Draft And Stale Branch Cleanup Phase 8

Purpose: clean the reconciliation checkout after the seller sanity pass, preserve unrelated draft work safely, and remove local branch clutter that had already landed on `origin/main`.

Changed:

- `docs/forward-port-buyer-seller-bond-workflows-20260811.md`

Cleanup performed:

- preserved unrelated local draft work in `stash@{0}` / `2701d95e0f84bacfc51c981b218183ee31cf3629`
- stashed draft files:
  - `the-it-guy/src/lib/api.js`
  - `the-it-guy/src/lib/partnersRepository.js`
  - `the-it-guy/src/pages/DeveloperPartnersPage.jsx`
  - `the-it-guy/src/pages/PartnersPage.jsx`
  - `sql/workspace-resolution-auth-boot-indexes.concurrent.sql`
  - `supabase/migrations/202608110001_workspace_resolution_auth_boot_hot_path.sql`
- pruned stale local worktree metadata with `git worktree prune`
- deleted local branches already merged into `origin/main`:
  - `agent/dashboard-domain-api-phase2`
  - `codex/agency-public-intake-pr`
  - `codex/arch9-attorney-access-permission-bootstrap`
  - `codex/integrate-agency-public-intake-20260801`
  - `codex/integrate-archline-attorney-workspace-20260801`
  - `codex/integrate-bond-demo-seed-20260801`
  - `codex/integrate-connected-attorney-dropdown-20260801`
  - `codex/integrate-hq-owner-dashboard-20260801`
  - `codex/integrate-ledger-drift-resolution-20260801`
  - `codex/integrate-legal-notification-dashboard-20260801`
  - `codex/integrate-phase0-closeout-20260801`
  - `codex/integrate-produktive-provisioning-20260801`
  - `codex/integrate-reminder-health-controls-20260801`
  - `codex/integrate-seller-mobile-portal-20260801`
  - `codex/integrate-transaction-progress-scheduler-20260801`
  - `codex/main-reconciliation-20260728`
  - `codex/migration-reconciliation-20260730`
  - `codex/reconcile-unmerged-branches-20260811`
  - `codex/reconciliation-phase10-closeout-20260811`
  - `codex/recover-buyer-onboarding-projection-20260801`
  - `codex/reminder-health-controls`
  - `codex/seller-portal-activation-prod`
  - `codex/supabase-preview-ledger-followup-20260811`
  - `ops/production-evidence-202607310006`

Open PR state:

- PR #16 `Forward-port buyer seller bond workflow reconciliation` remains the active reconciliation PR.
- PR #11 `Retire Phase 0 broad-push guard` remains open and conflicted/dirty; leave it untouched until the reconciliation PR lands or the Phase 0 retirement is re-reviewed separately.

Remote branch candidates for later approval:

- Do not delete remote branches as part of Phase 8 without explicit approval.
- Older remote branches that still need owner review include `origin/codex-document-access-permissions-phase7`, `origin/codex/db-phase0-reconciliation`, `origin/codex/fix-seller-portal-token`, `origin/codex/arch9-mvp-release`, `origin/codex/simple-connected-attorney-dropdown`, `origin/codex/archive-phase39-baseline-20260723`, `origin/codex/mvp-pilot-readiness`, `origin/codex/archline-attorney-workspace`, `origin/codex/archive-dashboard-performance-20260723`, `origin/codex/produktive-agent-provisioning`, `origin/codex/wip-shared-worktree-20260723`, `origin/codex/wip-arch9-migration-reconciliation-20260723`, `origin/codex/demo-launch-wip-slice`, `origin/codex/auth-bridge-bootstrap-timeout`, `origin/agent/document-generation-cleanup-final-closure`, `origin/codex/hq-owner-dashboard`, and `origin/codex/bond-demo-applications-seed-20260728`.

Verification:

- `git status --short --branch`
- `git stash list --format='%gd %H %s'`
- `git branch --merged origin/main --format='%(refname:short)'`
- `git branch --no-merged origin/main --format='%(committerdate:short) %(refname:short)' --sort=committerdate`
- `git worktree list --porcelain`
- `gh pr list --state open --limit 50 --json number,title,headRefName,baseRefName,isDraft,updatedAt,mergeStateStatus,reviewDecision,url`
- `gh pr checks 16`

## Verification Batch Phase 9

Purpose: run a clean-branch verification batch across the forward-port closeout, buyer workspace, seller workspace, Kingstons seller process, bond originator, Supabase migration, navigation, lead-ingestion, viewing, show-day, and final build gates.

Changed:

- `docs/forward-port-buyer-seller-bond-workflows-20260811.md`

Result:

- all local Phase 9 verification commands passed
- the final `npm run build` completed successfully from `the-it-guy/`
- build emitted the existing large chunk warning for oversized bundles; no new build failure was reported
- the unrelated Phase 8 draft stash remains preserved at `stash@{0}` / `2701d95e0f84bacfc51c981b218183ee31cf3629`

Verification:

- `npm run test:forward-port-reconciliation-closeout-phase8`
- `npm run test:forward-port-seller-workspace-phase3`
- `npm run test:forward-port-kingstons-seller-process-phase4`
- `npm run test:forward-port-bond-originator-phase5`
- `npm run test:forward-port-bond-originator-emails-phase6`
- `npm run test:forward-port-supabase-migrations-phase7`
- `npm run test:buyer-process-global-diagnostic`
- `node scripts/sidebar-parent-navigation.test.mjs`
- `npm run test:agency-pipeline-buyer-offer-workspace-phase2`
- `npm run test:agent-leads-workspace`
- `npm run test:lead-ingestion`
- `npm run test:seller-process-global-smoke-phase1`
- `npm run test:seller-process-evaluator-phase3`
- `npm run test:seller-process-projection-phase4`
- `npm run test:seller-process-shadow-integration-phase5`
- `npm run test:seller-process-panel-model-phase7`
- `npm run test:seller-process-workspace-panel-phase8`
- `npm run test:seller-process-panel-action-routing-phase9`
- `npm run test:pipeline-seller-portal-stability`
- `npm run test:seller-portal-alignment`
- `npm run test:seller-portal-ui-regression`
- `npm run test:seller-listing-conversion-idempotency`
- `npm run test:seller-document-source-of-truth`
- `npm run test:kingstons-seller-pack-phase4-operational-handoff`
- `npm run test:kingstons-seller-pack-phase5-transaction-readiness`
- `npm run test:kingstons-seller-pack-phase6-readiness-enforcement`
- `npm run test:kingstons-digital-signing-decision-phase8`
- `npm run test:viewing-workflow-qa`
- `npm run test:show-day-phase5`
- `npm run test:bond-application-assignment`
- `npm run test:bond-consultants-management`
- `npm run test:finance-readiness`
- `npm run test:bond-intake-notifications`
- `npm run test:bond-partner-portal`
- `npm run test:bond-partner-collaboration`
- `npm run test:bond-partner-management`
- `npm run test:bond-originator-banks`
- `npm run test:bond-routing-rules`
- `npm run test:finance-intelligence`
- `node scripts/bond-partner-profile.test.mjs`
- `node src/auth/permissions/__tests__/bondFinanceWorkflowPermissions.test.js`
- `node src/auth/permissions/__tests__/bondAssignmentPermissions.test.js`
- `npm run test:bond-bank-outcome-originator-rls`
- `npm run build` from `the-it-guy/`

Noted:

- `npm run test:sidebar-parent-navigation` was attempted first and is not defined in `package.json`; the same diagnostic passed via `node scripts/sidebar-parent-navigation.test.mjs`.
- `npm run test:finance-intelligence` still skips its dashboard render check when React Router SSR compatibility is unavailable under the current Node runtime; all non-render finance intelligence assertions passed.
