# Controlled Pilot Lineage Gate - Phase 7

Date: 2026-08-15

Purpose: keep the controlled pilot on the normal accepted-offer transaction
path by default.

## Implemented Guardrails

- Pilot batch audit now requires `acceptedOfferId` / `accepted_offer_id` in
  every transaction evidence row.
- The audit derives creation lineage and requires `accepted_offer` mode.
- Manual override lineage is rejected in pilot batch evidence by default.
- Missing or hidden creation lineage fails the batch even when
  `conversionConfirmed: true` is present.
- Exposure-readiness staging evidence also requires accepted-offer linkage.

## Release Check

Run:

```bash
node scripts/transaction-pilot-lineage-gate-phase7.test.mjs
node scripts/mvp-pilot-batch-audit.test.mjs
node src/core/transactions/__tests__/mvpPilotBatchAudit.test.js
node scripts/mvp-exposure-readiness.test.mjs
node scripts/mvp-pilot-batch-dry-run.mjs
```

Phase 7 does not open the pilot or change production state. It is a fail-closed
evidence gate for closing a controlled batch.
