# Seller-Side Transaction Launch Phase 5

Implemented on 2026-07-11.

## Goal

Certify the seller-side transaction journey from transfer handoff through registration and closeout, with repeatable security and browser-smoke evidence.

Phase 5 focuses on:

- transfer workflow readiness before registration
- registration blockers for missing date, title deed, or confirmation evidence
- registration and closeout audit events
- legacy stage compatibility for canonical workflow actions
- transaction-scoped workflow-event RLS policy coverage
- public seller browser smoke for onboarding, portal, demo links, and auth entry
- reusable authenticated browser smoke for transaction and transfer workspaces

## Command

```bash
npm run verify:seller-side-phase5-transfer-registration
```

Static-only diagnostic mode:

```bash
node scripts/seller-side-phase5-transfer-registration-gate.mjs --static-only
```

Standalone public browser smoke:

```bash
npm run test:seller-side-phase5-browser-smoke
```

Authenticated browser smoke against an existing transaction:

```bash
SELLER_SIDE_BROWSER_SMOKE_BASE_URL=https://staging.arch9.co.za \
SELLER_SIDE_BROWSER_SMOKE_TRANSACTION_ID=<transaction-id> \
SELLER_SIDE_BROWSER_SMOKE_AUTH_STATE=playwright/.auth/staging-internal.json \
node scripts/seller-side-phase5-browser-smoke.mjs --authenticated-only
```

## Gate Coverage

The Phase 5 gate runs these contract suites:

| Coverage | Command |
| --- | --- |
| Canonical workflow gates | `npm run test:canonical-workflow-gates` |
| Transaction workflow model | `npm run test:transaction-workflow-model` |
| Workflow rollup rules | `npm run test:workflow-rollup-rules` |
| Workflow actions | `npm run test:workflow-actions` |
| Workflow evidence mapper | `npm run test:workflow-evidence-mapper` |
| Transaction workflow rollup | `npm run test:transaction-workflow-rollup` |
| Transaction stage compatibility | `npm run test:transaction-stage-compatibility` |
| Legacy stage mapper | `npm run test:legacy-stage-compatibility-mapper` |
| Legacy stage API compatibility | `npm run test:legacy-stage-api-compatibility` |
| Browser entry blockers | `npm run test:browser-entry-blockers` |
| Seller portal alignment | `npm run test:seller-portal-alignment` |
| Seller public browser smoke | `npm run test:seller-side-phase5-browser-smoke` |

The gate also performs static contract checks for:

- registration completion requiring registration date, title deed number, and confirmation evidence
- `MARK_REGISTERED` evidence attachment and structured workflow action events
- registration workflow definition coverage for lodgement, confirmation, final accounts, and matter closed steps
- registration rollup blockers for missing lodgement and confirmation evidence
- `transaction_workflow_events` RLS policies scoped through `bridge_can_access_transaction_spine(transaction_id)`
- seller-visible transfer, registration, bond cancellation, and closeout update copy
- reusable public and authenticated browser smoke routes
- Phase 5 package scripts

## Runtime Fixes

Phase 5 added three launch protections:

- `workflowActionService` tests now prove incomplete registration is blocked before any transaction can be marked `registered`.
- Successful registration now has explicit regression coverage for confirmation-document evidence and `workflow_action_completed` audit payloads.
- Legacy stage API compatibility now asserts the intended split between transaction legacy stage codes and unit display labels.

## Browser Smoke

The default Phase 5 launch gate executes public browser smoke for:

- `/demo/onboarding-links`
- `/seller/onboarding/demo-seller-onboarding`
- `/client/demo-seller-portal/selling`
- `/auth`

The same script can run authenticated transaction smoke when provided with a base URL, Playwright storage state, and transaction ID. The authenticated mode checks:

- `/transactions/:transactionId`
- `/transactions/:transactionId/transfer/transfer`

## Acceptance

- [x] Transfer workflow gates expose required next actions and blockers before registration.
- [x] Registration cannot complete without registration date, title deed, and confirmation evidence.
- [x] Registration and closeout state are auditable through workflow events and evidence rows.
- [x] Workflow event audit rows are protected by transaction-scoped RLS policy contracts.
- [x] Public seller onboarding, seller portal, demo links, and auth routes have reusable browser smoke coverage.
- [x] Authenticated transaction browser smoke is implemented as a reusable launch script mode.

## Verification Result

Final local verification on 2026-07-11:

- status: `READY`
- static checks passed: `8`
- static blockers: `0`
- command checks passed: `12`
- command blockers: `0`

## Deferred To Later Phases

- Run authenticated browser smoke against a real staging transaction after the staging auth state and smoke transaction ID are selected.
- Run database-level cross-workspace RLS probes with real Supabase authenticated users before production cutover.

## Phase 5 Decision

Decision: GO TO PHASE 6 once the Phase 5 gate reports `READY`.
