# Attorney practical release — Phase 6 candidate approval

Phase 6 binds the accepted release bar and stabilized Phase 5 soak to one immutable controlled-release candidate. It requires a tested production build, distinct staging and production targets, isolated secrets, a verified backup and migration position, an owned rollback under 15 minutes, a feature-flagged one-to-three organisation cohort, monitoring across all six destinations, and launch support.

Run `npm run check:attorney-practical-phase6`. `BLOCKED` means the evidence chain is incomplete, `READY_TO_PREPARE` means candidate evidence may be assembled, `INVALID` identifies unsafe candidate contents, and `READY_FOR_APPROVAL` exposes the exact candidate fingerprint. An accountable owner must approve that fingerprint with `APPROVE_ATTORNEY_CONTROLLED_RELEASE`; only then is the status `APPROVED`.

This phase does not deploy, enable a feature flag, alter a cohort, or mutate production.
