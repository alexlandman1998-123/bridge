# Seller Process Phase 6 Evidence Mapping

Date: 2026-08-06

## Purpose

Phase 6 centralizes Kingston seller-process evidence mapping behind a read-only adapter.

The rail model and seller lead workspace shadow integration now use the same
mapper before evaluating Kingston progress. This keeps appointment, document,
activity, listing, and mandate evidence interpretation consistent without
rewriting the global seller journey.

## Mapped Evidence Sources

`buildSellerProcessEvidenceContext` maps existing workspace shapes into the
seller process evaluator input:

- lead or row data
- linked listing data
- seller appointments from workspace, lead, or listing rows
- seller documents from workspace, lead, or listing rows
- activity entries from timeline, lead activities, or communication timeline
- mandate packets from explicit packet input or row document packets

## Boundary

The mapper is a read-only adapter. It does not write, upload documents, create
appointments, update listings, mutate lead state, send notifications, or expose
Kingston internal workflow keys to partners.

Default/non-Kingston records still resolve through the default seller process
profile unless `kingstons_residential` is explicitly configured.

## Verification

Run:

```bash
npm run test:seller-process-evidence-mapping-phase6
npm run test:seller-process-rail-model-phase2
npm run test:seller-process-workspace-gate-phase6
npm run test:seller-process-shadow-integration-phase5
```
