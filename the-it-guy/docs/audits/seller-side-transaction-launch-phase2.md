# Seller-Side Transaction Launch Phase 2

Implemented on 2026-07-11.

## Goal

Certify the seller lead-to-onboarding contract before listing, mandate, offer, and transaction conversion phases continue.

Phase 2 focuses on:

- agency seller lead list and detail workspace contracts
- seller onboarding token route contracts
- seller onboarding field, branch, and fact completeness
- seller onboarding completion repeat-safety
- seller portal route and seller-context alignment

This phase is local and deterministic. It does not write staging data and does not require browser credentials.

## Command

```bash
npm run verify:seller-side-phase2-lead-onboarding
```

Static-only diagnostic mode:

```bash
node scripts/seller-side-phase2-lead-onboarding-gate.mjs --static-only
```

## Gate Coverage

The Phase 2 gate runs these existing contract suites:

| Coverage | Command |
| --- | --- |
| Seller lead list/detail workspace | `npm run test:agent-leads-workspace` |
| Seller journey stage model | `npm run test:seller-journey` |
| Seller readiness and next actions | `npm run test:seller-readiness` |
| Seller onboarding flow contract | `npm run test:seller-onboarding-flow-contract` |
| Seller onboarding canonical facts | `npm run test:seller-onboarding-facts` |
| South African seller scenarios | `npm run test:seller-onboarding-sa-scenarios` |
| Seller portal alignment | `npm run test:seller-portal-alignment` |

The gate also performs static contract checks for:

- `/pipeline/leads`
- `/pipeline/leads/:leadId`
- `/seller/onboarding/:token`
- `/mobile/seller-onboarding/:token`
- `/client/:token/selling`
- `/client/:token/selling/:section`
- demo seller onboarding and portal tokens
- seller onboarding link generation
- seller onboarding token lookup by listing and lead
- seller lead workspace onboarding editor anchor
- seller onboarding submit event identifiers
- repeat-safe listing draft update by `sellerLeadId`
- seller-token-aware portal loading

## Acceptance

- [x] Seller lead list and detail routes are registered.
- [x] Seller lead workspace exposes seller actions, journey anchors, and onboarding editor.
- [x] Seller onboarding public and mobile token routes are registered.
- [x] Seller onboarding demo token is stable.
- [x] Seller portal selling routes are registered.
- [x] Seller portal demo token is stable.
- [x] Seller onboarding captures identity, legal, ownership, FICA, bond, occupancy, property, and disclosure facts through canonical fact tests.
- [x] Seller onboarding scenario matrix covers South African seller branches.
- [x] Seller onboarding completion updates an existing linked listing draft before creating a new one.
- [x] Seller portal alignment keeps seller onboarding tokens bound to seller context.

## Exit Criteria

Phase 2 is ready when `npm run verify:seller-side-phase2-lead-onboarding` reports:

- status: `READY`
- static blockers: `0`
- command blockers: `0`

## Verification Result

Final local verification on 2026-07-11:

- status: `READY`
- static checks passed: `15`
- static blockers: `0`
- command checks passed: `7`
- command blockers: `0`
- production build: passed

The build still reports existing manual chunk/circular dependency warnings; these remain tracked as performance hardening rather than Phase 2 launch blockers.

## Deferred To Later Phases

- Browser rendering for seller lead, onboarding, and seller portal routes is deferred to Phase 5 public/authenticated browser smoke automation.
- Private listing, mandate, document promotion, offer conversion, transaction routing, finance, transfer, and registration gates remain in later phases.
- Signed-mandate fallback listing creation still needs Phase 3 coverage for `branch_id` and historical attribution preservation.

## Phase 2 Decision

Decision: GO TO PHASE 3 once the Phase 2 gate reports `READY`.
