# Domain API Split Phase 2: Import Inventory

Date: 2026-07-31

## Purpose

This phase identifies the import edges that keep follow-up route chunks coupled to the giant shared frontend API module or other heavy carrier services. No domain extraction happens in this phase. The output is the map used to decide what to split first and what must remain untouched until a safer phase.

The machine-readable snapshot is stored in:

- `docs/domain-import-inventory-phase2.json`

## Commands

```bash
npm run audit:domain-import-inventory
npm run test:domain-import-inventory
```

Inspect one domain:

```bash
node scripts/domain-import-inventory.mjs --domain agent-listing-detail
```

Full JSON output:

```bash
node scripts/domain-import-inventory.mjs --json
```

## Tracked Heavy Modules

| Module | Why It Is Tracked |
| --- | --- |
| `src/lib/api.js` | Giant shared frontend API module that builds into the oversized `api-*.js` chunk. |
| `src/services/privateListingService.js` | Large listing workflow service that carries seller portal, listing, document, and notification behavior. |
| `src/lib/agencyPipelineService.js` | Broad agency pipeline service with CRM, appointments, tasks, metrics, and reporting behavior. |

## Current Inventory

| Domain | Entry | Static tracked imports | Dynamic tracked imports | Primary coupling |
| --- | --- | ---: | ---: | --- |
| Dashboard | `src/pages/Dashboard.jsx` | 0 | 2 | Clean static control; lazy-only heavy edges remain acceptable. |
| Client Portal | `src/pages/ClientPortal.jsx` | 6 | 1 | Direct `src/lib/api.js` plus direct/private-listing service edges. |
| Attorney Transaction Detail | `src/pages/AttorneyTransactionDetail.jsx` | 3 | 2 | Direct `src/lib/api.js`, plus API via matter accounts and finance services. |
| Pipeline | `src/pages/Pipeline.jsx` | 11 | 2 | Direct API, nested document/onboarding API, private listing, and agency pipeline. |
| Agent Listing Detail | `src/pages/AgentListingDetail.jsx` | 11 | 1 | Direct private listing and agency pipeline; shared API is carried through notifications. |
| Unit Detail | `src/pages/UnitDetail.jsx` | 8 | 1 | Direct API plus transaction panels and transaction finance service. |

## Domain Findings

### Agent Listing Detail

This remains the best first follow-up domain because the route has no direct static `src/lib/api.js` import, but it still carries the API chunk through service coupling.

Static tracked modules:

- `src/services/privateListingService.js`
  - Direct from `src/pages/AgentListingDetail.jsx`.
  - Also carried through `src/lib/buyerLifecycleService.js`, `src/services/leadListingInterestService.js`, `src/services/leadSuggestionService.js`, and `src/services/sellerPortalActivationService.js`.
- `src/lib/agencyPipelineService.js`
  - Direct from `src/pages/AgentListingDetail.jsx`.
  - Also carried through `src/lib/agencyCrmRepository.js`, `src/services/leadAnalyticsService.js`, `src/services/leadListingInterestService.js`, and `src/services/showDayLeadCaptureService.js`.
- `src/lib/api.js`
  - Transitive through `src/services/clientPortalNotificationsService.js`.

Recommended split boundary:

- Create narrow read-only/detail facades for listing detail, listing media/documents, appointment summary, and CRM lead links.
- Defer seller portal mutations, seller onboarding send flows, distribution sync, offer conversion, and document upload mutations until a separate mutation facade is explicitly needed.

### Client Portal

Client Portal has the broadest external-user blast radius and should only move after Agent Listing Detail proves the pattern.

Static tracked modules:

- `src/lib/api.js`
  - Direct from `src/pages/ClientPortal.jsx`.
  - Also carried through `src/services/clientPortalNotificationsService.js` and `src/services/clientPortalWorkspaceService.js`.
- `src/services/privateListingService.js`
  - Direct from `src/pages/ClientPortal.jsx`.
  - Also carried through `src/lib/buyerLifecycleService.js` and `src/services/clientPortalWorkspaceService.js`.

Recommended split boundary:

- First split token workspace reads, notification reads, document signed URL reads, and seller portal session reads.
- Leave uploads, bond application submission, password recovery, service reviews, issue submission, seller interest requests, and co-applicant invitation flows until read paths are proven clean.

### Unit Detail

Unit Detail is tightly coupled to transaction workspace behavior and should be split after listing detail patterns are available.

Static tracked modules:

- `src/lib/api.js`
  - Direct from `src/pages/UnitDetail.jsx`.
  - Also carried through `src/components/AlterationRequestsPanel.jsx`, `src/components/AttorneyCloseoutPanel.jsx`, `src/components/ClientIssuesPanel.jsx`, `src/core/documents/packetService.js`, `src/services/clientPortalNotificationsService.js`, and `src/services/transactionFinanceService.js`.
- `src/services/privateListingService.js`
  - Transitive through `src/lib/buyerLifecycleService.js`.

Recommended split boundary:

- Start with shell/detail reads: `fetchUnitWorkspaceShell`, `fetchUnitDetail`, rollup reads, and workflow snapshot reads.
- Defer transaction deletion, document upload, finance mutations, alteration writes, closeout writes, and client issue sign-off until a follow-up mutation pass.

### Attorney Transaction Detail

This is mutation-heavy and attorney-facing, so split by functional lane rather than by file size.

Static tracked modules:

- `src/lib/api.js`
  - Direct from `src/pages/AttorneyTransactionDetail.jsx`.
  - Also carried through `src/components/AttorneyMatterAccountsPanel.jsx` and `src/services/transactionFinanceService.js`.
- `src/lib/agencyPipelineService.js`
  - Dynamic only through appointment dashboard behavior.

Recommended split boundary:

- Extract transaction core reads, rollup reads, matter financial read model, and final report reads first.
- Defer registration, archiving, roleplayer save, document uploads, finance writes, bond application mutations, and workflow actions.

### Pipeline

Pipeline has the widest surface and should stay last despite high measured bundle impact.

Static tracked modules:

- `src/lib/api.js`
  - Direct from `src/pages/Pipeline.jsx`.
  - Also carried through `src/core/documents/packetService.js`, `src/lib/onboardingLinks.js`, and `src/services/clientPortalNotificationsService.js`.
- `src/services/privateListingService.js`
  - Through `src/pages/agency/AgencyPipelinePage.jsx`, `src/lib/buyerLifecycleService.js`, and `src/services/leadListingInterestService.js`.
- `src/lib/agencyPipelineService.js`
  - Through `src/pages/agency/AgencyPipelinePage.jsx`, `src/lib/agencyCrmRepository.js`, and `src/services/leadListingInterestService.js`.

Recommended split boundary:

- Split dashboard/list read models before board mutations.
- Avoid touching agency lead CRUD, appointment reconciliation, seller onboarding, private listing activation, and document generation until the smaller domains are clean.

## Phase 2 Exit Criteria

- `scripts/domain-import-inventory.mjs` exists and can be rerun.
- `npm run audit:domain-import-inventory` reports all six domains.
- `npm run test:domain-import-inventory` keeps Dashboard static-clean.
- Current tracked imports are captured in JSON and Markdown.
- No extraction work has been mixed into this phase.
