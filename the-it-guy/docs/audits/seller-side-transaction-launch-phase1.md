# Seller-Side Transaction Launch Phase 1

Implemented on 2026-07-11.

## Goal

Repair and certify the staging prerequisites that blocked authenticated seller-side transaction browser QA after Phase 0.

Phase 1 focuses on:

- the attorney QA fixture used by authenticated transaction smoke tests
- setup/recovery route-gate readiness
- launch env readiness for document title and address autocomplete
- a defensive auth-boot regression for stale recovery reasons

## Commands

Dry-run verification:

```bash
npm run verify:seller-side-phase1-readiness
```

Controlled staging repair:

```bash
SELLER_SIDE_PHASE1_STAGING_FIXTURE_WRITE=true npm run setup:seller-side-phase1-staging-fixture
```

Auth-boot regression:

```bash
npm run test:auth-boot-onboarding-recovery
```

## Staging Fixture Repair

The controlled write repaired the canonical attorney QA fixture:

| Record | ID |
| --- | --- |
| QA user/profile | `97800fc2-b2bb-4e02-a79a-e8ef53495d32` |
| Attorney firm fixture | `161212e3-8cc4-47a1-8d58-797bbdaa1326` |
| Active department | `22e0050c-a7e7-4a06-b93f-53473c6e10b9` |
| Active membership | `99e5b783-ec1f-440f-a398-11e1141ffd82` |

The final verification reports:

- status: `READY`
- pass count: `17`
- warnings: `0`
- blockers: `0`
- route gate: authenticated sign-in succeeds
- route gate: attorney validation prerequisites are ready
- route gate: `/setup/recovery` is not expected

## Env Readiness

Phase 1 now validates env readiness from both local templates and Vercel deployment metadata.

Confirmed:

- `.env.example` declares `VITE_DOCUMENT_TITLE`
- `.env.example` declares `VITE_GOOGLE_MAPS_API_KEY`
- local runtime has `VITE_DOCUMENT_TITLE`
- production runtime has `VITE_DOCUMENT_TITLE`
- Vercel Preview has `VITE_GOOGLE_MAPS_API_KEY`
- Vercel Production has `VITE_GOOGLE_MAPS_API_KEY`

The local `.env` now includes `VITE_DOCUMENT_TITLE="Arch9 | Platform"` so dev-server page title checks do not emit the earlier `%VITE_DOCUMENT_TITLE%` warning.

## Auth Boot Guard

The live browser spot check exposed an inconsistent setup state: the setup page could show an active workspace membership while still carrying a stale `no_active_membership` recovery reason.

Implemented fix:

- Added `resolveAuthBootSetupRequirement()` in `src/lib/authBoot.js`.
- If a non-client user already has a resolved current workspace membership, stale `no_active_membership` recovery state no longer forces setup recovery.
- Added regression coverage in `scripts/auth-boot-onboarding-recovery.test.mjs`.
- Exposed the regression as `npm run test:auth-boot-onboarding-recovery`.

## Acceptance

- [x] Staging attorney QA fixture has an active attorney firm membership.
- [x] Staging attorney QA fixture has a valid firm/workspace link.
- [x] Staging attorney QA fixture has at least one active department.
- [x] Authenticated QA login succeeds.
- [x] Authenticated attorney validation prerequisites are ready.
- [x] `VITE_GOOGLE_MAPS_API_KEY` is confirmed for staging/preview and production.
- [x] `VITE_DOCUMENT_TITLE` is confirmed for local/staging and production.
- [x] Stale `no_active_membership` recovery state is suppressed when active workspace access is already resolved.

## Remaining Note

The browser route check against `https://app.arch9.co.za/transactions/:transactionId` still reflects the currently deployed bundle until this code is deployed. After deployment, rerun the authenticated browser smoke from Phase 5 against a smoke-created transaction.

## Phase 1 Decision

Decision: GO TO PHASE 2.
