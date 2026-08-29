# Transaction sync Phase 3 — module adapters

Phase 3 connects specialist module writes to the Phase 2 propagation envelope. The source module remains authoritative; the adapter supplies the frozen action key, source table, visibility ceiling, audience, idempotency identity, and safe activity copy.

## Coverage

The application adapter registry covers all 29 actions frozen in Phase 0. Runtime callers cannot substitute another source table or silently expand an action's visibility.

The first operational adapters are:

- Attorney stage changes, carried forward from Phase 2 through the shared registry.
- Attorney internal comments, inserted together with their canonical command in one database transaction.
- Bond-originator progress, inserted through the existing originator ownership checks and committed to the transaction spine in the same database transaction.
- System workflow evidence, committed after the workflow step and rollup recompute succeeds.
- Originator and client progress readers, exposing the existing role-scoped RPC views to the application.

## Safety boundaries

- Originator commentary remains supplemental and cannot create a bank outcome, offer, grant, or finance milestone.
- Raw attorney comments and internal originator notes are never copied into shared or client activity payloads.
- Internal comments remain internal. A refresh signal may tell another authorised workspace to reload, but RLS and activity visibility determine what it can read.
- Atomic wrappers use `security invoker`; the existing RLS and assignment checks still apply.
- A missing Phase 3 attorney-comment RPC falls back to the existing source write so migration-first deployment remains safe. Any other RPC failure is surfaced.

## Deployment order

1. Apply and verify Phases 1 and 2 on the target environment.
2. Apply the Phase 3 migration before deploying the application bundle.
3. Run `npm run test:transaction-sync-phase3` plus the Phase 0–2 suites.
4. Canary an attorney internal comment and an originator progress update with stable idempotency keys.
5. Require one source row, one command receipt, one canonical event, one activity projection, and one version increment for each canary.

No production migration or data mutation is performed by this implementation change.
