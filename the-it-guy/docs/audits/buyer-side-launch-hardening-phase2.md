# Buyer-Side Launch Hardening Phase 2

Implemented on 2026-07-11.

## Goal

Implement the buyer-side RLS and cross-workspace access probe harness for the launch journey from buyer lead to registration.

Phase 2 verifies that raw internal database access is scoped correctly across buyer, assigned agent, branch manager, transfer attorney, bond user, and unrelated user personas. Token-scoped buyer offer/onboarding/portal access remains in Phase 3 through Phase 5.

## Commands

Local contract verification:

```bash
npm run verify:buyer-side-phase2-rls-access
```

Static-only preflight:

```bash
node scripts/buyer-side-phase2-rls-access-probes.mjs --static-only
```

Strict live staging RLS evidence:

```bash
node scripts/buyer-side-phase2-rls-access-probes.mjs --live --confirm-staging --require-live
```

## Persona Access Matrix

| Persona | Lead | Offer | Transaction | Docs | Workflow/activity | Expected boundary |
| --- | --- | --- | --- | --- | --- | --- |
| Buyer | Denied | Denied | Denied | Denied | Denied | Buyer access must stay token-scoped until portal/token phases prove it. |
| Assigned agent | Allowed | Allowed | Allowed | Allowed | Allowed | Assigned internal owner can operate the buyer transaction. |
| Branch manager | Allowed | Allowed | Allowed | Allowed | Allowed | Branch oversight can access branch-scoped buyer transaction surfaces. |
| Transfer attorney | Denied | Denied | Allowed | Allowed | Allowed | Attorney can operate transaction/matter surfaces without seeing lead pipeline rows. |
| Bond user | Denied | Denied | Allowed | Allowed | Allowed | Bond user can access finance/document transaction surfaces without seeing lead pipeline rows. |
| Unrelated user | Denied | Denied | Denied | Denied | Denied | Cross-workspace leakage must be blocked. |

## Live Probe Surfaces

- `leads`
- `offers`
- `transactions`
- `transaction_participants`
- `transaction_role_players`
- `document_requests`
- `documents`
- `transaction_workflow_events`
- `transaction_events`
- `transaction_comments`

Optional surfaces such as comments, transaction events, roleplayers, workflow events, and documents may produce warnings when the staging fixture has no rows. Required surfaces for allowed internal users are buyer lead, accepted offer, transaction, and the configured buyer document request.

## Static Policy Contracts

Phase 2 gates these policy contracts before any live probing:

- Transaction spine resolver uses current ownership, assignment, participants, roleplayers, bond applications, and support delegation.
- Transaction select/update policies defer to `bridge_can_access_transaction_spine`.
- Buyer lead policies are scoped by organisation admin, assigned user, assigned agent, assigned email, and support scopes.
- Offer rows are member-scoped, while public token policies are status and expiry constrained.
- Transaction participants, roleplayers, events, assignments, and bond applications inherit transaction-spine RLS.
- Buyer document requests and documents inherit transaction-spine RLS.
- Workflow events inherit transaction-spine RLS.
- Transaction comments are included in broad demo-grant cleanup and are probed live when present.

## Acceptance

- [x] Phase 2 harness is implemented.
- [x] Phase 2 local contract command is exposed.
- [x] Phase 2 static policy contracts are gated.
- [x] Phase 2 reuses Phase 1 as a prerequisite.
- [x] Phase 2 live command is read-only and staging-confirmed.
- [ ] Buyer, assigned agent, branch manager, attorney, bond, and unrelated staging personas are supplied.
- [ ] Live staging RLS evidence passes with `READY_LIVE` or `READY_LIVE_WITH_WARNINGS`.

## Current Result

2026-07-11 local contract result: `READY_LOCAL_CONTRACT`.

- Static checks: 15 passed, 0 blocked.
- Local prerequisite commands: 1 passed, 0 blocked.
- Commands run:
  - `node scripts/buyer-side-phase2-rls-access-probes.mjs --static-only`
  - `npm run verify:buyer-side-phase2-rls-access`

2026-07-11 strict live result: `BLOCKED` as expected until live fixture values and persona credentials are supplied.

- Command run: `node scripts/buyer-side-phase2-rls-access-probes.mjs --live --confirm-staging --require-live --skip-prerequisites`
- Blocking configuration still required:
  - `BUYER_SIDE_STAGING_BUYER_LEAD_ID`
  - `BUYER_SIDE_STAGING_OFFER_ID`
  - `BUYER_SIDE_STAGING_TRANSACTION_ID`
  - `BUYER_SIDE_STAGING_DOCUMENT_REQUEST_ID`
  - `BUYER_SIDE_STAGING_BUYER_EMAIL`
  - `BUYER_SIDE_STAGING_BUYER_PASSWORD`
  - `BUYER_SIDE_STAGING_AGENT_EMAIL`
  - `BUYER_SIDE_STAGING_AGENT_PASSWORD`
  - `BUYER_SIDE_STAGING_BRANCH_MANAGER_EMAIL`
  - `BUYER_SIDE_STAGING_BRANCH_MANAGER_PASSWORD`
  - `BUYER_SIDE_STAGING_ATTORNEY_EMAIL`
  - `BUYER_SIDE_STAGING_ATTORNEY_PASSWORD`
  - `BUYER_SIDE_STAGING_BOND_EMAIL`
  - `BUYER_SIDE_STAGING_BOND_PASSWORD`
  - `BUYER_SIDE_STAGING_UNRELATED_EMAIL`
  - `BUYER_SIDE_STAGING_UNRELATED_PASSWORD`

Live staging RLS evidence is still required because real persona credentials and staging fixture IDs are not stored in the repository.

## Phase 2 Decision

Decision: PHASE 2 HARNESS IMPLEMENTED; LIVE RLS EVIDENCE REQUIRED.
