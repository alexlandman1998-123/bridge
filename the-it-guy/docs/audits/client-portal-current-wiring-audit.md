# Client Portal Current Wiring Audit

## 1. Executive Summary

The current Client Portal is **partially DB-first** and already has solid token-scoped Supabase wiring for buyer portal, onboarding, OTP signing, status sharing, and external role-player links. However, seller-side portal logic is split across two systems:

- A newer seller-in-ClientPortal workspace path (token + `client_portal_contexts`)
- An older standalone `SellerPortal` + `listingOffersService` flow that is still **localStorage/runtime-first**

The result is mixed architecture, duplicated seller workflow surfaces, and unclear source-of-truth boundaries. Buyer-facing flows are materially more production-ready than seller/offer flows.

## 2. Client Portal Routes Found

### Token/client-facing routes in `src/App.jsx`

- `/client/:token`
- `/client/:token/buying`
- `/client/:token/buying/:section`
- `/client/:token/selling`
- `/client/:token/selling/:section`
- `/client/:token/progress`
- `/client/:token/onboarding`
- `/client/:token/details`
- `/client/:token/bond-application`
- `/client/:token/documents`
- `/client/:token/otp-signing`
- `/client/:token/forms/trust-investment` (redirect)
- `/client/:token/handover`
- `/client/:token/homeowner`
- `/client/:token/snags`
- `/client/:token/issues` (redirect)
- `/client/:token/settings`
- `/client/:token/team`
- `/client/:token/alterations`
- `/client/:token/review`

### Onboarding routes

- `/client/onboarding/:token` -> `ClientOnboarding`
- `/seller/onboarding/:token` -> currently mapped to `ClientPortal`

### Seller routes

- `/seller/:token`
- `/seller/:token/mandate`
- `/seller/:token/documents`
- `/seller/:token/property`
- `/seller/:token/offers`
- `/seller/:token/progress`

All currently route to `ClientPortal`.

### Other token routes linked to client journey

- `/client/offer/:token` and `/offers/:token` -> `BuyerOfferSubmission`
- `/sign/:token` -> `SignerPortal`
- `/status/:token` -> `TransactionStatusShare`
- `/snapshot/:token` -> `ExecutiveSnapshot`
- `/external/:accessToken` -> `ExternalTransactionPortal`

## 3. Buyer Portal Current Wiring

### Current implementation

- Main buyer portal is `src/pages/ClientPortal.jsx`.
- Data load path:
  - Core load: `fetchClientPortalCoreByToken(token)`
  - Full hydrate: `fetchClientPortalByToken(token)`
  - Contexts: `fetchClientPortalContextsByToken(token)`
- Token scope enforced via scoped headers in `src/lib/api.js` (`x-bridge-client-portal-token`).

### Data profile

- Primary source: Supabase DB.
- Uses multiple normalized tables where present (`transactions`, `units`, `buyers`, `documents`, `transaction_comments`, `transaction_events`, subprocesses, onboarding tables, required docs).
- Contains backward-compat query fallbacks for missing columns/tables.

### Overall classification

- **Buyer portal wiring: DB-first (with compatibility fallbacks).**

## 4. Seller Portal Current Wiring

There are two overlapping seller implementations:

### A. Seller-in-ClientPortal (active via App routes)

- Seller paths in `App.jsx` route into `ClientPortal`.
- Seller context discovered via `fetchClientPortalContextsByToken` from `client_portal_contexts`.
- Mandate packet/signing state is enriched from `document_packets` + signer tables.
- Uses same buyer portal token base (`client_portal_links`).

Classification:
- **Mixed, mostly DB-first for context and packet status**, but seller UI actions are still lighter than buyer path and depend heavily on available context rows.

### B. Standalone `SellerPortal.jsx` (present but not wired by App routes)

- Loads local runtime stores first (`readAgentSellerLeads`, `readAgentListingDrafts`, `readAgentPrivateListings`).
- Falls back to DB (`getSellerOnboardingByToken`) only when local bundle not found.
- Offer flow uses `listingOffersService`, which is localStorage-based.

Classification:
- **Local/runtime-first with DB fallback**.

## 5. Data Source Map

| Surface | Main file | Source | Classification |
|---|---|---|---|
| Buyer portal workspace | `ClientPortal.jsx` + `fetchClientPortalByToken` | Supabase tables via token-scoped client | DB-first |
| Buyer onboarding form | `ClientOnboarding.jsx` + `fetchClientOnboardingByToken` / save/submit | Supabase onboarding + transaction docs generation | DB-first |
| Client OTP signing | `ClientOtpSigning.jsx` + `fetchClientOtpSigningByToken` / `submitClientOtpSignature` | Supabase docs/events + storage | DB-first |
| Client status share | `TransactionStatusShare.jsx` + `fetchTransactionStatusByToken` | Supabase `transaction_status_links` + transaction context | DB-first |
| External role-player portal | `ExternalTransactionPortal.jsx` + `fetchExternalTransactionPortal` | Supabase `transaction_external_access` + workspace queries | DB-first |
| Seller onboarding (standalone page component) | `SellerOnboarding.jsx` | DB-first mode when configured, else runtime/local fallback | Mixed |
| Seller portal (standalone) | `SellerPortal.jsx` | localStorage stores first; DB fallback | Local/runtime-first |
| Buyer offer submission | `BuyerOfferSubmission.jsx` + `listingOffersService` | localStorage invite/offer records | Mock/local-first |

## 6. Client Identity & Token Resolution

### Buyer client identity

- Resolved primarily via `client_portal_links` token -> `transaction_id`, `buyer_id`.
- Buyer profile loaded from `buyers` table.

### Onboarding identity

- `ClientOnboarding` uses `transaction_onboarding` token with scoped client header (`x-bridge-onboarding-token`).
- Transaction resolved by onboarding token context.

### Status/share identity

- `TransactionStatusShare` uses `transaction_status_links` token (`x-bridge-status-token`).

### External workspace identity

- `ExternalTransactionPortal` uses `transaction_external_access` token (`x-bridge-external-access-token`) and role restrictions.

### Seller identity (current)

- In `ClientPortal` seller mode: inferred from `client_portal_contexts` rows tied to transaction and optionally buyer email.
- In standalone `SellerPortal`: token is looked up against local runtime stores first.

## 7. Transaction Linkage

### Strong linkage paths

- `client_portal_links.transaction_id` is the anchor for `ClientPortal`, OTP, document uploads, comments, issues, alterations, reviews.
- `transaction_onboarding.transaction_id` anchors onboarding flow.
- `transaction_status_links.transaction_id` anchors status share.
- `transaction_external_access.transaction_id` anchors external workspace.

### Fragile/dual linkage areas

- Seller flows are split:
  - `client_portal_contexts` (DB context model)
  - local seller workflow records (`agentListingStorage`) in standalone components.
- `/seller/*` routes point to `ClientPortal`, while standalone `SellerPortal` still exists and follows a different linkage model.

## 8. Document Requirements Current State

### Buyer requirements

- Generated from central buyer engine in API path:
  - requirement profile + role filtered list (`clientVisibleBuyerRequirements`)
  - required docs from `transaction_required_documents`
  - uploaded docs from `documents`
- `ClientPortal` groups documents with metadata + heuristic fallback (`groupPortalRequiredDocuments`).

### Seller requirements

- Dynamic seller requirement engine exists (`privateListingRequirementEngine`).
- Strongly used in standalone `SellerPortal` and `privateListingService`.
- Seller requirement integration in routed `ClientPortal` path is still comparatively thin and context-driven.

### Current risk

- Requirement display logic is partly centralized (good), partly heuristic in UI grouping (mixed).

## 9. Additional Document Requests Current State

- `ClientPortal` “Additional” tab currently reflects:
  - required docs grouped as additional, plus
  - shared documents classified as additional.
- No strong dedicated client-portal “additional request center” surfaced from explicit request rows in this route.
- Request-specific intent/status (requested vs reupload reason vs deadline) is not consistently first-class in client UI.

## 10. Next Actions Current State

- `ClientPortal` computes next actions from mixed signals:
  - stage, subprocess summaries,
  - missing required docs,
  - onboarding completion,
  - selected workflow conditions.
- This is logic-rich and useful, but still mostly component-derived and not yet a single backend data contract.

Classification:
- **Mixed (dynamic, but UI-computed rather than service-contract first).**

## 11. Activity / Updates Current State

- `ClientPortal` activity feed mostly comes from `portal.discussion` (`transaction_comments` + optional legacy note fallback).
- External status page similarly pulls filtered discussion summary.
- Visibility filtering exists (`internal` notes filtered for external viewers).

Strength:
- Client/internal separation exists in discussion normalization/filtering.

Gap:
- No unified “client-visible event feed contract” yet across all client surfaces.

## 12. Notifications Current State

- In-app notification panel in `ClientPortal` is derived from:
  - computed action-required state,
  - latest updates from discussion.
- Read state (`notificationsSeenAt`) is currently ephemeral component state (not persisted).
- No dedicated client notification table consumption in this page.

Classification:
- **UI-derived alerts, not durable notification center.**

## 13. Educational Content Current State

- Buyer portal includes strong inline educational text and stage explainers.
- `TransactionStatusShare` gives client-friendly stage + next-step framing.
- `ExternalTransactionPortal` also uses stage explainers and role presentation text.

Gap:
- Content still spread across components; no single managed educational content layer by stage/persona.

## 14. Visibility / Privacy Risks

1. Dual seller systems increase risk of inconsistent visibility behavior.
2. Standalone `SellerPortal` local-first behavior can diverge from DB truth.
3. Buyer offer route (`BuyerOfferSubmission`) is localStorage-driven and not aligned with DB-level access controls.
4. If `client_portal_contexts` row quality is weak/missing, seller workspace exposure and accuracy may drift.
5. Visibility filtering for docs/discussion exists, but consistency depends on metadata quality (`visibility_scope`, `is_client_visible`, discussion tags).

## 15. Runtime Stability Risks

1. `ClientPortal` context load swallows context errors into defaults (`buying=true`, `selling=false`) in some calls, which can mask real context failures.
2. Backward-compatible missing-column fallbacks are helpful but hide schema drift severity.
3. Standalone seller and offer flows rely on browser runtime state/localStorage, which is refresh/device fragile.
4. Some routes exist for legacy/redirect reasons and can create confusion (`/seller/onboarding/:token` mapped to `ClientPortal`, while `SellerOnboarding`/`SellerPortal` still exist).

## 16. DB-first vs Local/Mock Gaps

### DB-first now

- Client portal core buyer journey
- Client onboarding by token
- OTP signing
- Status share
- External role-player portal

### Mixed or local-first still present

- Standalone seller portal
- Buyer offer submission (invite/offer records)
- Seller workflow local stores (`agentListingStorage`) still active in legacy paths

### Architectural duplication

- Seller journey rendered in both `ClientPortal` seller mode and standalone `SellerPortal` system, with different persistence assumptions.

## 17. Recommended Implementation Phases

### Phase 2: Client Portal Data Contract / Backend Service

- Define one canonical `getClientPortalWorkspaceData(token, workspace)` contract.
- Include buyer + seller context, next actions, requirements, updates, notifications summary.
- Remove component-level inference where contract can provide truth.

### Phase 3: Next Actions Engine

- Move next-action derivation to service layer.
- Return explicit action objects with reason, priority, due date, and role visibility.

### Phase 4: Document Centre Refactor

- Unify required docs + additional requests + uploaded docs into one typed document center model.
- Make rejection reasons and reupload requirements first-class and role-aware.

### Phase 5: Educational Content Layer

- Centralize stage copy by persona (buyer/seller) + finance + legal stage.
- Keep UI rendering separate from content config.

### Phase 6: Activity & Updates Feed

- Build a canonical client-visible feed model from events/comments/docs transitions.
- Ensure strict internal/shared/client visibility boundaries.

### Phase 7: In-App Notifications

- Introduce durable notification records for client users (or token sessions) instead of transient UI-only counts.
- Persist read/unread state and dedupe.

### Phase 8: Stabilisation Pass

- Remove/retire local-only seller/offer flow paths from live client routes.
- Consolidate route map and eliminate duplicate portal implementations.
- Add telemetry + error surfaces for token resolution/context hydration failures.

---

## Light Stabilisation Notes (No Major Rebuild Done)

No major client portal functionality was rebuilt in this phase. This report focuses on wiring discovery and baseline mapping only.
