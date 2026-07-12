# Seller-Side Transaction Launch Phase 7

Implemented on 2026-07-11.

## Goal

Create the release-candidate gate for the seller-side transaction launch, separating local release-candidate readiness from production cutover evidence.

Phase 7 focuses on:

- one repeatable command for the seller-side release-candidate dossier
- callable Phase 2 through Phase 6 gates from one orchestration layer
- optional Phase 1 staging fixture readiness in the same report
- strict cutover evidence for authenticated transaction browser smoke
- strict cutover evidence for live staging cross-workspace RLS probes
- explicit go/no-go language that does not hide pending live evidence

## Command

Default local release-candidate gate:

```bash
npm run verify:seller-side-phase7-release-candidate
```

Static-only diagnostic mode:

```bash
node scripts/seller-side-phase7-release-candidate-gate.mjs --static-only
```

Full local gate, including full Phase 2 through Phase 6 gates:

```bash
node scripts/seller-side-phase7-release-candidate-gate.mjs --full-local
```

Include Phase 1 staging readiness in the release-candidate report:

```bash
node scripts/seller-side-phase7-release-candidate-gate.mjs --include-staging-readiness
```

Strict production cutover evidence:

```bash
SELLER_SIDE_BROWSER_SMOKE_BASE_URL=https://staging.arch9.co.za \
SELLER_SIDE_BROWSER_SMOKE_TRANSACTION_ID=<transaction-id> \
SELLER_SIDE_BROWSER_SMOKE_AUTH_STATE=playwright/.auth/staging-internal.json \
SELLER_SIDE_RLS_ACTOR_EMAIL=<actor@example.com> \
SELLER_SIDE_RLS_ACTOR_PASSWORD=<actor-password> \
SELLER_SIDE_RLS_UNRELATED_EMAIL=<unrelated@example.com> \
SELLER_SIDE_RLS_UNRELATED_PASSWORD=<unrelated-password> \
SELLER_SIDE_RLS_TRANSACTION_ID=<transaction-id> \
node scripts/seller-side-phase7-release-candidate-gate.mjs --require-cutover-evidence
```

## Gate Coverage

Default Phase 7 mode runs the static contract mode for:

| Coverage | Command |
| --- | --- |
| Phase 2 lead-to-onboarding | `node scripts/seller-side-phase2-lead-onboarding-gate.mjs --static-only` |
| Phase 3 listing/mandate | `node scripts/seller-side-phase3-listing-mandate-gate.mjs --static-only` |
| Phase 4 transaction spine | `node scripts/seller-side-phase4-transaction-spine-gate.mjs --static-only` |
| Phase 5 transfer/registration/security/browser | `node scripts/seller-side-phase5-transfer-registration-gate.mjs --static-only` |
| Phase 6 launch hardening/build/RLS | `node scripts/seller-side-phase6-launch-hardening-gate.mjs --static-only` |

Full local mode runs the same phase gates without `--static-only`.

Strict cutover mode additionally requires:

- authenticated transaction browser smoke through `scripts/seller-side-phase5-browser-smoke.mjs --authenticated-only`
- live staging RLS cross-workspace probe through `scripts/seller-side-phase6-rls-probes.mjs --live --confirm-staging --require-live`

## Static Contract Checks

The Phase 7 gate also verifies:

- audit docs exist for Phase 0 through Phase 7
- package scripts expose Phase 5, Phase 6, and Phase 7 gates
- the master seller launch checklist records Phase 7 and strict cutover evidence commands
- the launch readiness doc links to the Phase 7 gate and audit
- browser smoke exposes authenticated cutover inputs
- live RLS probes require confirmed staging and fail on live blockers

## Status Semantics

`READY_STATIC_ONLY` means Phase 7 static contracts passed, but phase gates were intentionally skipped.

`READY_LOCAL_RC` means the local release candidate passed and strict production cutover evidence is still pending.

`READY_CUTOVER` means strict cutover evidence passed, including authenticated browser smoke and live staging RLS probes.

`BLOCKED` means at least one static contract, phase gate, or required cutover evidence item failed.

## Acceptance

- [x] Phase 2 through Phase 6 gates are callable from one release-candidate command.
- [x] Phase 1 staging readiness can be included without changing the local default.
- [x] Authenticated transaction browser smoke is required in strict cutover mode.
- [x] Live staging RLS cross-workspace probes are required in strict cutover mode.
- [x] The launch checklist distinguishes local release-candidate readiness from production cutover evidence.

## Verification Result

Final local verification on 2026-07-11:

- command: `npm run verify:seller-side-phase7-release-candidate`
- status: `READY_LOCAL_RC`
- static checks passed: `6`
- static blockers: `0`
- phase subgates passed: `5`
- phase subgate blockers: `0`
- strict cutover evidence pending: `2`
- strict cutover blockers: `0`

Static diagnostic verification on 2026-07-11:

- command: `node scripts/seller-side-phase7-release-candidate-gate.mjs --static-only`
- status: `READY_STATIC_ONLY`
- static checks passed: `6`
- static blockers: `0`

## Deferred To Production Cutover

- Run strict Phase 7 cutover evidence with real staging browser auth state, transaction ID, actor credentials, and unrelated-user credentials.
- Record the `READY_CUTOVER` report in release notes before production deployment.

## Phase 7 Decision

Decision: GO FOR LOCAL RELEASE-CANDIDATE SIGN-OFF. STRICT CUTOVER EVIDENCE REQUIRED BEFORE PRODUCTION DEPLOYMENT.
