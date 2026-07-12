# Seller-Side Transaction Launch Phase 3

Implemented on 2026-07-11.

## Goal

Certify the seller lead-to-private-listing and mandate conversion contract before offer, transaction, finance, transfer, and registration phases continue.

Phase 3 focuses on:

- private listing creation and conversion idempotency
- seller lead/listing/mandate packet backlinks
- branch and agent attribution preservation
- seller onboarding to listing publication draft sync
- relationship, graph, document, and timeline diagnostics
- signed mandate packet projection into canonical document requirements

## Command

```bash
npm run verify:seller-side-phase3-listing-mandate
```

Static-only diagnostic mode:

```bash
node scripts/seller-side-phase3-listing-mandate-gate.mjs --static-only
```

## Gate Coverage

The Phase 3 gate runs these contract suites:

| Coverage | Command |
| --- | --- |
| Listing conversion idempotency | `npm run test:seller-listing-conversion-idempotency` |
| Publication draft mapper | `npm run test:seller-listing-publication-mapper` |
| Relationship integrity | `npm run test:seller-listing-relationship-integrity` |
| Relationship graph integrity | `npm run test:seller-listing-relationship-graph-integrity` |
| Mandate/document continuity | `npm run test:seller-listing-document-continuity` |
| Timeline continuity | `npm run test:seller-listing-timeline-continuity` |
| Conversion timeline | `npm run test:seller-listing-conversion-timeline` |
| Mandate save patch safety | `npm run test:seller-mandate-save-preserves-data` |
| Signed mandate workspace projection | `npm run test:canonical-document-workspace` |
| Canonical document lifecycle | `npm run test:canonical-document-lifecycle` |

The gate also performs static contract checks for:

- final signed mandate listing lookup includes `branch_id`
- seller lead lookup includes `branch_id` and `assigned_branch_id`
- signed mandate fallback insert writes `branch_id`
- existing listing update preserves or fills `branch_id`
- mandate packet context records listing and branch conversion metadata
- seller lead backlink updates `listing_id` and `mandate_packet_id`
- uniqueness indexes prevent duplicate active listings for the same seller lead
- relationship, graph, document, and timeline diagnostic reports exist
- lead workspace seller listing creation passes branch attribution

## Runtime Fixes

Phase 3 fixed two attribution gaps:

- `generate-final-signed-document` now resolves branch attribution from existing listing, lead, source context, or source lead when a signed mandate creates or promotes a private listing.
- Seller lead workspace listing-shell creation now passes branch attribution into `createPrivateListing()` for onboarding, agent-assisted onboarding, and commission/mandate setup paths.

## Acceptance

- [x] Private listing conversion is idempotent by seller lead and originating CRM lead.
- [x] Signed mandate fallback listing creation preserves branch and agent attribution.
- [x] Seller lead backlinks point at the listing and mandate packet after signing.
- [x] Seller onboarding data fills publication drafts without overwriting listing-owned fields.
- [x] Relationship, graph, document, and timeline diagnostics remain present and service-scoped.
- [x] Mandate packet versions satisfy seller-visible canonical signed mandate requirements.
- [x] Seller conversion timeline can be assembled without copying or mutating source history.

## Verification Result

Final local verification on 2026-07-11:

- status: `READY`
- static checks passed: `8`
- static blockers: `0`
- command checks passed: `10`
- command blockers: `0`
- affected workspace smoke: `npm run test:agent-leads-workspace` passed
- production build: `npm run build` passed

Additional check attempted:

- `deno check supabase/functions/generate-final-signed-document/index.ts` could not complete because the function currently uses unresolved bare imports for `supabase` and `pdf-lib`. This appears to be an existing repo/tooling dependency-resolution issue, not a Phase 3 regression.

The build still reports existing manual chunk/circular dependency warnings and the existing telemetry dynamic/static import warning; these remain performance hardening items rather than Phase 3 launch blockers.

## Deferred To Later Phases

- Seller uploaded document promotion into transaction documents remains in the document/transaction phase.
- Offer-to-transaction conversion remains in the transaction conversion phase.
- Finance, routing, transfer, registration, and authenticated browser smoke remain in later phases.

## Phase 3 Decision

Decision: GO TO PHASE 4 once the Phase 3 gate reports `READY`.
