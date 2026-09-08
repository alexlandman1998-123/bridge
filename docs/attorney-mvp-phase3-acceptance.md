# Attorney MVP Phase 3 — acceptance gate

Date: 2026-09-08. Decision: **NO GO for live pilot yet**.

## Latest staging execution

The initial preflight below is historical. The two MVP migrations have now been applied to staging and a matching protected preview deployed. Authentication succeeds after the explicitly authorised staging demo password reset. The subsequent workflow-loading defect has been fixed and browser read-state agreement verified on a corrected preview. Live acceptance remains **NO GO** pending an authorised editable staging fixture for mutation/reload and cross-role checks. See [staging execution report](attorney-mvp-staging-deployment-20260908.md) for evidence and remaining checks.

## Implemented and run locally

`the-it-guy/scripts/attorney-mvp-phase3-acceptance.test.mjs` exercises every task in six generated matter configurations:

| Scenario | Active lanes |
| --- | --- |
| Cash, individual, single | Transfer |
| Cash, company | Transfer |
| Bond, individual, married in community, seller bond | Transfer, bond, cancellation |
| Bond, company, seller bond | Transfer, bond, cancellation |
| Hybrid, individual, married out of community | Transfer, bond |
| Unknown/incomplete profile | Provisional transfer |

Result: **311 task/scenario checks and 1,244 outcome checks passed**.

Checks cover complete/external/not-applicable/reopen, all tasks visible once in their phase, advisory requirements permitting work ahead, read-only mutation actions absent, shared percentage calculations, serialised snapshot reconstruction, evidence not confirmed by external completion, and excluded lanes not restored from historical steps. These are application-model tests, not actual browser reloads, permission enforcement or API persistence tests.

The existing task-state suite also passed header/Work/dashboard projection comparisons; the discretion suite passed profile/outcome tests. The isolated PostgreSQL suite passed atomic mutation, reconciliation, missing-row, reason-validation, rollback and denied-access checks. Its permission/stage helpers are fixture stubs: it does not establish live RLS correctness.

Run from `the-it-guy/`:

```sh
node scripts/attorney-mvp-phase3-acceptance.test.mjs
node scripts/attorney-mvp-task-state.test.mjs
node scripts/attorney-mvp-discretion.test.mjs
PGLITE_MODULE=/path/to/pglite/dist/index.js node scripts/attorney-mvp-task-discretion-sql.test.mjs
```

No production code change or rebuild was required for this test-only phase. The Phase 2 build result remains separate evidence; these tests do not certify a deployed build.

## Actual staging preflight

Read-only Supabase checks were run against **Arch9 Staging**, project `vaszuxjeoajeuhlcnzzf`. The production project was not mutated. Supabase skill guidance informed the read-only preflight and separation between isolated tests and real access-policy verification.

| Check | Observed |
| --- | --- |
| Phase 1 migration `20260908071547` | Not recorded |
| Phase 2 migration `20260908073924` | Not recorded |
| Atomic task RPC v2 | Missing |
| Atomic task RPC v3 | Missing |
| Plan reconciliation RPC | Missing |
| Lane permission helper | Present |
| Step-to-matter stage mapper | Present |
| Lifecycle function/table | Present |
| Lane history table | Present |
| Attorney staging fixture manifest | 1 present; contents not yet certified |

Reusable read-only query: `the-it-guy/scripts/attorney-mvp-phase3-preflight.sql`.

Metadata presence is only deployment readiness, not a live acceptance result. No migration was applied, no migration-history repair was attempted, no user account was impersonated, and no real matter was changed.

## Required before the live pilot

1. Confirm a recoverable staging backup and approve staging migration/build deployment. Check the full migration prerequisites; do not blindly push the entire pending migration directory.
2. Apply Phase 1 then Phase 2 using normal migration tracking. Re-run the preflight and verify function definitions, not only their presence.
3. Deploy the matching frontend to a staging URL bound to this staging database. Record the deployment/commit identifier.
4. Use separately authenticated staging attorney, agent and developer sessions on assigned fixture matters, plus buyer/seller sessions to check client visibility. Do not use a service-role client as evidence for role access.
5. In each of the six scenarios, capture details, upload/review a test document, exercise the task outcomes, reload, then open the same matter in the other authorised sessions. Compare saved state, header, Work, dashboard and events. Test each distinct action destination and all three lanes; a projection test does not establish that every form saves correctly.
6. Confirm client communication is opt-in, duplicate retries do not create unintended notifications, unauthorised users cannot mutate tasks, and excluded lanes remain available as history without entering active counts.

## Pilot rule

Only proceed after the live checks pass with recorded deployment and role-session evidence. Start with two controlled test matters (cash transfer and financed transfer with cancellation), then widen to the remaining profiles. Stop on any save failure, inconsistent task state, wrong matter assignment, unauthorised exposure, unexpected client notification or missing audit reason. Preserve evidence; do not repair by inventing completion or rewriting real history.

The checklist is operational assistance, not a legal-compliance or readiness-to-lodge certification. Live acceptance and professional process review remain unverified.
