# Seller Process Phase 6 Workspace Gate

Date: 2026-08-06

## Purpose

Phase 6 adds the first controlled opt-in integration point for the seller process
shadow payload.

The seller lead workspace fetch can now attach the Phase 5 shadow integration
bundle only when a caller explicitly requests it.

Default callers remain unchanged.

## Integration Helper

`src/services/sellerProcessWorkspaceIntegrationService.js` exposes:

- `buildSellerLeadWorkspaceShadowIntegration`
- `attachSellerProcessShadowIntegration`
- `shouldAttachSellerProcessShadowIntegration`
- `SELLER_PROCESS_SHADOW_WORKSPACE_KEY`

The attachment key is:

```js
sellerProcessShadowIntegration
```

## Fetch Gate

`fetchAgentLeadWorkspace` accepts these default-off options:

- `includeSellerProcessShadowIntegration`
- `includeSellerProcessShadow`
- `sellerProcessProfile`
- `organisationSettings`

If neither include flag is `true`, the workspace result is returned without a
seller process shadow payload.

If an include flag is `true`, the helper attaches a read-only shadow payload
using the existing lead, contact, appointment, listing, document packet, and
activity data already read by the workspace service.

## Non-Spillover Contract

Phase 6 preserves these guarantees:

- default workspace fetch output remains unchanged
- organisation name alone does not activate Kingstons
- Kingston workspace integration stays in `shadow` mode
- workspace integration is read-only and cannot mutate app state
- no UI page imports the workspace integration helper
- no live listing, mandate, document, notification, partner, or dashboard
  service consumes the helper
- partner payloads still hide internal Kingston workflow keys

## Verification

Run:

```bash
npm run test:seller-process-workspace-gate-phase6
npm run test:seller-process-shadow-integration-phase5
npm run test:seller-process-projection-phase4
npm run test:seller-process-evaluator-phase3
npm run test:seller-process-definition-phase2
npm run test:seller-process-profile-boundary-phase1
npm run test:seller-process-default-freeze-phase0
```
