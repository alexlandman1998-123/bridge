# Seller-Side Transaction Launch Phase 4

Implemented on 2026-07-11.

## Goal

Certify the transaction boundary after listing and mandate conversion: accepted offer to transaction, seller document promotion, transaction routing, finance/documents command surfaces, and seller-visible activity history.

Phase 4 focuses on:

- accepted offer conversion into the transaction spine
- seller, buyer, property, listing, branch, agent, and participant boundary propagation
- seller listing document promotion into transaction documents
- cash, bond, and hybrid transaction routing profiles
- finance tab and document command-centre readiness
- transaction overview activity and structured conversation history

## Command

```bash
npm run verify:seller-side-phase4-transaction-spine
```

Static-only diagnostic mode:

```bash
node scripts/seller-side-phase4-transaction-spine-gate.mjs --static-only
```

## Gate Coverage

The Phase 4 gate runs these contract suites:

| Coverage | Command |
| --- | --- |
| Offer-to-transaction scenario matrix | `npm run test:offer-to-transaction-scenario-matrix` |
| Listing-to-transaction spine propagation | `npm run test:listing-to-transaction-routing-propagation` |
| Seller document propagation | `npm run test:seller-document-propagation` |
| Transaction routing profile | `npm run test:transaction-routing-profile` |
| Routing workflow adaptation | `npm run test:transaction-routing-workflow-adaptation` |
| Routing diagnostics | `npm run test:transaction-routing-diagnostics` |
| Finance tab launch readiness | `npm run test:finance-tab-launch-readiness` |
| Transaction documents command centre | `npm run test:transaction-documents-command-centre` |
| Transaction canonical document engine | `npm run test:transaction-canonical-document-engine` |
| Transaction overview conversation | `npm run test:transaction-overview-conversation` |
| Document request scenario matrix | `npm run test:document-request-scenario-matrix` |

The gate also performs static contract checks for:

- transaction duplicate detection retains assigned agent and assigned branch context
- accepted-offer transaction creation resolves branch context from payload, listing, lead, offer, or actor data
- transaction insert payload carries listing, buyer lead, accepted offer, seller contact, assigned agent, and assigned branch fields
- older-schema insert fallback strips optional branch and routing fields safely
- canonical offer conversion passes seller contact, seller lead provenance, branch, assignment branch, and routing profile context
- seller document promotion remains idempotent on transaction, source, and source document
- transaction workspaces attempt pending seller-document promotion while respecting external viewer role
- documents, finance, overview activity, and conversation surfaces remain mounted

## Runtime Fixes

Phase 4 fixed three transaction propagation gaps:

- `transactionLifecycleService` now resolves transaction branch context and persists it as `assigned_branch_id` on local/demo and Supabase transaction creation paths.
- Canonical accepted-offer conversion now passes seller contact, seller lead provenance, listing branch, assignment branch, and richer listing context into transaction creation.
- Transaction insert responses now merge optional persisted spine fields back into the runtime transaction row when the modern insert variant succeeds.

## Acceptance

- [x] Accepted offer conversion preserves seller, buyer, property, listing, branch, agent, and participant boundary context.
- [x] Seller uploaded documents promote to transaction documents idempotently.
- [x] Cash, bond, and hybrid routing profiles resolve transaction workflow requirements.
- [x] Finance tab and document command centre render expected transaction state.
- [x] Seller-visible activity and structured conversation history render in the transaction workspace.

## Verification Result

Final local verification on 2026-07-11:

- status: `READY`
- static checks passed: `7`
- static blockers: `0`
- command checks passed: `11`
- command blockers: `0`

## Deferred To Later Phases

- Transfer and registration workflow gates remain in the workflow/registration phase.
- RLS and token-scoped transaction visibility remain in the security phase.
- Public and authenticated browser smoke automation remains in the browser smoke phase.

## Phase 4 Decision

Decision: GO TO PHASE 5 once the Phase 4 gate reports `READY`.
