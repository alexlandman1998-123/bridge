# Buyer-Side Launch Hardening Phase 1

Implemented on 2026-07-11.

## Goal

Implement the live staging buyer transaction smoke harness for the core buyer launch journey:

buyer lead -> accepted offer -> transaction -> buyer onboarding -> finance/documents -> registration-ready or registered evidence.

Phase 1 is read-only by default. It does not create or mutate staging data. A live run requires explicit `--live --confirm-staging --require-live` flags and the fixture IDs locked in Phase 0.

## Commands

Local contract verification:

```bash
npm run verify:buyer-side-phase1-live-staging-transaction
```

Static-only preflight:

```bash
node scripts/buyer-side-phase1-live-staging-transaction-gate.mjs --static-only
```

Strict live staging evidence:

```bash
node scripts/buyer-side-phase1-live-staging-transaction-gate.mjs --live --confirm-staging --require-live
```

## Live Staging Evidence Contract

The live command requires these staging fixture values:

- `BUYER_SIDE_LAUNCH_BASE_URL`
- `BUYER_SIDE_LAUNCH_SUPABASE_PROJECT_REF`
- `SUPABASE_URL` or `VITE_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `BUYER_SIDE_STAGING_BUYER_LEAD_ID`
- `BUYER_SIDE_STAGING_LISTING_ID`
- `BUYER_SIDE_STAGING_OFFER_ID`
- `BUYER_SIDE_STAGING_TRANSACTION_ID`
- `BUYER_SIDE_STAGING_ONBOARDING_TOKEN`
- `BUYER_SIDE_STAGING_PORTAL_TOKEN`
- `BUYER_SIDE_STAGING_DOCUMENT_REQUEST_ID`

The persona credentials from Phase 0 are reported in Phase 1 but only become hard requirements for the authenticated RLS matrix in Phase 2.

## Read-Only Live Gate Checks

The live gate verifies:

- The configured Supabase project ref is the approved staging project.
- The configured buyer lead exists and is buyer-scoped when classification is visible.
- The configured offer exists and is accepted or converted.
- The configured transaction exists.
- The transaction preserves the configured listing.
- The transaction preserves the configured buyer lead.
- The transaction preserves the configured accepted offer.
- The transaction has buyer contact or buyer identity context.
- The transaction has branch and agent assignment context.
- The transaction has buyer finance type and routing evidence.
- The transaction onboarding token matches the configured onboarding token.
- The buyer portal token resolves to the configured transaction.
- The configured buyer document request belongs to the configured transaction.
- The transaction is registration-ready or registered by stage, evidence fields, or workflow rows.

## Acceptance

- [x] Phase 1 harness is implemented.
- [x] Phase 1 local contract command is exposed.
- [x] Phase 1 static contract is gated.
- [x] Phase 1 reuses Phase 0 and the buyer local diagnostic as prerequisites.
- [x] Phase 1 live command is read-only and staging-confirmed.
- [ ] Live staging fixture IDs and service-role credentials are supplied.
- [ ] Live staging buyer transaction evidence passes with `READY_LIVE` or `READY_LIVE_WITH_WARNINGS`.

## Current Result

2026-07-11 local contract result: `READY_LOCAL_CONTRACT`.

- Static checks: 8 passed, 0 blocked.
- Local prerequisite commands: 2 passed, 0 blocked.
- Commands run:
  - `node scripts/buyer-side-phase1-live-staging-transaction-gate.mjs --static-only`
  - `npm run verify:buyer-side-phase1-live-staging-transaction`

2026-07-11 strict live result: `BLOCKED` as expected until live fixture values are supplied.

- Command run: `node scripts/buyer-side-phase1-live-staging-transaction-gate.mjs --live --confirm-staging --require-live --skip-local-diagnostic`
- Blocking configuration still required:
  - `BUYER_SIDE_LAUNCH_BASE_URL`
  - `BUYER_SIDE_LAUNCH_SUPABASE_PROJECT_REF`
  - `BUYER_SIDE_STAGING_BUYER_LEAD_ID`
  - `BUYER_SIDE_STAGING_LISTING_ID`
  - `BUYER_SIDE_STAGING_OFFER_ID`
  - `BUYER_SIDE_STAGING_TRANSACTION_ID`
  - `BUYER_SIDE_STAGING_ONBOARDING_TOKEN`
  - `BUYER_SIDE_STAGING_PORTAL_TOKEN`
  - `BUYER_SIDE_STAGING_DOCUMENT_REQUEST_ID`

Live staging evidence is still required because real staging fixture IDs and credentials are not stored in the repository.

## Phase 1 Decision

Decision: PHASE 1 HARNESS IMPLEMENTED; LIVE STAGING EVIDENCE REQUIRED.
