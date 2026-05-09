# Listing Intake Current-State Audit

Date: 2026-05-09  
Scope: Agent Module listing intake, seller onboarding, mandate flow, stock/listing creation sources, and related document/status wiring.

## 1. Executive Summary
- The private seller listing workflow is currently **local/runtime-first** (`localStorage`) across seller leads, listing drafts, onboarding submission, mandate signing, and activation.
- The only clear **Supabase-backed stock path** in active use is the development unit inventory (`units` table) via `saveDevelopmentUnit` / `createUnit`.
- Seller lead conversion to listing in Pipeline creates a **listing draft**, not a canonical Supabase listing row.
- Listing visibility in `/listings` is biased to **active private listings** + **development units/transactions**; pre-activation seller drafts are mostly operational in Pipeline/Seller portal.
- Mandate generation exists in packet APIs, but seller-side mandate signing/activation still runs through local draft workflow.

## 2. Current Listing / Stock Creation Paths

| Path | Entry Point | Main Function(s) | Primary Write Target | Creates | Required Inputs (observed) | Initial Status/Stage | Appears After Create |
|---|---|---|---|---|---|---|---|
| A | `Listings -> New Listing` (`/listings`) | `handleSaveListing` in `AgentListings.jsx` -> `createAgentSellerLead` + `createListingDraftFromSellerLead` | `localStorage` (`itg:agent-seller-leads:v1`, `itg:agent-listing-drafts:v1`) | Seller lead + listing draft | seller name, surname, email, phone, property address, property type | lead `onboarding_sent`; listing draft `seller_onboarding_sent` | Pipeline/seller workflow records update immediately; active listings grid only after later activation |
| B | `Pipeline -> Leads` seller actions | `handleSendSellerOnboarding`, `handleCreateListingFromSellerLead` in `AgencyPipelinePage.jsx` | Local CRM store (`itg:agency-crm:v1:*`) + seller workflow local stores | CRM lead stage updates + seller workflow lead + listing draft | selected seller lead with contact/property data | lead stages like `Onboarding Sent`, `Converted To Listing`; draft stage depends on mandate status | Lead stays visible in Pipeline; listing draft linked by `listingId` (draft id) |
| C | Seller onboarding link flow | `SellerOnboarding.jsx` -> `updateSellerWorkflowRecordByToken`, `createListingDraftFromSellerLead` | Seller workflow local stores | Updates seller onboarding data and draft snapshot | token + onboarding form fields | `onboarding_completed` / `seller_onboarding_completed` on submit | Pipeline listeners update from browser events |
| D | Seller mandate signing flow | `SellerPortal.jsx` -> `updateListingDraft`, `activateListingDraft` | Local drafts + local private listings (`itg:agent-private-listings:v1`) | Promotes draft to active private listing | mandate confirm checkbox + signer name + draft ready checks | draft `mandate_signed` -> listing `listing_active` | Listing appears in Listings cards (`/listings`) |
| E | Development stock management | `DevelopmentDetail.jsx` / `AddUnitModal.jsx` | `saveDevelopmentUnit`, `createUnit` in `api.js` | **Supabase `units` table** | development id, unit number (+ optional unit attributes/pricing) | typically `Available` | Development inventory and transaction/unit views |
| F | Demo/mock seeding | `ensureAgentModuleDemoSeed` in `App.jsx`, `agentDemoSeed.js` | Local storage seed keys (`itg:agent-private-listings:v1`, `itg:pipeline-leads:v1`, etc.) | Seeded private listings, leads, demo transactions | profile email + seed rules | mixed seeded states | Immediately visible across agent pages |
| G | Legacy pipeline page (non-primary) | `Pipeline.jsx` seller form | `createAgentSellerLead` + `createListingDraftFromSellerLead` | Seller workflow local stores | seller name/email min in this form | onboarding sent flow | same local seller workflow records |

## 3. Seller Lead -> Listing Conversion (Current Flow)
- **Seller leads in CRM view** are stored in `agencyPipelineService` local storage namespace (`itg:agency-crm:v1:${organisationId}`).
- `AgencyPipelinePage.handleCreateListingFromSellerLead()`:
  - builds seller payload from selected CRM lead;
  - calls `createListingDraftFromSellerLead(...)`;
  - updates local seller workflow lead (`listingDraftId`, `listingStatus`);
  - updates CRM lead to `stage/status = Converted To Listing`;
  - writes `listingId` on CRM lead (currently draft id).
- This flow does **not** create a canonical Supabase listing row for private listings.
- Linkage currently spans:
  - CRM lead `sellerWorkflowLeadId` and `listingId`;
  - draft `sellerLeadId`;
  - optional mandate fields/local status.

## 4. Direct New Listing Flow (Current)
- `AgentListings` “New Listing” modal is functionally a **new seller lead + draft intake** flow.
- It captures:
  - seller contact, property basics, source, property/listing category, optional attorneys/originator, notes, estimated price.
- It creates:
  - local seller lead (`createAgentSellerLead`);
  - local listing draft (`createListingDraftFromSellerLead`).
- Optional notification side-effects:
  - attempts edge email + WhatsApp send if Supabase config exists.
- It does **not** directly create an active listing in Supabase.

## 5. Seller Onboarding Current State
- Seller onboarding exists and is token-driven.
- Route entry is through seller/client token paths and reads records by onboarding token from local seller workflow stores.
- Supports ownership/entity branching in form logic:
  - individual, married (COP/ANC), company, trust, multiple owners.
- Collects substantial seller/property details and FICA-oriented fields.
- Submit behavior:
  - updates local workflow record (`sellerOnboarding.formData`, status complete);
  - updates listing/seller stages to onboarding completed;
  - creates/updates listing draft snapshot;
  - emits local browser events for Pipeline sync.
- Missing in current flow:
  - primary Supabase persistence as source-of-truth for seller onboarding payload.

## 6. Mandate Current State
- Mandate generation from seller lead exists in `AgencyPipelinePage`:
  - `createDocumentPacket(...)` for mandate;
  - attempts `generateMandateDocumentFromTemplate(...)`.
- Mandate send action exists and logs activity/stage updates on CRM lead.
- Seller-side mandate signing in `SellerPortal`:
  - is local workflow signing (typed signature + confirmation checkbox);
  - marks required docs complete locally;
  - runs `activateListingDraft(...)` if readiness checks pass.
- Current readiness gate to activation:
  - mandate signed;
  - required docs complete (per local `requiredDocuments` statuses).
- Gap:
  - mandate packet creation exists, but seller signing activation path is still local-draft centric rather than fully packet-signing centric end-to-end.

## 7. Listing Statuses / Stages in Use

### Seller workflow statuses (local constants)
- `draft`
- `seller_onboarding_pending`
- `seller_onboarding_sent`
- `seller_onboarding_completed`
- `mandate_ready`
- `mandate_sent`
- `mandate_signed`
- `listing_active`

### Seller lead stages (local constants)
- `new_lead`
- `contacted`
- `onboarding_sent`
- `onboarding_completed`

### CRM lead stages (agency pipeline)
- Includes: `Onboarding Sent`, `Onboarding Completed`, `Mandate Ready`, `Mandate Generated`, `Mandate Sent`, `Mandate Signed`, `Converted To Listing`, etc.

### Listings page display statuses
- Listings grid status filter is simplified to:
  - `all`, `active`, `under_offer`, `sold`.
- `normalizeStatusKey()` maps many values into these display buckets.

### Visibility implication
- Pre-activation seller workflow records (draft/onboarding/mandate in progress) are not the main source in active listing cards.
- Main non-development listing cards read from `readAgentPrivateListings()` (already activated local listings).

## 8. Listings Page Source + Filter Behavior
- `/listings` (Agent):
  - private side uses local private listings;
  - development side uses participant transaction summary + development options (Supabase-backed where configured), then merged demo/runtime rows.
- Category tabs:
  - Residential, Developments, Commercial, Industrial.
- Private listing filters:
  - status (`active/under_offer/sold`) + search.
- Development tab:
  - development workspace cards + search.
- Current page does not expose explicit seller onboarding readiness or mandate stage chips as first-class filters.

## 9. Seller/Listing Documents Current State
- Seller workflow has local required document scaffold (`SELLER_REQUIRED_DOCUMENTS`) including:
  - mandate, rates, levies, bond statement, utility bill, ID, proof of address, entity docs.
- `SellerPortal` documents section reads from local `requiredDocuments`.
- `AgentListingDetail` also reads and updates local required document statuses for listing workflow context.
- Separate broader `Documents` module is transaction/development/company oriented and Supabase-driven where available.
- Document requirement logic for seller listings is currently broad/static; it is not yet deeply dynamic by seller entity profile beyond generic `entity_documents`.

## 10. Supabase vs Local/Mock Source-of-Truth Map

### Local/runtime-first
- Seller leads, listing drafts, private listings (`agentListingStorage`).
- Agency CRM leads/activities/tasks/deals/transactions shadow store (`agencyPipelineService`).
- Seller onboarding form submission and mandate signing/activation.
- Demo seed datasets and mock row merges.

### Supabase-backed
- Development units stock (`units`).
- Document packets (mandate packet generation path).
- Some notifications via edge functions.
- Participant/development transaction summary queries.

### Mixed behavior
- UI can show merged rows (DB + demo/runtime), especially in transaction/listing-adjacent views.

## 11. Gap List

### A) Stock intake gaps
- No single canonical Supabase table/service for private listing intake equivalent to development `units`.
- New Listing flow is actually seller lead + local draft creation; naming and behavior are mismatched.

### B) Seller onboarding gaps
- Seller onboarding data is not persisted DB-first.
- Browser-local token flow is operational but not durable for cross-device/admin audit without local state.

### C) Mandate gaps
- Mandate packet generation exists, but signature-to-activation path is local workflow signing.
- End-to-end mandate lifecycle is split across packet layer and local draft layer.

### D) Listing status/stage gaps
- Multiple status dialects across CRM lead, draft workflow, listing display, and transaction views.
- Pre-listing statuses are weakly surfaced in Listings grid filters.

### E) Document requirement gaps
- Seller required docs are static baseline list; limited seller-type conditionality in this workflow.
- Seller doc lifecycle is local, while broader docs module is largely Supabase/transaction-centric.

### F) Supabase/source-of-truth gaps
- Private listing lifecycle is not DB-first.
- Local merge/demo behavior can mask source-of-truth boundaries.

### G) UI/UX gaps
- “New Listing” action behavior (lead+draft) differs from user expectation of immediate listing creation.
- Draft/in-progress visibility is split between Pipeline/Seller Portal and Listings.

### H) Permission/routing gaps
- Local-storage-driven workflow weakens centralized permission and audit controls.
- Seller token workflows depend on runtime-local records rather than authoritative shared persistence.

## 12. Risks Before Next Phase
- Data durability risk (browser storage loss, device/browser mismatch).
- Auditability risk (legal/onboarding/mandate actions not fully DB-traceable in one source).
- Visibility inconsistency risk (listing appears in one area but not another based on draft vs active local state).
- Operational drift risk from split status models and mixed persistence patterns.

## 13. Recommended Next Implementation Phases
1. Canonical persistence phase:
   - Introduce DB-first private listing/seller workflow persistence service.
   - Keep local merge as temporary UX fallback only.
2. Seller workflow unification phase:
   - Persist seller onboarding and mandate lifecycle to canonical records.
   - Keep token routes but resolve against DB-first records.
3. Mandate flow unification phase:
   - Align packet generation/signing and listing activation from one source.
4. Status model rationalization phase:
   - Define one listing lifecycle model with mapped display states.
5. Document requirement engine phase (seller side):
   - Dynamic requirements by seller type (individual/company/trust), property context, mandate state.
6. Observability/migration phase:
   - Backfill/bridge local records into DB; add event logging and health checks for listing intake paths.

---

### Files Reviewed (primary)
- `the-it-guy/src/lib/agentListingStorage.js`
- `the-it-guy/src/pages/AgentListings.jsx`
- `the-it-guy/src/pages/agency/AgencyPipelinePage.jsx`
- `the-it-guy/src/pages/SellerOnboarding.jsx`
- `the-it-guy/src/pages/SellerPortal.jsx`
- `the-it-guy/src/lib/agencyPipelineService.js`
- `the-it-guy/src/lib/api.js`
- `the-it-guy/src/pages/DevelopmentDetail.jsx`
- `the-it-guy/src/pages/Documents.jsx`
- `the-it-guy/src/components/DocumentsPanel.jsx`
- `the-it-guy/src/lib/agentDataService.js`
- `the-it-guy/src/lib/agentDemoSeed.js`
- `the-it-guy/src/core/transactions/attorneyMockData.js`
- `the-it-guy/src/App.jsx`
