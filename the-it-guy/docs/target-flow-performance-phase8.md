# Target flow performance — Phase 8 promotion readiness

Phase 8 is deliberately fail-closed. It validates exported Phase 7 evidence,
requires complete passing coverage, rejects evidence older than 24 hours, and
can bind a packet to a specific Preview URL.

It never promotes a deployment. A manual production promotion remains a
separate authorised action after this check reports `READY_FOR_MANUAL_PROMOTION`.

Run:

`node scripts/verify-target-flow-promotion-phase8.mjs --input=/absolute/path/to/evidence.json --preview-url=https://preview.example.test`
