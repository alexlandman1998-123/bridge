# Workflow Beta Stabilisation Report

## 1. Executive Summary
Workflow stabilisation was completed as a hardening pass on top of existing DB-first architecture (no new workflow engine, no `transaction_tasks`, no UI redesign). The main fixes focused on lane permission integrity, client-portal projection safety, workspace visibility boundaries, and runtime resilience.

Build status: `npm run build` passes.

High-impact outcomes:
- Transfer/Bond lane edit permissions are now stricter for attorney users when assignment records exist.
- Client portal workflow projection is now resilient, lane-aware, and non-crashing when read-model data is missing.
- Buyer vs seller document projection is more tightly scoped in portal document center.
- Workflow-projected activity/notifications are less noisy and better deduped for client experience.

## 2. What Was Tested
The following checks were executed in this pass:
- Static code-path audit for workflow lane activation, checklist sync, read-model projection, and client visibility filters.
- Permission gate audit for lane editing (`finance`, `transfer`, `bond`) and participant capability mapping.
- Duplicate/idempotency audit for subprocess seeding, step upserts, checklist seeding, and notification syncing.
- Runtime guard audit for missing schema/table/column behavior and fallback code paths.
- Build verification: `npm run build`.

Notes:
- Full live seeded DB scenario simulation (cash/bond/trust/company with real records) requires integration data in the active Supabase environment.
- Deterministic Node smoke import checks were attempted but blocked by repo-local ESM bare-specifier resolution outside Vite runtime.

## 3. Cash Transaction Result
Status: **Pass (code-path readiness)**

Validated behavior:
- Base lane set remains `finance + transfer`.
- Bond lane activation requires bond/hybrid-like finance plus handoff/assignment conditions; it does not auto-activate for cash.
- Client workflow projection can suppress bond lane for cash flow in portal summary.
- Transfer lane and checklist sync remain idempotent (`upsert` + conflict keys + dedupe keys).

Remaining validation recommended:
- Verify with live transaction seed that buyer portal shows proof-of-funds action and no bond lane cards.

## 4. Bond Transaction Result
Status: **Pass (code-path readiness)**

Validated behavior:
- Bond lane activation logic remains conditional and compatible with finance handoff.
- Transfer and bond lane summaries can render in parallel through workflow read-model and portal projection.
- Lane status/readiness/blocker calculations return safe defaults when partial rows are missing.

Remaining validation recommended:
- Live test with assignment split (different transfer and bond firms) to confirm lane ownership UX end-to-end.

## 5. Trust Scenario Result
Status: **Partial (rule-driven support present, needs seeded verification)**

Validated behavior:
- Requirement generation pipeline uses purchaser type + finance type + form data + rule-driven templates.
- Required document seeding is idempotent and deactivates stale rows safely.

Needs live verification:
- Trust-specific template/rule coverage in current DB seed (`trust deed`, `letters of authority`, `trustee IDs`, `trustee resolution`) and absence of irrelevant marital docs.

## 6. Company Scenario Result
Status: **Partial (pipeline supports it, needs seeded verification)**

Validated behavior:
- Purchaser type/finance-aware requirement generation is in place and idempotent.
- Workspace projection and required-doc normalization are stable with missing columns fallback.

Needs live verification:
- Company-specific rule/template coverage (`company registration`, `resolution`, `director/signatory IDs`, company address) and marital-doc exclusion.

## 7. Sectional Title Result
Status: **Pass (logic-level)**

Validated behavior:
- Transfer lane templates include levy steps only when property type is sectional.
- Non-sectional property types skip levy workflow steps.
- Portal projection now translates lane state to client-safe messaging.

## 8. Additional Document Request Result
Status: **Pass (core), Partial (spam controls in live UX)**

Validated behavior:
- Request visibility supports `client_visible`, `shared_role_players`, `internal_only`.
- Portal request filtering already applies workspace-aware audience checks.
- Notification sync now suppresses low-value projected workflow chatter.

Needs live verification:
- Duplicate prevention for repeated manual request submissions from UI (business-rule choice may allow repeated explicit requests).

## 9. Role Permission Findings
Status: **Improved / Hardened**

Implemented in this pass:
- Added lane-assignment-aware guard for attorney users when editing subprocess lanes.
- If `transaction_attorney_assignments` exists and has active rows:
  - `transfer` lane edit requires `transfer` or `transfer_and_bond` assignment.
  - `bond` lane edit requires `bond` or `transfer_and_bond` assignment.
  - user must match assignment participant fields (`primary_attorney_id`, `secretary_id`, `admin_handler_id`) when user id is available.
- Safe fallback retained for legacy/missing assignment schema to avoid hard lockouts.

Files:
- `src/lib/api.js`

## 10. Client Portal Visibility Findings
Status: **Improved / Hardened**

Implemented in this pass:
- Workflow summary projection now included in workspace payload with client-safe structure.
- Buyer/seller required-doc filtering strengthened in document center projection.
- Workflow-projected activity items are included in feed but flagged silent for notifications when informational.
- Notification generation from activity now gates low-value events to reduce spam.

Files:
- `src/services/clientPortalWorkspaceService.js`
- `src/services/clientPortalActivityFeedService.js`
- `src/services/clientPortalNotificationsService.js`
- `src/lib/clientPortalNextActionsEngine.js`

## 11. Runtime Errors Fixed
1. **Lane permission overexposure risk**
   - Fix: assignment-aware attorney lane edit checks added.
2. **Potential buyer/seller workflow/document leakage in portal projection**
   - Fix: required-doc workspace scoping tightened in `buildDocumentCenter`.
3. **Notification spam from projected workflow waiting states**
   - Fix: silent projected events + stricter activity-to-notification filter.

## 12. Remaining Risks
- Full trust/company requirement correctness still depends on active rule/template seed quality in DB.
- Legacy schema deployments without `transaction_attorney_assignments` still rely on capability flags (intentional fallback).
- Existing unrelated warnings remain in build output:
  - duplicate key warning in `src/pages/AgentListings.jsx`
  - CSS minify syntax warning from existing stylesheet content

## 13. Recommended Next Fixes
1. Add seeded integration fixtures for trust/company purchaser types and run scripted E2E assertions against `transaction_required_documents`.
2. Add explicit lane-assignment UI warnings when attorney has visibility but not edit rights on lane.
3. Add contract-level tests for portal buyer/seller document visibility separation.
4. Add notification policy tests to ensure only actionable stage/activity events generate client notifications.

## Files Updated In This Stabilisation Pass
- `src/lib/api.js`
- `src/services/clientPortalWorkspaceService.js`
- `src/lib/clientPortalNextActionsEngine.js`
- `src/services/clientPortalActivityFeedService.js`
- `src/services/clientPortalNotificationsService.js`
- `docs/audits/workflow-beta-stabilisation-report.md`
