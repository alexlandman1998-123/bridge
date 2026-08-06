# Seller Process Phase 7 Containment Tests

Date: 2026-08-06

## Purpose

Phase 7 adds containment tests for the Kingston seller-process work completed so
far.

This phase adds no product behaviour. It locks down the boundaries around the
profile, rail, action routing, evidence mapping, shadow payloads, partner
summaries, and live runtime services.

## Containment Rules

The tests prove:

- organisation name alone does not activate Kingston behaviour
- unknown profile values fall back to the default process
- default sellers do not receive Kingston rail stages, missing evidence keys,
  shadow mode, or a visible seller-process panel
- explicit `kingstons_residential` is still the only activation path
- Kingston payloads remain read-only and shadow-only
- partner-facing payloads and services do not expose internal Kingston workflow
  keys
- seller journey, readiness, document, listing, notification, dashboard, and
  partner services do not import Kingston process services
- Kingston process services do not write, upload documents, create appointments,
  update listings, or send notifications

## Verification

Run:

```bash
npm run test:seller-process-containment-phase7
npm run test:seller-process-evidence-mapping-phase6
npm run test:seller-process-workspace-gate-phase6
npm run test:seller-process-shadow-integration-phase5
npm run test:seller-process-panel-model-phase7
```
