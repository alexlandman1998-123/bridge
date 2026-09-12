# Conveyancing restart — Phase 1 baseline

Status: **incomplete; not release approval**.

## Changes in this restart

- Review-task inference recognises the current `_review` task names (including buyer/seller FICA).
- Evidence-review contracts expose review/request/upload even when their document list is selected dynamically rather than stored in static task definitions.
- Operational contract regression checks target the current consolidated FICA tasks and retain audience/status checks across all 63 task contracts.
- The isolated atomic-command fixture loads the real phase-column migration prelude and the tax catalogue migration. Catalogue parity is asserted after mutation tests so a catalogue failure no longer masks save-path results.

## Evidence

- `node --test src/services/__tests__/conveyancingBaseline.test.js`: four local checks pass (HOA, final tax receipt, mocked buyer/seller reader responses, failure handling).
- `node scripts/transaction-loading-transition.test.mjs`: passes static/SSR loading checks, not authenticated browser loading.
- `node scripts/attorney-task-operational-contract.test.mjs`: passes 63 contracts.
- `node scripts/legal-task-workbench-phase4-operational.test.mjs`: passes local workbench checks.
- `node scripts/shared-matter-journey-atomic.test.mjs`: PostgreSQL mutation, fresh-read persistence, structured confirmations, rollback, outcome, revision, permission and retry assertions pass in PGlite. Overall test **fails** SQL/application tax catalogue parity. Do not report this suite as passing.

## Outstanding exit criteria

1. Reconcile tax-task SQL catalogue descriptions/null client fields against application definitions through a reviewed migration; preserve internal/client visibility.
2. Full Supabase verification: Docker daemon is unavailable on this host.
3. Authenticated staging attorney and buyer/seller sessions with a designated test matter are needed for real navigation, document drawers, save/reload and cross-session checks. Requested from user; not yet supplied.
4. No production mutation or deployment was performed. Earlier uncommitted changes remain unverified except where explicitly covered above.

Phase 1 is finished only when the real application exit criteria in the attached eight-phase plan pass. These isolated tests do not substitute for those checks.
