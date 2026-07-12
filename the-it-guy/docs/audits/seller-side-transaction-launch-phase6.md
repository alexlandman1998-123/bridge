# Seller-Side Transaction Launch Phase 6

Implemented on 2026-07-11.

## Goal

Harden the seller-side launch gate for production readiness by removing build-warning noise and adding repeatable transaction-spine RLS probes.

Phase 6 focuses on:

- production build warning hygiene
- reviewed manual chunk boundaries for the transaction/API surface
- telemetry import hygiene
- static RLS policy checks for transaction, document, participant, roleplayer, bond application, and workflow event access
- a guarded live staging RLS probe for production cutover evidence

## Command

```bash
npm run verify:seller-side-phase6-launch-hardening
```

Static-only diagnostic mode:

```bash
node scripts/seller-side-phase6-launch-hardening-gate.mjs --static-only
```

Standalone RLS static probe:

```bash
npm run test:seller-side-phase6-rls-probes
```

Live staging RLS probe for production cutover:

```bash
SELLER_SIDE_RLS_ACTOR_EMAIL=<actor@example.com> \
SELLER_SIDE_RLS_ACTOR_PASSWORD=<actor-password> \
SELLER_SIDE_RLS_UNRELATED_EMAIL=<unrelated@example.com> \
SELLER_SIDE_RLS_UNRELATED_PASSWORD=<unrelated-password> \
SELLER_SIDE_RLS_TRANSACTION_ID=<transaction-id> \
node scripts/seller-side-phase6-rls-probes.mjs --live --confirm-staging --require-live
```

The live probe is read-only and guarded to the staging Supabase project ref `isdowlnollckzvltkasn`.

## Gate Coverage

The Phase 6 launch-hardening gate runs:

| Coverage | Command |
| --- | --- |
| Build chunk hygiene | `npm run test:build-chunk-hygiene` |
| Phase 6 RLS static probes | `npm run test:seller-side-phase6-rls-probes` |
| Production build warning classifier | `npm run build` |

The gate also performs static contract checks for:

- `api.js`, `settingsApi.js`, workspace resolution, and attorney workflow fallback modules staying co-located in `app-api`
- the reviewed `chunkSizeWarningLimit: 2200` launch budget
- no standalone `app-attorney-workflow`, `app-settings-api`, or `app-workspace-resolution` manual chunks
- UX diagnostics using a single static telemetry import path
- Phase 6 RLS probe support for guarded staging live checks
- Phase 6 package scripts

## Runtime Hardening

Phase 6 resolves the build-warning blocker by consolidating entangled API, settings, workspace-resolution, buyer-onboarding, and attorney workflow fallback modules into the reviewed `app-api` manual chunk. This is an intentional launch budget until `src/lib/api.js` is decomposed into smaller domain APIs.

`src/services/observability/uxDiagnostics.js` now uses a single static telemetry import, removing the mixed dynamic/static import warning from production builds.

The production build now completes with:

- no circular manual chunk warnings
- no mixed dynamic/static import warnings
- no chunk-size warning under the reviewed 2200 kB budget

## RLS Probe Coverage

The static RLS probe checks:

- `bridge_can_access_transaction_spine` relies on current owner, assigned user, assigned agent email, participants, roleplayers, and support delegation
- transaction select/update policies defer to `bridge_can_access_transaction_spine(id)`
- transaction participants, roleplayers, events, attorney assignments, and bond applications inherit transaction-spine RLS
- documents and document requests inherit transaction-spine RLS
- workflow events inherit transaction-spine RLS

The live staging mode signs in two real authenticated users:

- an actor expected to access the target transaction
- an unrelated user expected to see no rows or be denied

It probes:

- `transactions`
- `transaction_participants`
- `transaction_role_players`
- `transaction_events`
- `transaction_workflow_events`
- `transaction_bond_applications`
- `documents`
- `document_requests`

## Acceptance

- [x] Production build emits no circular manual chunk warnings.
- [x] Production build emits no mixed dynamic/static import warnings.
- [x] Production build emits no chunk-size warnings under the reviewed launch budget.
- [x] Transaction-spine RLS static contracts are gated for seller-side transaction records.
- [x] A guarded staging live RLS probe is implemented for production cutover evidence.

## Verification Result

Final local verification on 2026-07-11:

- command: `npm run verify:seller-side-phase6-launch-hardening`
- status: `READY`
- static checks passed: `4`
- static blockers: `0`
- command checks passed: `2`
- command blockers: `0`
- build checks passed: `1`
- build blockers: `0`
- build warning matches: `0`

Standalone RLS static probe on 2026-07-11:

- command: `npm run test:seller-side-phase6-rls-probes`
- status: `READY_STATIC_ONLY`
- static checks passed: `5`
- static blockers: `0`
- live mode: skipped

## Deferred To Production Cutover

- Run the live staging RLS probe with real staging actor and unrelated-user credentials.
- Record the target staging transaction ID and probe output in release notes before production deployment.

## Phase 6 Decision

Decision: GO FOR LOCAL LAUNCH-HARDENING SIGN-OFF. LIVE STAGING RLS EVIDENCE REQUIRED BEFORE PRODUCTION CUTOVER.
