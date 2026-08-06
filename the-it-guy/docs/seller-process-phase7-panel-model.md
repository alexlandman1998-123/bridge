# Seller Process Phase 7 Panel Model

Date: 2026-08-06

## Purpose

Phase 7 adds the UI-facing panel model for the seller process shadow payload.

At creation time it was dormant. Phase 8 is allowed to consume this model from
the seller lead workspace, but only behind an explicit seller-process profile
gate.

## Panel Model

`src/services/sellerProcessWorkspacePanelService.js` exposes:

- `buildSellerProcessWorkspacePanelModel`

The model accepts either:

- a workspace object with `sellerProcessShadowIntegration`
- the shadow integration payload itself

Default organisations return `visible: false`.

Kingston shadow payloads return a read-only model with:

- progress steps
- missing evidence rows
- disabled action cards
- partner readiness summaries

## UI Boundary

The model itself remains read-only and does not perform any workspace fetches,
writes, notifications, document changes, mandate changes, listing changes, or
partner handoffs.

Any UI consumer must gate the Phase 6 shadow payload by an explicit feature flag
or organisation setting.

## Non-Spillover Contract

Phase 7 preserves these guarantees:

- default organisations do not render a seller process panel
- organisation name alone does not activate Kingstons
- Kingston panel actions are disabled and read-only
- partner summaries hide Kingston internal workflow keys
- live page consumers must gate the Phase 6 shadow payload before importing the
  panel model
- live listing, mandate, document, notification, partner, and dashboard services
  do not consume the panel model

## Verification

Run:

```bash
npm run test:seller-process-panel-model-phase7
npm run test:seller-process-workspace-gate-phase6
npm run test:seller-process-shadow-integration-phase5
npm run test:seller-process-projection-phase4
npm run test:seller-process-evaluator-phase3
npm run test:seller-process-definition-phase2
npm run test:seller-process-profile-boundary-phase1
npm run test:seller-process-default-freeze-phase0
```
