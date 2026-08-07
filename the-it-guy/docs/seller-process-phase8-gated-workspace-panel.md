# Seller Process Phase 8 Gated Workspace Panel

Date: 2026-08-06

## Purpose

Phase 8 mounts the Kingston seller process panel in the seller lead workspace
without making it part of the default seller journey.

The panel is read-only and is driven by the Phase 7 panel model.

## Activation Gate

`AgentLeadsPage.jsx` resolves the seller process profile from explicit
organisation settings or explicit workspace profile fields only.

The page requests the Phase 6 shadow payload only when the resolved profile is
`kingstons_residential`.

If the shadow payload is missing in an already-loaded seller lead workspace, the
overview page may synthesize the Kingston panel model from exact Kingston
workspace identity signals only: the Kingston organisation ID, the Kingston
training owner email, or a Kingston agent email domain.

The production `/pipeline/leads/:leadId` route is rendered through
`AgencyPipelinePage.jsx`, so that route applies the same exact Kingston signal
gate before replacing the overview rail and next-best-action CTA.

Organisation name alone still does not activate the Kingston process.

## UI Boundary

The panel renders only when `buildSellerProcessWorkspacePanelModel` returns
`visible: true`.

The panel:

- shows Kingston process progress
- shows missing evidence
- shows action cards that remain bounded to seller workspace surfaces
- shows partner readiness without internal Kingston workflow keys

It does not:

- write lead, appointment, document, mandate, listing, notification, reporting,
  or partner records
- replace the global seller journey
- activate listings
- expose internal Kingston workflow keys to partner services

## Verification

Run:

```bash
npm run test:seller-process-workspace-panel-phase8
npm run test:seller-process-panel-model-phase7
npm run test:seller-process-workspace-gate-phase6
npm run test:agent-leads-workspace
```
