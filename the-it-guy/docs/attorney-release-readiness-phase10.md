# Attorney release readiness — Phase 10 steady-state expansion

## Objective

Convert a verified production canary into a bounded, supportable general-availability expansion decision. Phase 10 is a read-only planning gate: it does not deploy, change Supabase, expand organisations, or perform rollback.

## Requirements

- Immutable, read-only Phase 9 receipt with status `VERIFIED`.
- Fingerprinted operational-readiness evidence bound to that deployment and receipt.
- Named support, monitoring, security, and rollback owners.
- Incident channel, support runbook, monitoring dashboard, known-good rollback deployment, and completed rollback drill.
- On-call acknowledgement, support briefing, active monitoring, and tested rollback.
- Gradual expansion capped at 25% and ten attorney organisations per approved step.
- Zero security, visibility, integrity, permission, propagation, and runtime failures.
- Accountable approval with `AUTHORIZE_ATTORNEY_GA_EXPANSION` for the exact deployment and Phase 9 receipt.

## Decision states

- `BLOCKED`: evidence, ownership, limits, handoff, or approval is incomplete.
- `ROLLBACK`: verified evidence contains a production stop condition.
- `READY_FOR_GRADUAL_EXPANSION`: every control passes. This is not automatic expansion authority.

## Runbook

```bash
npm run check:attorney-release-phase10 -- \
  --phase9-receipt=output/attorney-release/phase9-verified.json \
  --readiness=output/attorney-release/phase10-readiness.json \
  --approval=output/attorney-release/phase10-approval.json
```

Each expansion step must remain separately approved, monitored, and reversible. Automatic or unlimited expansion is prohibited.

## Current result — 2026-09-05

Phase 10 is implemented and remains `BLOCKED` because there is no executed Phase 8 canary or verified Phase 9 receipt. Production is unchanged.
