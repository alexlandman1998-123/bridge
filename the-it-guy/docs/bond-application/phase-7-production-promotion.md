# Phase 7: Production promotion artifact

Phase 7 provides a read-only, fail-closed promotion decision over the complete Phase 0-6 bond-originator chain.

## Required evidence

- Exact source commit and deployment artifact identity.
- All 54 supported applicant, entity, and employment scenarios passing exactly once.
- Trusted canonical interpretation and originator requirement profile.
- Duplicate-free document reconciliation.
- Complete participant and entity data.
- A ready, fingerprinted Phase 5 branded pack.
- A Phase 6 handoff bound to the same pack with automatic delivery disabled.
- A certified Phase 8 multi-profile acceptance matrix covering all 54 scenarios per profile.
- No more than one active handoff for the application revision.
- Evidence no older than 24 hours.
- Named monitoring, support, and rollback owners.
- A tested pause path and available rollback runbook.
- Confirmation that the promotion audit performed no production mutation.

The artifact returns `promotion_ready` only when every required check passes. Otherwise it returns `promotion_blocked` with explicit remediation evidence. It does not deploy, mutate Supabase, send an originator package, or submit anything to a bank.

Run `npm run test:bond-originator-production-promotion-phase7`.
