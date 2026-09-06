# Attorney coordination Phase 8 — pilot observation

Phase 8 observes the exact Phase 7 one-organisation pilot for at least 24 continuous hours. It requires at least four successful actions from each of the transfer, bond and cancellation attorney roles, Televent parity and attribution checks on every sample, propagation p95 no higher than 120 seconds, and healthy checks at least hourly.

The grant, delegated action, revocation denial, expiry denial and internal-visibility isolation controls must be repeated during the window. Security, visibility, permission, propagation, attribution, integrity or runtime incidents—and any open P0/P1 defect—return `ROLLBACK`. Missing or incomplete evidence returns `HOLD`. Only a clean `READY_FOR_EXPANSION` result completes Phase 8.

The checker validates evidence only. It does not query production, expand the cohort, change flags or perform rollback. Run `npm run check:attorney-coordination-phase8` after populating the Phase 8 evidence template.
