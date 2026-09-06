# Attorney practical release — Phase 5 staging soak

Phase 5 enforces the release bar's 24-hour staging soak: at least 30 authenticated actions, five per attorney role, 99% success, propagation p95 no greater than 120 seconds, hourly health evidence, all six destinations healthy, and zero propagation, security, visibility, or integrity incidents.

Metrics are recomputed from individual timestamps and durable receipts. Duplicate receipts, samples outside the time window, uncontracted actions, missing mutation latency, health gaps over 65 minutes, or incomplete module coverage cannot inflate the result.

Run `npm run check:attorney-practical-phase5`. `BLOCKED` means Phase 4 has not passed, `READY_TO_RUN` means the soak may begin, `HOLD` means the clean bar is incomplete, `ROLLBACK` means a safety boundary failed, and `STABILIZED` completes Phase 5. The checker is read-only and staging-only.
